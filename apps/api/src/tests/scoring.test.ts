import { describe, it } from 'node:test';
import assert from 'node:assert';
import { computeSecurityScore } from '../scanner/engine/scoring.engine.js';
import { Finding } from '@wsc/shared';

function createMockFinding(severity: Finding['severity'], deduction: number, category: Finding['category'] = 'SECURITY_HEADERS'): Finding {
  return {
    id: 'mock-id',
    assessmentId: 'mock-assessment',
    ruleId: `RULE-${severity}`,
    category,
    title: `Mock ${severity} Finding`,
    severity,
    description: 'desc',
    whyItMatters: 'matters',
    potentialImpact: 'impact',
    evidence: {},
    recommendation: 'fix',
    referenceUrl: 'https://example.com',
    scoreDeduction: deduction,
    createdAt: new Date().toISOString(),
  };
}

describe('Deterministic Scoring Engine', () => {
  it('should return a perfect 100 Grade A when there are zero findings', () => {
    const result = computeSecurityScore([]);
    assert.strictEqual(result.score, 100);
    assert.strictEqual(result.grade, 'A');
    assert.strictEqual(result.countsBySeverity.CRITICAL, 0);
  });

  it('should deduct points according to severity deductions', () => {
    // 1 High (-15) + 1 Medium (-8) = 77 (Grade C)
    const findings = [
      createMockFinding('HIGH', 15),
      createMockFinding('MEDIUM', 8),
    ];

    const result = computeSecurityScore(findings);
    assert.strictEqual(result.score, 77);
    assert.strictEqual(result.grade, 'C');
  });

  it('should enforce critical cap of 65 (Grade D) if 1 CRITICAL finding exists', () => {
    // 1 Critical finding with deduction 25. 100 - 25 = 75, but critical cap is 65!
    const findings = [createMockFinding('CRITICAL', 25, 'TLS_HTTPS')];
    const result = computeSecurityScore(findings);

    assert.strictEqual(result.score, 65);
    assert.strictEqual(result.grade, 'D');
    assert.strictEqual(result.appliedCap, 65);
  });

  it('should enforce critical cap of 40 (Grade F) if 2+ CRITICAL findings exist', () => {
    // 2 Critical findings: deductions 25 + 25 = 50. 100 - 50 = 50, but multiple critical cap is 40!
    const findings = [
      createMockFinding('CRITICAL', 25, 'TLS_HTTPS'),
      createMockFinding('CRITICAL', 25, 'DNS'),
    ];
    const result = computeSecurityScore(findings);

    assert.strictEqual(result.score, 40);
    assert.strictEqual(result.grade, 'F');
    assert.strictEqual(result.appliedCap, 40);
  });

  it('should never drop below score 0', () => {
    const findings = [
      createMockFinding('CRITICAL', 25),
      createMockFinding('CRITICAL', 25),
      createMockFinding('HIGH', 50),
      createMockFinding('HIGH', 50),
    ];

    const result = computeSecurityScore(findings);
    assert.strictEqual(result.score, 0);
    assert.strictEqual(result.grade, 'F');
  });
});
