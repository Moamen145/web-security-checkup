import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { prisma } from '../db/client.js';
import { executeSecurityScan } from '../scanner/engine/scanner.runner.js';
import { runTlsCheck } from '../scanner/checks/tls.check.js';
import { AssessmentService } from '../modules/assessments/assessment.service.js';
import { scannerQueue } from '../queue/scanner.queue.js';
import { processScanJob } from '../queue/scanner.worker.js';

const isLiveGated = process.env.RUN_LIVE_TESTS !== 'true';

describe(
  'PHASE 4: Real Non-Destructive Scanner Verification (example.com)',
  { skip: isLiveGated ? 'Gated: RUN_LIVE_TESTS!=true (offline mode)' : false },
  () => {
    const targetDomain = 'example.com';
    let testUser: any;

  before(async () => {
    await prisma.$connect();
    testUser = await prisma.user.create({
      data: {
        email: `real-scan-tester-${crypto.randomUUID()}@example.org`,
        fullName: 'Real Scanner Verifier',
        passwordHash: 'dummy-hashed',
        role: 'USER',
      },
    });
  });

  after(async () => {
    try {
      if (testUser) {
        await prisma.finding.deleteMany({
          where: { assessment: { userId: testUser.id } },
        });
        await prisma.checkResult.deleteMany({
          where: { assessment: { userId: testUser.id } },
        });
        await prisma.assessmentSummary.deleteMany({
          where: { assessment: { userId: testUser.id } },
        });
        await prisma.assessment.deleteMany({
          where: { userId: testUser.id },
        });
        await prisma.target.deleteMany({
          where: { userId: testUser.id },
        });
        await prisma.user.deleteMany({
          where: { id: testUser.id },
        });
      }
      await scannerQueue.close();
    } catch (cleanupErr) {
      console.warn('Real scanner teardown warning:', cleanupErr);
    }
  });

  it('1. TLS Check Direct Verification: No DateTrans ReferenceError', async () => {
    const tlsResult = await runTlsCheck(targetDomain);

    assert.ok(tlsResult, 'TLS check must return a valid execution result');
    assert.ok(
      tlsResult.status === 'PASS' || tlsResult.status === 'WARN' || tlsResult.status === 'FAIL' || tlsResult.status === 'ERROR',
      `Unexpected TLS status: ${tlsResult.status}`
    );
    assert.ok(typeof tlsResult.executionTimeMs === 'number', 'Execution time must be a number');
    assert.ok(tlsResult.executionTimeMs >= 0, 'Execution time must be non-negative');

    // Crucial check: verify DateTrans typo is eliminated and did not throw
    if (tlsResult.status === 'ERROR') {
      assert.notEqual(
        tlsResult.error,
        'DateTrans is not defined',
        'TLS check must not fail due to DateTrans ReferenceError'
      );
    }
  });

  it('2. Live Defensive Scan: All 6 Categories Evaluated Non-Destructively', async () => {
    const assessmentId = crypto.randomUUID();
    const observedStages: string[] = [];

    const scanResult = await executeSecurityScan(
      assessmentId,
      targetDomain,
      (stage, percent, message) => {
        observedStages.push(stage);
      }
    );

    // Verify scan finished and stages were emitted
    assert.ok(scanResult, 'Scan result must be returned');
    assert.ok(observedStages.includes('PREFLIGHT'), 'PREFLIGHT stage must be emitted');
    assert.ok(observedStages.includes('TLS_HTTPS'), 'TLS_HTTPS stage must be emitted');
    assert.ok(observedStages.includes('SECURITY_HEADERS'), 'SECURITY_HEADERS stage must be emitted');
    assert.ok(observedStages.includes('COOKIES'), 'COOKIES stage must be emitted');
    assert.ok(observedStages.includes('DNS'), 'DNS stage must be emitted');
    assert.ok(observedStages.includes('EMAIL_SECURITY'), 'EMAIL_SECURITY stage must be emitted');
    assert.ok(observedStages.includes('EXPOSURE'), 'EXPOSURE stage must be emitted');
    assert.ok(observedStages.includes('SCORING'), 'SCORING stage must be emitted');

    // Verify all 6 check categories are represented in checkResults
    const checkModules = scanResult.checkResults.map((r) => r.checkModule);
    assert.ok(checkModules.includes('TLS_HTTPS'), 'TLS_HTTPS check must be present');
    assert.ok(checkModules.includes('SECURITY_HEADERS'), 'SECURITY_HEADERS check must be present');
    assert.ok(checkModules.includes('COOKIES'), 'COOKIES check must be present');
    assert.ok(checkModules.includes('DNS'), 'DNS check must be present');
    assert.ok(checkModules.includes('EMAIL_SECURITY'), 'EMAIL_SECURITY check must be present');
    assert.ok(checkModules.includes('EXPOSURE'), 'EXPOSURE check must be present');
    assert.equal(scanResult.checkResults.length, 6, 'Exactly 6 defensive checks must be recorded');

    // Verify scoring validity
    assert.ok(typeof scanResult.score === 'number', 'Score must be a number');
    assert.ok(scanResult.score >= 0 && scanResult.score <= 100, `Score out of bounds: ${scanResult.score}`);
    assert.ok(['A', 'B', 'C', 'D', 'F'].includes(scanResult.grade), `Invalid grade: ${scanResult.grade}`);

    // Verify summary and categoryScores
    const catScores = scanResult.summary.categoryScores;
    assert.ok(catScores, 'categoryScores must exist in summary');

    // Invariant: If any category check encountered an error/unavailable state,
    // its score must be null and NEVER awarded a 100% or PASS
    for (const [catName, catScoreObj] of Object.entries(catScores)) {
      if ((catScoreObj.status as string) === 'ERROR' || (catScoreObj.status as string) === 'UNAVAILABLE' || catScoreObj.score === null) {
        assert.equal(
          catScoreObj.score,
          null,
          `Category ${catName} had ERROR status but was awarded non-null score`
        );
      }
    }
  });

  it('3. End-to-End Pipeline Execution on Real Target through BullMQ Worker', async () => {
    // Enqueue real scan via AssessmentService
    const creation = await AssessmentService.createAssessment(testUser.id, targetDomain);
    assert.ok(creation.assessmentId);
    assert.equal(creation.status, 'QUEUED');

    // Retrieve BullMQ Job from Redis
    const job = await scannerQueue.getJob(creation.assessmentId);
    assert.ok(job, 'Job must exist in BullMQ Redis queue');

    // Process real job through Worker pipeline
    const jobResult = await processScanJob(job.data, job);

    assert.equal(jobResult.assessmentId, creation.assessmentId);
    assert.ok(typeof jobResult.score === 'number');
    assert.ok(jobResult.score >= 0 && jobResult.score <= 100);

    // Verify DB transition to terminal COMPLETED state
    const completedAssessment = await prisma.assessment.findUnique({
      where: { id: creation.assessmentId },
    });
    assert.ok(completedAssessment);
    assert.equal(completedAssessment.status, 'COMPLETED');
    assert.ok(completedAssessment.completedAt);

    // Verify Target lock release
    const target = await prisma.target.findUnique({
      where: { id: creation.targetId },
    });
    assert.ok(target);
    assert.equal(target.activeAssessmentId, null, 'Target lock must be released after completion');
    assert.ok(target.lastAssessedAt);

    // Verify all 6 CheckResults persisted in database
    const dbCheckResults = await prisma.checkResult.findMany({
      where: { assessmentId: creation.assessmentId },
    });
    assert.equal(dbCheckResults.length, 6, 'Database must have 6 check results for assessment');

    // Verify Assessment Summary persisted in database
    const dbSummary = await prisma.assessmentSummary.findUnique({
      where: { assessmentId: creation.assessmentId },
    });
    assert.ok(dbSummary);
    assert.equal(dbSummary.totalChecks, 6);
  });
});
