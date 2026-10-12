import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { prisma } from '../db/client.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { AssessmentService } from '../modules/assessments/assessment.service.js';
import { scannerQueue } from '../queue/scanner.queue.js';
import { processScanJob } from '../queue/scanner.worker.js';
import { ScanRunnerResult } from '../scanner/engine/scanner.runner.js';
import { ScoreGrade } from '@wsc/shared';

describe('PHASE 4: Full End-to-End User Journey Integration Test', () => {
  const testEmail = `e2e-user-${crypto.randomUUID()}@example.org`;
  const testPassword = 'Password123!Secure';
  const testFullName = 'E2E Quality Assurance Engineer';
  const targetDomain = `app-${crypto.randomUUID().slice(0, 8)}.e2e-test.org`;

  let registeredUser: any;
  let authToken: string;
  let firstAssessmentId: string;
  let secondAssessmentId: string;
  let targetRecordId: string;

  before(async () => {
    await prisma.$connect();
  });

  after(async () => {
    try {
      if (registeredUser) {
        // Cascade delete all test data for this user
        await prisma.finding.deleteMany({
          where: { assessment: { userId: registeredUser.id } },
        });
        await prisma.checkResult.deleteMany({
          where: { assessment: { userId: registeredUser.id } },
        });
        await prisma.assessmentSummary.deleteMany({
          where: { assessment: { userId: registeredUser.id } },
        });
        await prisma.assessment.deleteMany({
          where: { userId: registeredUser.id },
        });
        await prisma.target.deleteMany({
          where: { userId: registeredUser.id },
        });
        await prisma.user.deleteMany({
          where: { id: registeredUser.id },
        });
      }
      await scannerQueue.close();
    } catch (cleanupErr) {
      console.warn('E2E teardown cleanup warning:', cleanupErr);
    }
  });

  it('Step 1 & 2: User Registration and Authentication Flow', async () => {
    // 1. Registration
    const regResult = await AuthService.register({
      email: testEmail,
      password: testPassword,
      fullName: testFullName,
    });

    assert.ok(regResult.user.id, 'User ID should be generated');
    assert.equal(regResult.user.email, testEmail);
    assert.equal(regResult.user.role, 'USER');
    assert.ok(regResult.token, 'JWT token should be returned');

    registeredUser = regResult.user;

    // Verify user in real database
    const dbUser = await prisma.user.findUnique({
      where: { id: registeredUser.id },
    });
    assert.ok(dbUser, 'User must exist in database');
    assert.notEqual(dbUser.passwordHash, testPassword, 'Password must be bcrypt hashed');

    // 2. Login verification
    const loginResult = await AuthService.login({
      email: testEmail,
      password: testPassword,
    });
    assert.ok(loginResult.token, 'Login must succeed with valid credentials');
    authToken = loginResult.token;

    const payload = AuthService.verifyToken(authToken);
    assert.equal(payload.sub, registeredUser.id);
    assert.equal(payload.email, testEmail);
  });

  it('Step 3 & 4: Target Creation & Atomic Reservation', async () => {
    // 3. Initiate assessment creation via AssessmentService
    const creation = await AssessmentService.createAssessment(registeredUser.id, targetDomain);

    assert.ok(creation.assessmentId, 'Assessment ID must be returned');
    assert.ok(creation.targetId, 'Target ID must be returned');
    assert.equal(creation.status, 'QUEUED');

    firstAssessmentId = creation.assessmentId;
    targetRecordId = creation.targetId;

    // 4. Verify Target lock state in database
    const target = await prisma.target.findUnique({
      where: { id: targetRecordId },
    });
    assert.ok(target, 'Target must exist in DB');
    assert.equal(target.activeAssessmentId, firstAssessmentId, 'Target lock must be reserved with assessmentId');
    assert.equal(target.normalizedHostname, targetDomain.toLowerCase());

    // Verify Assessment record in database
    const assessment = await prisma.assessment.findUnique({
      where: { id: firstAssessmentId },
    });
    assert.ok(assessment, 'Assessment must exist in DB');
    assert.equal(assessment.status, 'QUEUED');
    assert.equal(assessment.targetId, targetRecordId);
    assert.equal(assessment.userId, registeredUser.id);
  });

  it('Step 5 & 6: BullMQ Queue Persistence in Redis', async () => {
    // 5. Verify that the job was enqueued in Redis via BullMQ
    const job = await scannerQueue.getJob(firstAssessmentId);
    assert.ok(job, 'BullMQ Job must exist in Redis');
    assert.equal(job.id, `assessment-${firstAssessmentId}`);
    assert.equal(job.data.assessmentId, firstAssessmentId);
    assert.equal(job.data.domain, targetDomain.toLowerCase());
    assert.equal(job.data.userId, registeredUser.id);
  });

  it('Step 7 to 13: Worker Execution, Database Persistence, and Target Lock Release', async () => {
    // Define a full-featured scan result representing standard security findings
    const mockFullScanRunner = async (
      assessmentId: string,
      dom: string,
      onProgress?: (stage: string, percent: number, message: string) => void
    ): Promise<ScanRunnerResult> => {
      onProgress?.('PREFLIGHT', 10, 'Validating target domain...');
      onProgress?.('TLS_HTTPS', 25, 'Inspecting TLS certificate...');
      onProgress?.('SECURITY_HEADERS', 45, 'Evaluating HTTP security headers...');
      onProgress?.('COOKIES', 60, 'Evaluating cookies...');
      onProgress?.('DNS', 70, 'Querying DNS records...');
      onProgress?.('EMAIL_SECURITY', 80, 'Analyzing SPF & DMARC...');
      onProgress?.('EXPOSURE', 90, 'Checking exposure banners...');
      onProgress?.('SCORING', 95, 'Computing final score...');

      const checkResult1Id = crypto.randomUUID();
      const checkResult2Id = crypto.randomUUID();

      return {
        score: 82,
        grade: 'B' as ScoreGrade,
        executionTimeMs: 450,
        checkResults: [
          {
            id: checkResult1Id,
            assessmentId,
            checkModule: 'SECURITY_HEADERS',
            status: 'WARN',
            executionTimeMs: 120,
            rawEvidence: { hsts: false, csp: true },
            createdAt: new Date().toISOString(),
          },
          {
            id: checkResult2Id,
            assessmentId,
            checkModule: 'TLS_HTTPS',
            status: 'PASS',
            executionTimeMs: 230,
            rawEvidence: { tlsVersion: 'TLSv1.3', validCert: true },
            createdAt: new Date().toISOString(),
          },
        ],
        findings: [
          {
            id: crypto.randomUUID(),
            assessmentId,
            checkResultId: checkResult1Id,
            ruleId: 'HDR-MISSING-HSTS',
            category: 'SECURITY_HEADERS',
            title: 'Missing Strict-Transport-Security (HSTS)',
            severity: 'MEDIUM',
            description: 'The server does not enforce HTTPS connections via HSTS.',
            whyItMatters: 'Vulnerable to active man-in-the-middle SSL stripping.',
            potentialImpact: 'Traffic downgrade to plain HTTP.',
            evidence: { hstsHeaderPresent: false },
            recommendation: 'Add Strict-Transport-Security: max-age=31536000; includeSubDomains',
            remediationCode: 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;',
            scoreDeduction: 15,
            referenceUrl: 'https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html',
            createdAt: new Date().toISOString(),
          },
        ],
        summary: {
          id: crypto.randomUUID(),
          assessmentId,
          categoryScores: {
            SECURITY_HEADERS: { score: 85, status: 'WARN', count: 1 },
            TLS_HTTPS: { score: 100, status: 'PASS', count: 0 },
            COOKIES: { score: 100, status: 'PASS', count: 0 },
            DNS: { score: 100, status: 'PASS', count: 0 },
            EMAIL_SECURITY: { score: 100, status: 'PASS', count: 0 },
            EXPOSURE: { score: 100, status: 'PASS', count: 0 },
          } as any,
          countsBySeverity: { CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 0, INFO: 0 },
          totalChecks: 2,
          passedChecks: 1,
          failedChecks: 1,
          aiExecutiveSummary: 'Security posture is generally strong with 1 medium remediation recommended.',
          aiActionPlan: [
            {
              priority: 1,
              title: 'Enable HSTS',
              description: 'Configure HSTS header on web server.',
              effort: 'LOW',
              category: 'SECURITY_HEADERS',
            },
          ],
          aiModelVersion: 'deterministic-v1',
          generatedAt: new Date().toISOString(),
        },
      };
    };

    // 8. Process the job via processScanJob
    const job = await scannerQueue.getJob(firstAssessmentId);
    assert.ok(job);

    const jobResult = await processScanJob(job.data, job, mockFullScanRunner);
    assert.equal(jobResult.assessmentId, firstAssessmentId);
    assert.equal(jobResult.score, 82);
    assert.equal(jobResult.grade, 'B');

    // 9. Database Assertions: Assessment state
    const completedAssessment = await prisma.assessment.findUnique({
      where: { id: firstAssessmentId },
    });
    assert.ok(completedAssessment);
    assert.equal(completedAssessment.status, 'COMPLETED');
    assert.equal(completedAssessment.score, 82);
    assert.equal(completedAssessment.grade, 'B');
    assert.ok(completedAssessment.completedAt);
    assert.ok(completedAssessment.startedAt);

    // 10. Database Assertions: Target lock released!
    const targetAfterScan = await prisma.target.findUnique({
      where: { id: targetRecordId },
    });
    assert.ok(targetAfterScan);
    assert.equal(targetAfterScan.activeAssessmentId, null, 'Target reservation lock must be released (null)');
    assert.ok(targetAfterScan.lastAssessedAt, 'Target lastAssessedAt must be timestamped');

    // 11. Database Assertions: Check Results persisted
    const checkResults = await prisma.checkResult.findMany({
      where: { assessmentId: firstAssessmentId },
    });
    assert.equal(checkResults.length, 2);
    assert.equal(checkResults[0].checkModule, 'SECURITY_HEADERS');

    // 12. Database Assertions: Findings persisted with relationships
    const findings = await prisma.finding.findMany({
      where: { assessmentId: firstAssessmentId },
    });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].ruleId, 'HDR-MISSING-HSTS');
    assert.equal(findings[0].severity, 'MEDIUM');
    assert.equal(findings[0].scoreDeduction, 15);

    // 13. Database Assertions: Assessment Summary persisted
    const summary = await prisma.assessmentSummary.findUnique({
      where: { assessmentId: firstAssessmentId },
    });
    assert.ok(summary);
    assert.equal(summary.totalChecks, 2);
    assert.equal(summary.passedChecks, 1);
    assert.equal(summary.failedChecks, 1);
  });

  it('Step 14 & 15: Retrieve Complete Assessment and Findings API Contract', async () => {
    // Test the API contract via AssessmentService.getAssessment
    const fullAssessment = await AssessmentService.getAssessment(firstAssessmentId, registeredUser.id);
    assert.ok(fullAssessment);
    assert.equal(fullAssessment.status, 'COMPLETED');
    assert.equal(fullAssessment.score, 82);
    assert.equal(fullAssessment.findings?.length, 1);
    assert.equal(fullAssessment.checkResults?.length, 2);
    assert.ok(fullAssessment.summary);
    assert.equal(fullAssessment.summary.countsBySeverity.MEDIUM, 1);

    // Test filtered findings retrieval
    const mediumFindings = await AssessmentService.getFindings(firstAssessmentId, registeredUser.id, {
      severity: 'MEDIUM',
    });
    assert.ok(mediumFindings);
    assert.equal(mediumFindings.length, 1);

    const criticalFindings = await AssessmentService.getFindings(firstAssessmentId, registeredUser.id, {
      severity: 'CRITICAL',
    });
    assert.ok(criticalFindings);
    assert.equal(criticalFindings.length, 0);
  });

  it('Step 16 & 17: Cooldown Enforcement & Target History Audit', async () => {
    // Attempting an immediate re-scan should trigger the 429 cooldown protection
    await assert.rejects(
      async () => {
        await AssessmentService.createAssessment(registeredUser.id, targetDomain);
      },
      (err: any) => {
        assert.equal(err.statusCode, 429);
        assert.match(err.message, /cooldown/i);
        return true;
      }
    );

    // Expire cooldown manually in DB to test subsequent scan
    const expiredTimestamp = new Date(Date.now() - 300 * 1000);
    await prisma.target.update({
      where: { id: targetRecordId },
      data: { lastAssessedAt: expiredTimestamp },
    });

    // Now second scan creation succeeds
    const secondScan = await AssessmentService.createAssessment(registeredUser.id, targetDomain);
    assert.ok(secondScan.assessmentId);
    secondAssessmentId = secondScan.assessmentId;

    // Simulate completion of second scan where HSTS was resolved (score improves to 97 Grade A)
    const mockFixedScanRunner = async (
      assessmentId: string
    ): Promise<ScanRunnerResult> => {
      const crId = crypto.randomUUID();
      return {
        score: 97,
        grade: 'A' as ScoreGrade,
        executionTimeMs: 380,
        checkResults: [
          {
            id: crId,
            assessmentId,
            checkModule: 'SECURITY_HEADERS',
            status: 'PASS',
            executionTimeMs: 80,
            rawEvidence: { hsts: true },
            createdAt: new Date().toISOString(),
          },
        ],
        findings: [], // Finding resolved!
        summary: {
          id: crypto.randomUUID(),
          assessmentId,
          categoryScores: { SECURITY_HEADERS: { score: 100, status: 'PASS', count: 0 } } as any,
          countsBySeverity: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 },
          totalChecks: 1,
          passedChecks: 1,
          failedChecks: 0,
          generatedAt: new Date().toISOString(),
        },
      };
    };

    const secondJob = await scannerQueue.getJob(secondAssessmentId);
    assert.ok(secondJob);
    await processScanJob(secondJob.data, secondJob, mockFixedScanRunner);

    // Verify target history has 2 recorded scans
    const targetAssessments = await prisma.assessment.findMany({
      where: { targetId: targetRecordId },
      orderBy: { createdAt: 'desc' },
    });
    assert.equal(targetAssessments.length, 2);
    assert.equal(targetAssessments[0].score, 97);
    assert.equal(targetAssessments[1].score, 82);
  });

  it('Step 18: Assessment Comparison Diff Verification', async () => {
    // Compare baseline scan (firstAssessmentId) with improved scan (secondAssessmentId)
    const diff = await AssessmentService.compareAssessments(
      firstAssessmentId,
      secondAssessmentId,
      registeredUser.id
    );

    assert.ok(diff);
    assert.equal(diff.baseAssessment.score, 82);
    assert.equal(diff.compareAssessment.score, 97);
    assert.equal(diff.scoreDelta, 15, 'Score should have increased by +15 points');
    assert.equal(diff.resolvedFindings.length, 1, 'HSTS finding should be resolved');
    assert.equal(diff.resolvedFindings[0].ruleId, 'HDR-MISSING-HSTS');
    assert.equal(diff.persistingFindings.length, 0);
    assert.equal(diff.newFindings.length, 0);
  });
});
