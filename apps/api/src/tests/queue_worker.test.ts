import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { prisma } from '../db/client.js';
import { processScanJob } from '../queue/scanner.worker.js';
import { progressBus } from '../queue/progress.bus.js';
import { ScanRunnerResult } from '../scanner/engine/scanner.runner.js';

describe('PHASE 2: BullMQ Scanner Worker Job Lifecycle & Idempotency', () => {
  let user: any;

  before(async () => {
    user = await prisma.user.create({
      data: {
        email: `worker-test-${crypto.randomUUID()}@example.com`,
        fullName: 'Worker Tester',
        passwordHash: 'dummy',
        role: 'USER',
      },
    });
  });

  after(async () => {
    if (user) {
      await prisma.assessment.deleteMany({ where: { userId: user.id } });
      await prisma.target.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });

  it('1. Rejects invalid job payloads with UnrecoverableError', async () => {
    await assert.rejects(
      async () => {
        await processScanJob({} as any);
      },
      (err: any) => {
        assert.match(err.message, /Invalid job payload/);
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await processScanJob({ assessmentId: 'abc', domain: '', userId: 'xyz' } as any);
      },
      (err: any) => {
        assert.match(err.message, /Invalid job payload/);
        return true;
      }
    );
  });

  it('2. Rejects non-existent assessmentId with UnrecoverableError', async () => {
    const bogusId = crypto.randomUUID();
    await assert.rejects(
      async () => {
        await processScanJob({
          assessmentId: bogusId,
          domain: 'example.com',
          userId: user.id,
        });
      },
      (err: any) => {
        assert.match(err.message, /not found in database/);
        return true;
      }
    );
  });

  it('3. Successfully executes scan job: transitions to COMPLETED, persists results, releases target lock', async () => {
    const domain = `worker-success-${crypto.randomUUID()}.com`;

    const target = await prisma.target.create({
      data: {
        userId: user.id,
        domain,
        normalizedHostname: domain,
      },
    });

    const assessment = await prisma.assessment.create({
      data: {
        targetId: target.id,
        userId: user.id,
        domain,
        status: 'QUEUED',
      },
    });

    // Lock target with activeAssessmentId
    await prisma.target.update({
      where: { id: target.id },
      data: { activeAssessmentId: assessment.id },
    });

    const progressEvents: any[] = [];
    const onProgress = (event: any) => progressEvents.push(event);
    progressBus.on(`progress:${assessment.id}`, onProgress);

    // Mock scan runner simulating successful security scan
    const mockScanRunner = async (
      assessmentId: string,
      dom: string,
      cb?: (stage: string, percent: number, message: string) => void
    ): Promise<ScanRunnerResult> => {
      cb?.('HEADERS', 50, 'Analyzing HTTP headers...');
      cb?.('DNS', 80, 'Analyzing DNS records...');
      return {
        score: 85,
        grade: 'B',
        executionTimeMs: 120,
        checkResults: [
          {
            id: crypto.randomUUID(),
            assessmentId,
            checkModule: 'SECURITY_HEADERS',
            status: 'WARN',
            executionTimeMs: 50,
            rawEvidence: { hsts: false },
            createdAt: new Date().toISOString(),
          },
        ],
        findings: [
          {
            id: crypto.randomUUID(),
            assessmentId,
            ruleId: 'HDR-MISSING-HSTS',
            category: 'SECURITY_HEADERS',
            title: 'Missing HSTS Header',
            severity: 'MEDIUM',
            description: 'Strict-Transport-Security header is missing.',
            whyItMatters: 'Vulnerable to SSL stripping.',
            potentialImpact: 'Interception risk.',
            evidence: { header: null },
            recommendation: 'Enable HSTS.',
            scoreDeduction: 15,
            createdAt: new Date().toISOString(),
            referenceUrl: 'https://example.com/hsts',
          },
        ],
        summary: {
          id: crypto.randomUUID(),
          assessmentId,
          categoryScores: { SECURITY_HEADERS: { score: 85, status: 'WARN', count: 1 } } as any,
          countsBySeverity: { CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 0, INFO: 0 },
          totalChecks: 1,
          passedChecks: 0,
          failedChecks: 1,
          generatedAt: new Date().toISOString(),
        },
      };
    };

    try {
      const result = await processScanJob(
        {
          assessmentId: assessment.id,
          domain,
          userId: user.id,
        },
        undefined,
        mockScanRunner as any
      );

      assert.strictEqual(result.assessmentId, assessment.id);
      assert.strictEqual(result.score, 85);
      assert.strictEqual(result.grade, 'B');
      assert.strictEqual(result.findingsCount, 1);

      // Verify DB Assessment status
      const updatedAssessment = await prisma.assessment.findUnique({
        where: { id: assessment.id },
        include: { checkResults: true, findings: true, summary: true },
      });

      assert.ok(updatedAssessment);
      assert.strictEqual(updatedAssessment.status, 'COMPLETED');
      assert.strictEqual(updatedAssessment.score, 85);
      assert.strictEqual(updatedAssessment.grade, 'B');
      assert.ok(updatedAssessment.completedAt !== null);
      assert.strictEqual(updatedAssessment.checkResults.length, 1);
      assert.strictEqual(updatedAssessment.findings.length, 1);
      assert.ok(updatedAssessment.summary !== null);

      // Verify Target lock released and lastAssessedAt updated
      const updatedTarget = await prisma.target.findUnique({
        where: { id: target.id },
      });

      assert.ok(updatedTarget);
      assert.strictEqual(updatedTarget.activeAssessmentId, null, 'activeAssessmentId must be released');
      assert.ok(updatedTarget.lastAssessedAt !== null, 'lastAssessedAt must be updated');

      // Verify Progress Events emitted
      assert.ok(progressEvents.length >= 3);
      const lastEvent = progressEvents[progressEvents.length - 1];
      assert.strictEqual(lastEvent.status, 'COMPLETED');
      assert.strictEqual(lastEvent.progressPercent, 100);
    } finally {
      progressBus.removeListener(`progress:${assessment.id}`, onProgress);
    }
  });

  it('4. Idempotency: duplicate job execution on COMPLETED scan returns early without duplicate writes', async () => {
    const domain = `worker-idempotent-${crypto.randomUUID()}.com`;

    const target = await prisma.target.create({
      data: {
        userId: user.id,
        domain,
        normalizedHostname: domain,
      },
    });

    const assessment = await prisma.assessment.create({
      data: {
        targetId: target.id,
        userId: user.id,
        domain,
        status: 'COMPLETED',
        score: 95,
        grade: 'A',
      },
    });

    await prisma.finding.create({
      data: {
        assessmentId: assessment.id,
        ruleId: 'HDR-INFO-EXAMPLE',
        category: 'SECURITY_HEADERS',
        title: 'Info finding',
        severity: 'INFO',
        description: 'Test',
        whyItMatters: 'Test',
        potentialImpact: 'Test',
        recommendation: 'Test',
        referenceUrl: 'https://example.com/reference',
        scoreDeduction: 0,
      },
    });

    const initialFindingsCount = await prisma.finding.count({
      where: { assessmentId: assessment.id },
    });

    // Run duplicate job (e.g. BullMQ redelivery or retry after completion)
    const duplicateResult = await processScanJob({
      assessmentId: assessment.id,
      domain,
      userId: user.id,
    });

    assert.strictEqual(duplicateResult.assessmentId, assessment.id);

    const postDuplicateFindingsCount = await prisma.finding.count({
      where: { assessmentId: assessment.id },
    });

    assert.strictEqual(
      postDuplicateFindingsCount,
      initialFindingsCount,
      'Findings count must remain identical; duplicate job must not duplicate DB rows'
    );
  });

  it('5. Terminal failure handling: updates status FAILED, clears target lock, emits error event', async () => {
    const domain = `worker-failure-${crypto.randomUUID()}.com`;

    const target = await prisma.target.create({
      data: {
        userId: user.id,
        domain,
        normalizedHostname: domain,
        activeAssessmentId: 'pending',
      },
    });

    const assessment = await prisma.assessment.create({
      data: {
        targetId: target.id,
        userId: user.id,
        domain,
        status: 'QUEUED',
      },
    });

    await prisma.target.update({
      where: { id: target.id },
      data: { activeAssessmentId: assessment.id },
    });

    const progressEvents: any[] = [];
    const onProgress = (event: any) => progressEvents.push(event);
    progressBus.on(`progress:${assessment.id}`, onProgress);

    const failingRunner = async () => {
      throw new Error('Target host refused connection during TLS inspection');
    };

    try {
      await assert.rejects(
        async () => {
          await processScanJob(
            {
              assessmentId: assessment.id,
              domain,
              userId: user.id,
            },
            undefined,
            failingRunner as any
          );
        },
        (err: any) => {
          assert.match(err.message, /refused connection/);
          return true;
        }
      );

      // Verify assessment status FAILED and errorMessage set
      const failedAssessment = await prisma.assessment.findUnique({
        where: { id: assessment.id },
      });
      assert.ok(failedAssessment);
      assert.strictEqual(failedAssessment.status, 'FAILED');
      assert.match(failedAssessment.errorMessage || '', /refused connection/);

      // Verify target lock cleared
      const updatedTarget = await prisma.target.findUnique({
        where: { id: target.id },
      });
      assert.ok(updatedTarget);
      assert.strictEqual(updatedTarget.activeAssessmentId, null, 'activeAssessmentId must be reset on failure');

      // Verify ERROR event was emitted
      const errorEvent = progressEvents.find((e) => e.status === 'FAILED');
      assert.ok(errorEvent, 'An error event with status FAILED must be emitted');
      assert.match(errorEvent.message, /refused connection/);
    } finally {
      progressBus.removeListener(`progress:${assessment.id}`, onProgress);
    }
  });
});
