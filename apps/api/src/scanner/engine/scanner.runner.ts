import crypto from 'node:crypto';
import {
  Finding,
  CheckResult,
  AssessmentSummary,
  ScoreGrade,
} from '@wsc/shared';
import { validateAndResolveTarget } from '../network/ssrf.guard.js';
import { normalizeCheckFindings } from './normalizer.js';
import { computeSecurityScore } from './scoring.engine.js';
import { generateAiExplanation } from '../ai/ai.advisor.js';
import { CheckRegistry, defaultCheckRegistry } from './check.registry.js';
import { CheckExecutionContext } from './check.interface.js';
import { executeIsolatedCheck } from './check.supervisor.js';

export interface ScanRunnerResult {
  score: number;
  grade: ScoreGrade;
  executionTimeMs: number;
  checkResults: CheckResult[];
  findings: Finding[];
  summary: AssessmentSummary;
}

export type ScanProgressCallback = (stage: string, percent: number, message: string) => void;

export class ScannerEngine {
  constructor(private registry: CheckRegistry = defaultCheckRegistry) {}

  async run(
    assessmentId: string,
    domain: string,
    onProgress?: ScanProgressCallback,
    signal?: AbortSignal
  ): Promise<ScanRunnerResult> {
    const scanStart = Date.now();

    // Stage 1: Pre-flight validation & SSRF protection
    onProgress?.('PREFLIGHT', 10, 'Validating target domain and verifying public IP allocation...');
    if (signal?.aborted) {
      throw new Error('The operation was aborted');
    }
    const validated = await validateAndResolveTarget(domain);

    const checks = this.registry.getAll();
    const totalChecks = checks.length;
    const checkResults: CheckResult[] = [];
    const allFindings: Finding[] = [];

    // Stage 2..N: Dynamic Isolated Check Execution
    for (let i = 0; i < totalChecks; i++) {
      if (signal?.aborted) {
        throw new Error('The operation was aborted');
      }

      const check = checks[i];
      // Dynamic progress calculation: Preflight is 10%, Scoring is 95%. Checks span 10% -> 90%.
      const percent = totalChecks > 0 ? 10 + Math.round(((i + 1) / totalChecks) * 80) : 90;
      onProgress?.(check.meta.category, percent, `Evaluating ${check.meta.name}...`);

      const context: CheckExecutionContext = {
        assessmentId,
        domain: validated.hostname,
        target: validated,
        signal,
      };

      const moduleResult = await executeIsolatedCheck(check, context);
      const checkResultId = crypto.randomUUID();

      checkResults.push({
        id: checkResultId,
        assessmentId,
        checkModule: check.meta.category,
        status: moduleResult.status,
        executionTimeMs: moduleResult.executionTimeMs,
        rawEvidence: moduleResult.evidence,
        createdAt: new Date().toISOString(),
      });

      allFindings.push(...normalizeCheckFindings(assessmentId, checkResultId, moduleResult));
    }

    // Stage: Deterministic Scoring & AI Summary
    if (signal?.aborted) {
      throw new Error('The operation was aborted');
    }
    onProgress?.('SCORING', 95, 'Computing security score and generating action plan...');
    const scoreResult = computeSecurityScore(allFindings, checkResults);

    const passedChecks = checkResults.filter((r) => r.status === 'PASS').length;
    const failedChecks = checkResults.filter((r) => r.status === 'FAIL' || r.status === 'WARN').length;

    const aiExplanation = await generateAiExplanation(
      validated.hostname,
      scoreResult.score,
      scoreResult.grade,
      allFindings
    );

    const summary: AssessmentSummary = {
      id: crypto.randomUUID(),
      assessmentId,
      categoryScores: scoreResult.categoryScores,
      countsBySeverity: scoreResult.countsBySeverity,
      totalChecks: checkResults.length,
      passedChecks,
      failedChecks,
      aiExecutiveSummary: aiExplanation.executiveSummary,
      aiActionPlan: aiExplanation.actionPlan,
      aiModelVersion: aiExplanation.modelVersion,
      generatedAt: new Date().toISOString(),
    };

    onProgress?.('COMPLETED', 100, 'Security assessment successfully completed.');

    return {
      score: scoreResult.score,
      grade: scoreResult.grade,
      executionTimeMs: Date.now() - scanStart,
      checkResults,
      findings: allFindings,
      summary,
    };
  }
}

export async function executeSecurityScan(
  assessmentId: string,
  domain: string,
  onProgress?: ScanProgressCallback,
  registry: CheckRegistry = defaultCheckRegistry
): Promise<ScanRunnerResult> {
  const engine = new ScannerEngine(registry);
  return engine.run(assessmentId, domain, onProgress);
}
