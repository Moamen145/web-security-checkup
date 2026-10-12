import { describe, it } from 'node:test';
import assert from 'node:assert';
import { verifyPublicIp, validateAndResolveTarget } from '../scanner/network/ssrf.guard.js';

describe('SSRF Guard & IP Blacklist Protection', () => {
  const forbiddenIps = [
    '127.0.0.1',        // Loopback
    '127.0.1.1',        // Loopback variant
    '10.0.0.1',         // Private Class A
    '10.255.255.254',   // Private Class A
    '172.16.0.1',       // Private Class B
    '172.31.255.255',   // Private Class B
    '192.168.1.1',      // Private Class C
    '192.168.0.100',    // Private Class C
    '169.254.169.254',  // AWS / GCP / Azure Cloud Metadata
    '169.254.1.1',      // Link-local
    '0.0.0.0',          // Current network
    '224.0.0.1',        // Multicast
    '::1',              // IPv6 Loopback
    'fe80::1',          // IPv6 Link-local
    'fc00::1',          // IPv6 Unique Local
    '::ffff:127.0.0.1', // IPv4-mapped IPv6 loopback
    '::ffff:10.0.0.1',  // IPv4-mapped IPv6 private
  ];

  for (const ip of forbiddenIps) {
    it(`should strictly reject forbidden IP: ${ip}`, () => {
      assert.throws(
        () => verifyPublicIp(ip),
        /Access denied: Target resolves to protected\/private IP range/,
        `Expected ${ip} to be rejected`
      );
    });
  }

  it('should allow valid public IPv4 addresses', () => {
    assert.doesNotThrow(() => verifyPublicIp('1.1.1.1'));
    assert.doesNotThrow(() => verifyPublicIp('8.8.8.8'));
    assert.doesNotThrow(() => verifyPublicIp('93.184.216.34'));
  });

  it('should reject invalid hostname formats', async () => {
    await assert.rejects(
      () => validateAndResolveTarget('http://example.com'),
      /Invalid domain format/
    );

    await assert.rejects(
      () => validateAndResolveTarget('example.com/path'),
      /Invalid domain format/
    );

    await assert.rejects(
      () => validateAndResolveTarget('localhost'),
      /Invalid domain format|belongs to a restricted or internal namespace/
    );

    await assert.rejects(
      () => validateAndResolveTarget('server.local'),
      /Invalid domain format|belongs to a restricted or internal namespace/
    );
  });
});
