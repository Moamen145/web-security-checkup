import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

// Blocked CIDR ranges (IPv4 & IPv6) to prevent SSRF and internal scanning
export const BLOCKED_CIDR_RANGES = [
  '0.0.0.0/8',          // Current network (RFC 1122)
  '10.0.0.0/8',         // Private-Use (RFC 1918)
  '100.64.0.0/10',      // Shared Address Space / Carrier Grade NAT (RFC 6598)
  '127.0.0.0/8',        // Loopback (RFC 1122)
  '169.254.0.0/16',     // Link-Local / Cloud Metadata (AWS, Azure, GCP metadata endpoints)
  '172.16.0.0/12',      // Private-Use (RFC 1918)
  '192.0.0.0/24',       // IETF Protocol Assignments (RFC 6890)
  '192.0.2.0/24',       // Documentation / TEST-NET-1 (RFC 5737)
  '192.88.99.0/24',     // 6to4 Relay Anycast (RFC 7526)
  '192.168.0.0/16',     // Private-Use (RFC 1918)
  '198.18.0.0/15',      // Benchmarking (RFC 2544)
  '198.51.100.0/24',    // Documentation / TEST-NET-2 (RFC 5737)
  '203.0.113.0/24',     // Documentation / TEST-NET-3 (RFC 5737)
  '224.0.0.0/4',        // Multicast (RFC 5771)
  '240.0.0.0/4',        // Reserved for Future Use (RFC 1112)
  '255.255.255.255/32', // Limited Broadcast
  // IPv6 Blocked Ranges
  '::1/128',            // IPv6 Loopback
  '::/128',             // Unspecified
  'fc00::/7',           // Unique Local Address (ULA)
  'fe80::/10',          // Link-Local Unicast
  '::ffff:0:0/96',      // IPv4-mapped IPv6 (must be checked as underlying IPv4)
  '2001:db8::/32',      // Documentation
];

export interface ValidatedTarget {
  hostname: string;
  resolvedIp: string;
  allIps: string[];
}

/**
 * Validates domain and resolves to a verified public IP address.
 * Throws an error if domain syntax is invalid, unresolvable, or points to private/loopback/cloud metadata IP.
 */
export async function validateAndResolveTarget(hostname: string): Promise<ValidatedTarget> {
  const cleanHostname = hostname.trim().toLowerCase();

  // 1. Strict RFC 1123 Hostname Validation
  const fqdnRegex = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})+$/;
  if (!fqdnRegex.test(cleanHostname)) {
    throw new Error(`Invalid domain format: "${cleanHostname}". Must be a valid fully-qualified domain name.`);
  }

  // 2. Reject disallowed TLDs and localhost
  if (
    cleanHostname === 'localhost' ||
    cleanHostname.endsWith('.local') ||
    cleanHostname.endsWith('.internal') ||
    cleanHostname.endsWith('.lan') ||
    cleanHostname.endsWith('.test') ||
    cleanHostname.endsWith('.example') ||
    cleanHostname.endsWith('.arpa')
  ) {
    throw new Error(`Domain "${cleanHostname}" belongs to a restricted or internal namespace.`);
  }

  // 3. Resolve A and AAAA records using system/configured DNS
  let ipv4List: string[] = [];
  let ipv6List: string[] = [];

  try {
    ipv4List = await dns.resolve4(cleanHostname);
  } catch (err: any) {
    if (err.code !== 'ENODATA' && err.code !== 'ENOTFOUND') {
      // transient or other DNS error
    }
  }

  try {
    ipv6List = await dns.resolve6(cleanHostname);
  } catch {
    // IPv6 may not be configured on domain
  }

  const allIps = [...ipv4List, ...ipv6List];
  if (allIps.length === 0) {
    throw new Error(`Domain "${cleanHostname}" could not be resolved to any public IP address.`);
  }

  // 4. Validate each resolved IP address against blacklisted CIDR ranges
  for (const ipStr of allIps) {
    verifyPublicIp(ipStr);
  }

  // Choose the first valid IPv4 address (or IPv6 if IPv4 absent)
  const primaryIp = ipv4List[0] || ipv6List[0];

  return {
    hostname: cleanHostname,
    resolvedIp: primaryIp,
    allIps,
  };
}

/**
 * Checks an individual IP string against blocked CIDRs.
 * Throws an error if the IP is private, loopback, or metadata.
 */
export function verifyPublicIp(ipStr: string): void {
  let addr: ipaddr.IPv4 | ipaddr.IPv6;

  try {
    addr = ipaddr.parse(ipStr);
  } catch {
    throw new Error(`Malformed IP address resolved: ${ipStr}`);
  }

  // If IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1), unmap to IPv4
  if (addr.kind() === 'ipv6' && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
    addr = (addr as ipaddr.IPv6).toIPv4Address();
  }

  for (const cidr of BLOCKED_CIDR_RANGES) {
    try {
      const parsedRange = ipaddr.parseCIDR(cidr);
      if (addr.kind() === parsedRange[0].kind()) {
        if (addr.match(parsedRange)) {
          throw new Error(`Access denied: Target resolves to protected/private IP range (${ipStr} matches ${cidr}).`);
        }
      }
    } catch (e: any) {
      if (e.message?.startsWith('Access denied:')) {
        throw e;
      }
    }
  }
}
