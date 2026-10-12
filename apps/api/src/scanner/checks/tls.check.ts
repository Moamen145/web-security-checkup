import tls from 'node:tls';
import { CheckModuleExecutionResult, ScannerCheckMeta } from '@wsc/shared';
import { safeFetch } from '../network/pinned.agent.js';
import { validateAndResolveTarget } from '../network/ssrf.guard.js';
import { IScannerCheck, CheckExecutionContext } from '../engine/check.interface.js';

export async function runTlsCheck(
  domain: string,
  options?: { signal?: AbortSignal }
): Promise<CheckModuleExecutionResult> {
  const startTime = Date.now();
  if (options?.signal?.aborted) {
    throw new Error('The operation was aborted');
  }

  const findings: Array<{ ruleId: string; customDescription?: string; customEvidence?: Record<string, any> }> = [];
  const evidence: Record<string, any> = {
    domain,
    httpsSupported: false,
    httpRedirectsToHttps: false,
    certDetails: null,
    tlsProtocol: null,
    cipherSuite: null,
  };

  try {
    // 1. Check HTTP to HTTPS redirection
    try {
      const httpResult = await safeFetch(`http://${domain}`, {
        method: 'HEAD',
        maxRedirects: 3,
        signal: options?.signal,
      });
      evidence.httpStatusCode = httpResult.statusCode;
      evidence.redirectHistory = httpResult.redirectHistory;

      // Check if redirect history ends in https
      const hasHttpsRedirect = httpResult.redirectHistory.some((r) => r.location?.startsWith('https://'));
      if (hasHttpsRedirect || httpResult.finalUrl.startsWith('https://')) {
        evidence.httpRedirectsToHttps = true;
      } else {
        findings.push({
          ruleId: 'TLS-NO-REDIRECT',
          customEvidence: {
            initialUrl: `http://${domain}`,
            finalUrl: httpResult.finalUrl,
            redirects: httpResult.redirectHistory,
          },
        });
      }
    } catch (err: any) {
      if (options?.signal?.aborted || err.message === 'The operation was aborted') {
        throw err;
      }
      evidence.httpError = err.message;
      // If HTTP fails completely, note it
    }

    if (options?.signal?.aborted) {
      throw new Error('The operation was aborted');
    }

    // 2. Direct TLS Handshake on port 443
    const validated = await validateAndResolveTarget(domain);
    const tlsResult = await probeTlsCertificate(domain, validated.resolvedIp, 5000, options?.signal);

    evidence.httpsSupported = true;
    evidence.tlsProtocol = tlsResult.protocol;
    evidence.cipherSuite = tlsResult.cipher;
    evidence.certDetails = {
      subject: tlsResult.subject,
      issuer: tlsResult.issuer,
      validFrom: tlsResult.validFrom,
      validTo: tlsResult.validTo,
      daysRemaining: tlsResult.daysRemaining,
      sanList: tlsResult.sanList,
      authorized: tlsResult.authorized,
      authorizationError: tlsResult.authorizationError,
    };

    // Evaluate certificate expiration
    if (tlsResult.daysRemaining <= 0) {
      findings.push({
        ruleId: 'TLS-CERT-EXPIRED',
        customDescription: `The SSL/TLS certificate expired on ${tlsResult.validTo} (${Math.abs(tlsResult.daysRemaining)} days ago).`,
        customEvidence: evidence.certDetails,
      });
    } else if (tlsResult.daysRemaining <= 15) {
      findings.push({
        ruleId: 'TLS-EXPIRING-SOON',
        customDescription: `The certificate will expire in ${tlsResult.daysRemaining} days (on ${tlsResult.validTo}).`,
        customEvidence: evidence.certDetails,
      });
    }

    // Evaluate hostname match in SAN or CN
    const domainMatchesCert = isHostnameMatchingCert(domain, tlsResult.subject?.CN, tlsResult.sanList);
    if (!domainMatchesCert) {
      findings.push({
        ruleId: 'TLS-CERT-HOSTNAME-MISMATCH',
        customDescription: `The domain "${domain}" does not match certificate subject "${tlsResult.subject?.CN}" or SAN entries [${tlsResult.sanList?.join(', ')}].`,
        customEvidence: {
          requestedDomain: domain,
          commonName: tlsResult.subject?.CN,
          subjectAltNames: tlsResult.sanList,
        },
      });
    }

    // Evaluate obsolete TLS protocols
    if (tlsResult.protocol === 'TLSv1' || tlsResult.protocol === 'TLSv1.1') {
      findings.push({
        ruleId: 'TLS-OBSOLETE-PROTOCOL',
        customDescription: `The web server negotiated deprecated ${tlsResult.protocol}.`,
        customEvidence: { protocol: tlsResult.protocol, cipher: tlsResult.cipher },
      });
    }

    // Evaluate weak cipher suites
    const isWeakCipher = /RC4|3DES|DES|MD5|CBC|NULL|EXPORT/i.test(tlsResult.cipher || '');
    if (isWeakCipher && tlsResult.cipher) {
      findings.push({
        ruleId: 'TLS-WEAK-CIPHER',
        customDescription: `The web server negotiated deprecated or weak cipher suite "${tlsResult.cipher}".`,
        customEvidence: { cipher: tlsResult.cipher, protocol: tlsResult.protocol },
      });
    }

    // Evaluate TLS 1.3 support (informational)
    if (tlsResult.protocol === 'TLSv1.2') {
      findings.push({
        ruleId: 'TLS-NO-TLS13',
        customDescription: 'The web server negotiated TLS 1.2. Modern TLS 1.3 is recommended for lower latency and stronger cryptographic defaults.',
        customEvidence: { protocol: tlsResult.protocol },
      });
    }

    const status = findings.some((f) => f.ruleId === 'TLS-CERT-EXPIRED' || f.ruleId === 'TLS-CERT-HOSTNAME-MISMATCH')
      ? 'FAIL'
      : findings.some((f) => f.ruleId !== 'TLS-NO-TLS13')
        ? 'WARN'
        : findings.length > 0
          ? 'INFO'
          : 'PASS';

    return {
      module: 'TLS_HTTPS',
      status,
      executionTimeMs: Date.now() - startTime,
      evidence,
      findings,
    };
  } catch (err: any) {
    if (options?.signal?.aborted || err.message === 'The operation was aborted') {
      throw err;
    }
    // Port 443 unreachable or TLS handshake failed
    findings.push({
      ruleId: 'TLS-NO-HTTPS',
      customDescription: `Failed to establish secure TLS connection to ${domain}: ${err.message}`,
      customEvidence: { error: err.message },
    });

    return {
      module: 'TLS_HTTPS',
      status: 'FAIL',
      executionTimeMs: Date.now() - startTime,
      evidence: { domain, error: err.message, httpsSupported: false },
      findings,
      error: err.message,
    };
  }
}

interface TlsProbeResult {
  protocol?: string;
  cipher?: string;
  authorized: boolean;
  authorizationError?: string;
  subject: Record<string, string>;
  issuer: Record<string, string>;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  sanList: string[];
}

function probeTlsCertificate(
  hostname: string,
  ip: string,
  timeoutMs = 5000,
  signal?: AbortSignal
): Promise<TlsProbeResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let onAbort: (() => void) | null = null;
    let socket: tls.TLSSocket | null = null;

    const cleanup = () => {
      if (signal && onAbort) {
        signal.removeEventListener('abort', onAbort);
        onAbort = null;
      }
    };

    const cleanupAndReject = (err: Error) => {
      if (!settled) {
        settled = true;
        cleanup();
        if (socket && !socket.destroyed) {
          socket.destroy();
        }
        reject(err);
      }
    };

    if (signal?.aborted) {
      cleanupAndReject(new Error('The operation was aborted'));
      return;
    }

    socket = tls.connect(
      {
        host: ip,
        port: 443,
        servername: hostname,
        rejectUnauthorized: false,
        timeout: timeoutMs,
      },
      () => {
        try {
          const cert = socket!.getPeerCertificate(true);
          const cipher = socket!.getCipher();
          const protocol = socket!.getProtocol();

          if (!cert || Object.keys(cert).length === 0) {
            cleanupAndReject(new Error('No peer certificate returned by the server.'));
            return;
          }

          const validToDate = new Date(cert.valid_to);
          const now = new Date();
          const msRemaining = validToDate.getTime() - now.getTime();
          const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));

          const sanArray: string[] = [];
          if (cert.subjectaltname) {
            cert.subjectaltname.split(', ').forEach((s) => {
              sanArray.push(s.replace(/^DNS:/, '').trim());
            });
          }

          const result: TlsProbeResult = {
            protocol: protocol || undefined,
            cipher: cipher?.name,
            authorized: socket!.authorized,
            authorizationError: socket!.authorizationError ? String(socket!.authorizationError) : undefined,
            subject: cert.subject as any,
            issuer: cert.issuer as any,
            validFrom: cert.valid_from,
            validTo: cert.valid_to,
            daysRemaining,
            sanList: sanArray,
          };

          socket!.end();
          if (!settled) {
            settled = true;
            cleanup();
            resolve(result);
          }
        } catch (err: any) {
          cleanupAndReject(err);
        }
      }
    );

    if (signal) {
      onAbort = () => {
        cleanupAndReject(new Error('The operation was aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }

    socket.on('timeout', () => {
      cleanupAndReject(new Error(`TLS handshake timed out after ${timeoutMs}ms.`));
    });

    socket.on('error', (err) => {
      cleanupAndReject(err);
    });
  });
}

function isHostnameMatchingCert(domain: string, cn?: string, sanList?: string[]): boolean {
  const d = domain.toLowerCase();
  const candidates: string[] = [];
  if (cn) candidates.push(cn.toLowerCase());
  if (sanList) {
    sanList.forEach((s) => candidates.push(s.toLowerCase()));
  }

  for (const cand of candidates) {
    if (cand === d) return true;
    if (cand.startsWith('*.')) {
      const wildcardBase = cand.slice(2);
      const dotIndex = d.indexOf('.');
      if (dotIndex !== -1) {
        const subDomainBase = d.slice(dotIndex + 1);
        if (subDomainBase === wildcardBase) return true;
      }
    }
  }

  return false;
}

export class TlsCheck implements IScannerCheck {
  readonly meta: ScannerCheckMeta = {
    id: 'tls',
    category: 'TLS_HTTPS',
    name: 'TLS & Transport Encryption',
    description: 'Inspects certificate validity, protocols, and HTTP-to-HTTPS redirect.',
    timeoutMs: 10000,
  };

  async execute(context: CheckExecutionContext): Promise<CheckModuleExecutionResult> {
    return runTlsCheck(context.target.hostname, { signal: context.signal });
  }
}
