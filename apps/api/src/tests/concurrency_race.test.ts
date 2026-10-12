import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { prisma } from '../db/client.js';
import { AssessmentService } from '../modules/assessments/assessment.service.js';
import { scannerQueue } from '../queue/scanner.queue.js';

describe('PHASE 2: Concurrency & TOCTOU Race Condition Elimination', () => {
  let user: any;
  let originalEnqueue: any;
  let enqueuedJobs: any[] = [];

  before(async () => {
    user = await prisma.user.create({
      data: {
        email: `race-test-${crypto.randomUUID()}@example.com`,
        fullName: 'Race Tester',
        passwordHash: 'dummy',
        role: 'USER',
      },
    });

    originalEnqueue = scannerQueue.enqueue;
  });

  beforeEach(() => {
    enqueuedJobs = [];
    scannerQueue.enqueue = (async (job: any) => {
      enqueuedJobs.push(job);
      return job;
    }) as any;
  });

  after(async () => {
    scannerQueue.enqueue = originalEnqueue;
    if (user) {
      await prisma.assessment.deleteMany({ where: { userId: user.id } });
      await prisma.target.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });

  it('1. Two simultaneous assessment creation requests: exactly ONE succeeds, ONE gets 409', async () => {
    const domain = `simultaneous-${crypto.randomUUID()}.com`;

    const results = await Promise.allSettled([
      AssessmentService.createAssessment(user.id, domain),
      AssessmentService.createAssessment(user.id, domain),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    assert.strictEqual(fulfilled.length, 1, 'Exactly one request must succeed');
    assert.strictEqual(rejected.length, 1, 'Exactly one request must be rejected');

    // Verify successful request
    assert.strictEqual(fulfilled[0].value.status, 'QUEUED');
    assert.ok(fulfilled[0].value.assessmentId);

    // Verify rejected request
    const rejectionReason: any = rejected[0].reason;
    assert.strictEqual(rejectionReason.statusCode, 409);
    assert.match(rejectionReason.message, /already actively running or queued/);

    // Verify database state: exactly 1 assessment row
    const target = await prisma.target.findUnique({
      where: {
        userId_normalizedHostname: {
          userId: user.id,
          normalizedHostname: domain,
        },
      },
      include: { assessments: true },
    });

    assert.ok(target, 'Target must exist in DB');
    assert.strictEqual(target.assessments.length, 1, 'Database must have exactly 1 assessment');
    assert.strictEqual(target.activeAssessmentId, fulfilled[0].value.assessmentId, 'Target activeAssessmentId must match the winner');
    assert.strictEqual(enqueuedJobs.length, 1, 'Exactly 1 job must be enqueued');
  });

  it('2. Five concurrent requests for the same target: exactly ONE succeeds, FOUR get 409', async () => {
    const domain = `concurrency-burst-${crypto.randomUUID()}.com`;

    const promises = Array.from({ length: 5 }, () =>
      AssessmentService.createAssessment(user.id, domain)
    );

    const results = await Promise.allSettled(promises);
    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    assert.strictEqual(fulfilled.length, 1, 'Exactly 1 of 5 concurrent requests must succeed');
    assert.strictEqual(rejected.length, 4, 'Exactly 4 of 5 concurrent requests must be rejected');

    for (const rej of rejected) {
      const err: any = rej.reason;
      assert.strictEqual(err.statusCode, 409);
      assert.match(err.message, /already actively running or queued/);
    }

    const count = await prisma.assessment.count({
      where: { userId: user.id, domain },
    });
    assert.strictEqual(count, 1, 'Exactly 1 assessment must exist in DB for the burst domain');
    assert.strictEqual(enqueuedJobs.length, 1, 'Exactly 1 job must have been enqueued');
  });

  it('3. Enqueue failure cleanly rolls back target reservation and marks assessment FAILED', async () => {
    const domain = `enqueue-fail-${crypto.randomUUID()}.com`;

    // Simulate queue infrastructure failure (e.g. Redis connection timeout)
    scannerQueue.enqueue = (async () => {
      throw new Error('Redis connection failure simulation');
    }) as any;

    await assert.rejects(
      async () => {
        await AssessmentService.createAssessment(user.id, domain);
      },
      (err: any) => {
        assert.match(err.message, /Redis connection failure simulation/);
        return true;
      }
    );

    // Verify rollback: target activeAssessmentId is NOT stuck, it was cleared
    const target = await prisma.target.findUnique({
      where: {
        userId_normalizedHostname: {
          userId: user.id,
          normalizedHostname: domain,
        },
      },
    });

    assert.ok(target, 'Target was created');
    assert.strictEqual(target.activeAssessmentId, null, 'activeAssessmentId must be reset to null on enqueue failure');

    // Verify assessment is marked FAILED so it does not hang
    const assessment = await prisma.assessment.findFirst({
      where: { targetId: target.id },
    });
    assert.ok(assessment, 'Assessment was created');
    assert.strictEqual(assessment.status, 'FAILED');
    assert.match(assessment.errorMessage || '', /Redis connection failure simulation/);
  });

  it('4. Concurrent rescan attempts during active cooldown: ALL are rejected with 429', async () => {
    const domain = `cooldown-race-${crypto.randomUUID()}.com`;

    // Create target and completed assessment within cooldown window
    const target = await prisma.target.create({
      data: {
        userId: user.id,
        domain,
        normalizedHostname: domain,
        lastAssessedAt: new Date(Date.now() - 30 * 1000), // 30s ago (180s cooldown)
      },
    });

    await prisma.assessment.create({
      data: {
        targetId: target.id,
        userId: user.id,
        domain,
        status: 'COMPLETED',
        createdAt: new Date(Date.now() - 40 * 1000),
        completedAt: new Date(Date.now() - 30 * 1000),
      },
    });

    const results = await Promise.allSettled([
      AssessmentService.createAssessment(user.id, domain),
      AssessmentService.createAssessment(user.id, domain),
      AssessmentService.createAssessment(user.id, domain),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    assert.strictEqual(fulfilled.length, 0, 'No rescan request may succeed during active cooldown');
    assert.strictEqual(rejected.length, 3, 'All 3 requests must be rejected');

    for (const rej of rejected) {
      const err: any = rej.reason;
      assert.strictEqual(err.statusCode, 429);
      assert.match(err.message, /Target scan cooldown active/);
    }
  });
});
