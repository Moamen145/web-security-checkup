import { describe, it } from 'node:test';
import assert from 'node:assert';
import { normalizeCheckFindings } from '../scanner/engine/normalizer.js';
import { computeSecurityScore } from '../scanner/engine/scoring.engine.js';
import { CheckModuleExecutionResult, RULES } from '@wsc/shared';

describe('Phase 6 Step 2: Advanced Defensive Security Checks', () => {
  describe('Rule Registry Metadata Validation', () => {
    const expectedNewRuleIds = [
      'TLS-WEAK-CIPHER',
      'TLS-NO-TLS13',
      'HDR-MISSING-COOP',
      'HDR-PERMISSIVE-CORS',
      'CK-MISSING-HOST-PREFIX',
      'DNS-NO-REDUNDANT-NS',
      'EMAIL-MULTIPLE-SPF',
      'EXP-MISSING-SECURITY-TXT',
      'EXP-ROBOTS-SENSITIVE-PATHS',
    ];

    for (const ruleId of expectedNewRuleIds) {
      it(`should have valid metadata defined for rule "${ruleId}"`, () => {
        const meta = RULES[ruleId];
        assert.ok(meta, `Rule ${ruleId} must exist in RULES`);
        assert.strictEqual(meta.id, ruleId);
        assert.ok(meta.category);
        assert.ok(meta.severity);
        assert.ok(meta.title);
        assert.ok(meta.defaultDescription);
        assert.ok(meta.whyItMatters);
        assert.ok(meta.potentialImpact);
        assert.ok(meta.recommendation);
        assert.ok(meta.referenceUrl);
      });
    }
  });

  describe('Finding Normalizer Integration with Advanced Rules', () => {
    it('should normalize TLS-WEAK-CIPHER to MEDIUM severity with 8 point deduction', () => {
      const moduleResult: CheckModuleExecutionResult = {
        module: 'TLS_HTTPS',
        status: 'WARN',
        executionTimeMs: 50,
        evidence: { cipher: 'DES-CBC3-SHA', protocol: 'TLSv1.2' },
        findings: [
          {
            ruleId: 'TLS-WEAK-CIPHER',
            customDescription: 'Negotiated weak 3DES cipher.',
            customEvidence: { cipher: 'DES-CBC3-SHA' },
          },
        ],
      };

      const findings = normalizeCheckFindings('test-assessment-id', 'test-check-id', moduleResult);
      assert.strictEqual(findings.length, 1);
      assert.strictEqual(findings[0].ruleId, 'TLS-WEAK-CIPHER');
      assert.strictEqual(findings[0].category, 'TLS_HTTPS');
      assert.strictEqual(findings[0].severity, 'MEDIUM');
      assert.strictEqual(findings[0].scoreDeduction, 8);
    });

    it('should normalize EMAIL-MULTIPLE-SPF to HIGH severity with 15 point deduction', () => {
      const moduleResult: CheckModuleExecutionResult = {
        module: 'EMAIL_SECURITY',
        status: 'WARN',
        executionTimeMs: 30,
        evidence: {},
        findings: [
          {
            ruleId: 'EMAIL-MULTIPLE-SPF',
            customDescription: 'Published 2 SPF records violating RFC 7208.',
            customEvidence: { count: 2 },
          },
        ],
      };

      const findings = normalizeCheckFindings('test-assessment-id', 'test-check-id', moduleResult);
      assert.strictEqual(findings.length, 1);
      assert.strictEqual(findings[0].ruleId, 'EMAIL-MULTIPLE-SPF');
      assert.strictEqual(findings[0].category, 'EMAIL_SECURITY');
      assert.strictEqual(findings[0].severity, 'HIGH');
      assert.strictEqual(findings[0].scoreDeduction, 15);
    });

    it('should normalize HDR-PERMISSIVE-CORS and HDR-MISSING-COOP accurately', () => {
      const moduleResult: CheckModuleExecutionResult = {
        module: 'SECURITY_HEADERS',
        status: 'WARN',
        executionTimeMs: 40,
        evidence: {},
        findings: [
          { ruleId: 'HDR-PERMISSIVE-CORS' },
          { ruleId: 'HDR-MISSING-COOP' },
        ],
      };

      const findings = normalizeCheckFindings('test-assessment-id', 'test-check-id', moduleResult);
      assert.strictEqual(findings.length, 2);

      const corsFinding = findings.find((f) => f.ruleId === 'HDR-PERMISSIVE-CORS');
      const coopFinding = findings.find((f) => f.ruleId === 'HDR-MISSING-COOP');

      assert.strictEqual(corsFinding?.severity, 'MEDIUM');
      assert.strictEqual(corsFinding?.scoreDeduction, 8);
      assert.strictEqual(coopFinding?.severity, 'LOW');
      assert.strictEqual(coopFinding?.scoreDeduction, 3);
    });

    it('should normalize EXP-ROBOTS-SENSITIVE-PATHS to LOW severity', () => {
      const moduleResult: CheckModuleExecutionResult = {
        module: 'EXPOSURE',
        status: 'WARN',
        executionTimeMs: 20,
        evidence: {},
        findings: [
          {
            ruleId: 'EXP-ROBOTS-SENSITIVE-PATHS',
            customEvidence: { disallowedPaths: ['/admin', '/backup.zip'] },
          },
        ],
      };

      const findings = normalizeCheckFindings('test-assessment-id', 'test-check-id', moduleResult);
      assert.strictEqual(findings.length, 1);
      assert.strictEqual(findings[0].ruleId, 'EXP-ROBOTS-SENSITIVE-PATHS');
      assert.strictEqual(findings[0].severity, 'LOW');
      assert.strictEqual(findings[0].scoreDeduction, 3);
    });
  });

  describe('Deterministic Scoring with Advanced Findings', () => {
    it('should correctly score a comprehensive assessment containing advanced findings', () => {
      const moduleResult: CheckModuleExecutionResult = {
        module: 'SECURITY_HEADERS',
        status: 'WARN',
        executionTimeMs: 50,
        evidence: {},
        findings: [
          { ruleId: 'HDR-MISSING-HSTS' }, // -15 (HIGH)
          { ruleId: 'HDR-MISSING-COOP' }, // -3 (LOW)
          { ruleId: 'HDR-PERMISSIVE-CORS' }, // -8 (MEDIUM)
        ],
      };

      const findings = normalizeCheckFindings('assessment-1', 'check-1', moduleResult);
      assert.strictEqual(findings.length, 3);

      const scoreResult = computeSecurityScore(findings);
      // Expected total deduction = 15 + 3 + 8 = 26 points
      // Expected score = 100 - 26 = 74 (Grade C)
      assert.strictEqual(scoreResult.totalDeductions, 26);
      assert.strictEqual(scoreResult.score, 74);
      assert.strictEqual(scoreResult.grade, 'C');
      assert.strictEqual(scoreResult.countsBySeverity.HIGH, 1);
      assert.strictEqual(scoreResult.countsBySeverity.MEDIUM, 1);
      assert.strictEqual(scoreResult.countsBySeverity.LOW, 1);
    });
  });
});
