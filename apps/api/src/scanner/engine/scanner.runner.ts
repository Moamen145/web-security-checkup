import crypto from 'node:crypto';
import {
  Finding,
  CheckResult,
  AssessmentSummary,
  ScoreGrade,
} from '@wsc/shared';
import { validateAndResolveTarget } from '../network/ssrf.guard.js';
import { runTlsCheck } from '../checks/tls.check.js';
import { runHeadersCheck } from '../checks/headers.check.js';
import { runCookiesCheck } from '../checks/cookies.check.js';
import { runDnsCheck } from '../checks/dns.check.js';
import { runEmailSecurityCheck } from '../checks/email.check.js';
import { runExposureCheck } from '../checks/exposure.check.js';
import { normalizeCheckFindings } from './normalizer.js';
import { computeSecurityScore } from './scoring.engine.js';
import { generateAiExplanation } from '../ai/ai.advisor.js';

export interface ScanRunnerResult {
  score: number;
  grade: ScoreGrade;
  executionTimeMs: number;
  checkResults: CheckResult[];
  findings: Finding[];
  summary: AssessmentSummary;
}

export type ScanProgressCallback = (stage: string, percent: number, message: string) => void;

export async function executeSecurityScan(
  assessmentId: string,
  domain: string,
  onProgress?: ScanProgressCallback
): Promise<ScanRunnerResult> {
  const scanStart = Date.now();

  // Stage 1: Pre-flight validation & SSRF protection
  onProgress?.('PREFLIGHT', 10, 'Validating target domain and verifying public IP allocation...');
  const validated = await validateAndResolveTarget(domain);

  const checkResults: CheckResult[] = [];
  const allFindings: Finding[] = [];

  // Stage 2: TLS / HTTPS Check
  onProgress?.('TLS_HTTPS', 25, 'Inspecting TLS certificate chain and transport encryption...');
  const tlsModuleResult = await runTlsCheck(validated.hostname);
  const tlsCheckResultId = crypto.randomUUID();
  checkResults.push({
    id: tlsCheckResultId,
    assessmentId,
    checkModule: 'TLS_HTTPS',
    status: tlsModuleResult.status,
    executionTimeMs: tlsModuleResult.executionTimeMs,
    rawEvidence: tlsModuleResult.evidence,
    createdAt: new Date().toISOString(),
  });
  allFindings.push(...normalizeCheckFindings(assessmentId, tlsCheckResultId, tlsModuleResult));

  // Stage 3: HTTP Security Headers
  onProgress?.('SECURITY_HEADERS', 45, 'Evaluating HTTP defense-in-depth security headers...');
  const headersModuleResult = await runHeadersCheck(validated.hostname);
  const headersCheckResultId = crypto.randomUUID();
  checkResults.push({
    id: headersCheckResultId,
    assessmentId,
    checkModule: 'SECURITY_HEADERS',
    status: headersModuleResult.status,
    executionTimeMs: headersModuleResult.executionTimeMs,
    rawEvidence: headersModuleResult.evidence,
    createdAt: new Date().toISOString(),
  });
  allFindings.push(...normalizeCheckFindings(assessmentId, headersCheckResultId, headersModuleResult));

  // Stage 4: Cookie Security
  onProgress?.('COOKIES', 60, 'Checking cookie flags and session boundaries...');
  const cookiesModuleResult = await runCookiesCheck(validated.hostname);
  const cookiesCheckResultId = crypto.randomUUID();
  checkResults.push({
    id: cookiesCheckResultId,
    assessmentId,
    checkModule: 'COOKIES',
    status: cookiesModuleResult.status,
    executionTimeMs: cookiesModuleResult.executionTimeMs,
    rawEvidence: cookiesModuleResult.evidence,
    createdAt: new Date().toISOString(),
  });
  allFindings.push(...normalizeCheckFindings(assessmentId, cookiesCheckResultId, cookiesModuleResult));

  // Stage 5: DNS Configuration
  onProgress?.('DNS', 70, 'Querying authoritative DNS records and routing health...');
  const dnsModuleResult = await runDnsCheck(validated.hostname);
  const dnsCheckResultId = crypto.randomUUID();
  checkResults.push({
    id: dnsCheckResultId,
    assessmentId,
    checkModule: 'DNS',
    status: dnsModuleResult.status,
    executionTimeMs: dnsModuleResult.executionTimeMs,
    rawEvidence: dnsModuleResult.evidence,
    createdAt: new Date().toISOString(),
  });
  allFindings.push(...normalizeCheckFindings(assessmentId, dnsCheckResultId, dnsModuleResult));

  // Stage 6: Email Authentication (SPF / DMARC / DKIM)
  onProgress?.('EMAIL_SECURITY', 80, 'Analyzing anti-spoofing email authentication (SPF & DMARC)...');
  const emailModuleResult = await runEmailSecurityCheck(validated.hostname);
  const emailCheckResultId = crypto.randomUUID();
  checkResults.push({
    id: emailCheckResultId,
    assessmentId,
    checkModule: 'EMAIL_SECURITY',
    status: emailModuleResult.status,
    executionTimeMs: emailModuleResult.executionTimeMs,
    rawEvidence: emailModuleResult.evidence,
    createdAt: new Date().toISOString(),
  });
  allFindings.push(...normalizeCheckFindings(assessmentId, emailCheckResultId, emailModuleResult));

  // Stage 7: Exposure & Fingerprinting
  onProgress?.('EXPOSURE', 90, 'Checking for server banners and technology disclosures...');
  const exposureModuleResult = await runExposureCheck(validated.hostname);
  const exposureCheckResultId = crypto.randomUUID();
  checkResults.push({
    id: exposureCheckResultId,
    assessmentId,
    checkModule: 'EXPOSURE',
    status: exposureModuleResult.status,
    executionTimeMs: exposureModuleResult.executionTimeMs,
    rawEvidence: exposureModuleResult.evidence,
    createdAt: new Date().toISOString(),
  });
  allFindings.push(...normalizeCheckFindings(assessmentId, exposureCheckResultId, exposureModuleResult));

  // Stage 8: Deterministic Scoring & Summary
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
