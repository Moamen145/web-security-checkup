import {
  Finding,
  RULES,
  SEVERITY_DEDUCTIONS,
  CheckModuleExecutionResult,
} from '@wsc/shared';
import crypto from 'node:crypto';

export function normalizeCheckFindings(
  assessmentId: string,
  checkResultId: string,
  moduleResult: CheckModuleExecutionResult
): Finding[] {
  const normalized: Finding[] = [];

  for (const rawFinding of moduleResult.findings) {
    const ruleMeta = RULES[rawFinding.ruleId];
    if (!ruleMeta) {
      continue;
    }

    const deduction = SEVERITY_DEDUCTIONS[ruleMeta.severity] || 0;

    const finding: Finding = {
      id: crypto.randomUUID(),
      assessmentId,
      checkResultId,
      ruleId: ruleMeta.id,
      category: ruleMeta.category,
      title: ruleMeta.title,
      severity: ruleMeta.severity,
      description: rawFinding.customDescription || ruleMeta.defaultDescription,
      whyItMatters: ruleMeta.whyItMatters,
      potentialImpact: ruleMeta.potentialImpact,
      evidence: rawFinding.customEvidence || moduleResult.evidence || {},
      recommendation: ruleMeta.recommendation,
      remediationCode: ruleMeta.remediationSnippet,
      referenceUrl: ruleMeta.referenceUrl,
      scoreDeduction: deduction,
      createdAt: new Date().toISOString(),
    };

    normalized.push(finding);
  }

  return normalized;
}
