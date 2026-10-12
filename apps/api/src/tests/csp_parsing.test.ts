import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseCspDirectives, evaluateCspHeader } from '../scanner/checks/headers.check.js';

describe('BUG-03: CSP unsafe-inline Directive-Scoped Analysis', () => {
  it('should parse CSP directives accurately into names and tokens', () => {
    const csp = "default-src 'self'; script-src https://cdn.example.com 'unsafe-inline'; style-src 'self'; frame-ancestors 'none'";
    const parsed = parseCspDirectives(csp);

    assert.strictEqual(parsed.has('default-src'), true);
    assert.deepStrictEqual(parsed.get('default-src'), ["'self'"]);

    assert.strictEqual(parsed.has('script-src'), true);
    assert.deepStrictEqual(parsed.get('script-src'), ['https://cdn.example.com', "'unsafe-inline'"]);

    assert.strictEqual(parsed.has('style-src'), true);
    assert.deepStrictEqual(parsed.get('style-src'), ["'self'"]);

    assert.strictEqual(parsed.has('frame-ancestors'), true);
    assert.deepStrictEqual(parsed.get('frame-ancestors'), ["'none'"]);
  });

  it("should flag HDR-INSECURE-CSP when script-src contains 'unsafe-inline'", () => {
    const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'";
    const { findings } = evaluateCspHeader(csp);

    const insecureCsp = findings.find((f) => f.ruleId === 'HDR-INSECURE-CSP');
    assert.ok(insecureCsp, 'HDR-INSECURE-CSP finding should be present');
    assert.strictEqual(insecureCsp.customEvidence?.evaluatedDirective, 'script-src');
    assert.strictEqual(insecureCsp.customEvidence?.hasUnsafeInline, true);
  });

  it("should flag HDR-INSECURE-CSP when default-src contains 'unsafe-inline' and script-src is omitted", () => {
    const csp = "default-src 'self' 'unsafe-inline'; style-src 'self'";
    const { findings } = evaluateCspHeader(csp);

    const insecureCsp = findings.find((f) => f.ruleId === 'HDR-INSECURE-CSP');
    assert.ok(insecureCsp, 'HDR-INSECURE-CSP finding should be present when default-src allows unsafe-inline');
    assert.strictEqual(insecureCsp.customEvidence?.evaluatedDirective, 'default-src');
    assert.strictEqual(insecureCsp.customEvidence?.hasUnsafeInline, true);
  });

  it("should NOT flag HDR-INSECURE-CSP when only style-src contains 'unsafe-inline'", () => {
    const csp = "default-src 'self'; script-src 'self' https://trusted.cdn.com; style-src 'self' 'unsafe-inline'";
    const { findings } = evaluateCspHeader(csp);

    const insecureCsp = findings.find((f) => f.ruleId === 'HDR-INSECURE-CSP');
    assert.strictEqual(insecureCsp, undefined, 'style-src unsafe-inline must NOT trigger HDR-INSECURE-CSP script finding');
  });

  it("should NOT flag HDR-INSECURE-CSP when default-src allows unsafe-inline BUT script-src explicitly restricts it to safe sources", () => {
    const csp = "default-src 'self' 'unsafe-inline'; script-src 'self' https://apis.google.com; style-src 'self' 'unsafe-inline'";
    const { findings } = evaluateCspHeader(csp);

    const insecureCsp = findings.find((f) => f.ruleId === 'HDR-INSECURE-CSP');
    assert.strictEqual(insecureCsp, undefined, 'Explicit script-src overriding default-src must not trigger finding');
  });

  it('should flag HDR-INSECURE-CSP when script-src contains wildcard (*)', () => {
    const csp = "default-src 'self'; script-src 'self' *";
    const { findings } = evaluateCspHeader(csp);

    const insecureCsp = findings.find((f) => f.ruleId === 'HDR-INSECURE-CSP');
    assert.ok(insecureCsp, 'Wildcard in script-src must trigger HDR-INSECURE-CSP');
    assert.strictEqual(insecureCsp.customEvidence?.hasWildcardScript, true);
  });

  it('should properly detect frame-ancestors in CSP header', () => {
    const csp = "default-src 'self'; frame-ancestors 'self' https://partner.example.com";
    const { hasFrameAncestors } = evaluateCspHeader(csp);

    assert.strictEqual(hasFrameAncestors, true);
  });
});
