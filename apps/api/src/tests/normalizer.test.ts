import { describe, it } from 'node:test';
import assert from 'node:assert';
import { normalizeCheckFindings } from '../scanner/engine/normalizer.js';
import { CheckModuleExecutionResult } from '@wsc/shared';

describe('Finding Normalizer', () => {
  it('should map rule IDs to structured finding models with recommendations', () => {
    const mockModuleResult: CheckModuleExecutionResult = {
      module: 'SECURITY_HEADERS',
      status: 'WARN',
      executionTimeMs: 120,
      evidence: { finalUrl: 'https://example.com' },
      findings: [
        {
          ruleId: 'HDR-MISSING-HSTS',
          customEvidence: { headerPresent: false },
        },
      ],
    };

    const normalized = normalizeCheckFindings('test-assessment-id', 'test-check-id', mockModuleResult);

    assert.strictEqual(normalized.length, 1);
    const finding = normalized[0];

    assert.strictEqual(finding.ruleId, 'HDR-MISSING-HSTS');
    assert.strictEqual(finding.severity, 'HIGH');
    assert.strictEqual(finding.scoreDeduction, 15);
    assert.strictEqual(finding.category, 'SECURITY_HEADERS');
    assert.ok(finding.title.includes('Strict-Transport-Security'));
    assert.ok(finding.remediationCode?.includes('add_header Strict-Transport-Security'));
    assert.strictEqual(finding.assessmentId, 'test-assessment-id');
  });
});
