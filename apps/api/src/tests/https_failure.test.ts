import { describe, it } from 'node:test';
import assert from 'node:assert';
import { computeSecurityScore } from '../scanner/engine/scoring.engine.js';
import { runHeadersCheck } from '../scanner/checks/headers.check.js';
import { Finding } from '@wsc/shared';

describe('BUG-02: HTTPS Failure Score Masking Prevention', () => {
  it('HTTPS connection failure should mark check status as ERROR and record error evidence', async () => {
    // Attempt to run check against non-routable / unreachable test domain
    const result = await runHeadersCheck('192.0.2.1'); // TEST-NET-1 (non-routable/rejected by safeFetch)
    
    assert.strictEqual(result.status, 'ERROR');
    assert.strictEqual(result.findings.length, 0, 'Must NOT fabricate findings for unreachable target');
    assert.ok(result.error || result.evidence.error, 'Error message must be preserved');
    assert.strictEqual(result.evidence.unavailable, true, 'Check must be flagged as unavailable');
  });

  it('HTTPS failure must NOT produce a false 100% category score in scoring engine', () => {
    // When headers check had an ERROR (unavailable):
    const checkResults = [
      {
        checkModule: 'SECURITY_HEADERS',
        status: 'ERROR',
        error: 'Target unreachable over HTTPS',
        rawEvidence: { unavailable: true },
      },
      {
        checkModule: 'TLS_HTTPS',
        status: 'PASS',
        rawEvidence: {},
      },
    ];

    const scoreResult = computeSecurityScore([], checkResults);

    // Verify SECURITY_HEADERS category does NOT get a false 100% score
    const headerCategory = scoreResult.categoryScores.SECURITY_HEADERS;
    assert.notStrictEqual(
      headerCategory.score,
      100,
      'A failed/unavailable header check must never be awarded a 100% score'
    );
    assert.strictEqual(headerCategory.score, null, 'Unavailable check score should be null');
    assert.strictEqual(headerCategory.status, 'ERROR');
    assert.strictEqual(headerCategory.count, 0);
  });

  it('Successful checks must retain their current scoring behavior when checkResults are passed', () => {
    const checkResults = [
      {
        checkModule: 'SECURITY_HEADERS',
        status: 'PASS',
        rawEvidence: {},
      },
      {
        checkModule: 'TLS_HTTPS',
        status: 'PASS',
        rawEvidence: {},
      },
    ];

    const scoreResult = computeSecurityScore([], checkResults);

    assert.strictEqual(scoreResult.categoryScores.SECURITY_HEADERS.score, 100);
    assert.strictEqual(scoreResult.categoryScores.SECURITY_HEADERS.status, 'PASS');
    assert.strictEqual(scoreResult.score, 100);
    assert.strictEqual(scoreResult.grade, 'A');
  });

  it('Successful checks with findings must correctly calculate deductions', () => {
    const finding: Finding = {
      id: 'f-1',
      assessmentId: 'a-1',
      ruleId: 'HDR-MISSING-HSTS',
      category: 'SECURITY_HEADERS',
      title: 'Missing HSTS',
      severity: 'HIGH',
      description: 'HSTS is missing',
      whyItMatters: 'why',
      potentialImpact: 'impact',
      evidence: {},
      recommendation: 'fix',
      scoreDeduction: 15,
      createdAt: new Date().toISOString(),
      referenceUrl: 'https://example.com',
    };

    const checkResults = [
      {
        checkModule: 'SECURITY_HEADERS',
        status: 'WARN',
        rawEvidence: {},
      },
    ];

    const scoreResult = computeSecurityScore([finding], checkResults);

    assert.strictEqual(scoreResult.categoryScores.SECURITY_HEADERS.score, 85);
    assert.strictEqual(scoreResult.score, 85);
    assert.strictEqual(scoreResult.categoryScores.SECURITY_HEADERS.status, 'WARN');
  });
});
