import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { prisma } from '../db/client.js';
import { AssessmentService } from '../modules/assessments/assessment.service.js';
import { scannerQueue } from '../queue/scanner.queue.js';

describe('SEC-03: Target Scan Cooldown Enforcement', () => {
  let user: any;
  let originalEnqueue: any;

  before(async () => {
    // Stub background worker enqueueing so cooldown unit test doesn't launch background network scans
    originalEnqueue = scannerQueue.enqueue;
    scannerQueue.enqueue = (() => {}) as any;

    user = await prisma.user.create({
      data: {
        email: `cooldown-user-${crypto.randomUUID()}@example.com`,
        fullName: 'Cooldown Tester',
        passwordHash: 'dummy',
        role: 'USER',
      },
    });
  });

  after(async () => {
    scannerQueue.enqueue = originalEnqueue;
    if (user) {
      await prisma.assessment.deleteMany({ where: { userId: user.id } });
      await prisma.target.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });

  it('1. Existing normal first scan should be accepted', async () => {
    const domain = `first-scan-${crypto.randomUUID()}.com`;
    const result = await AssessmentService.createAssessment(user.id, domain);

    assert.ok(result.assessmentId);
    assert.strictEqual(result.status, 'QUEUED');
  });

  it('2. Active RUNNING scan should be rejected', async () => {
    const domain = `running-scan-${crypto.randomUUID()}.com`;
    // Create target and running assessment
    const target = await prisma.target.create({
      data: {
        userId: user.id,
        domain,
        normalizedHostname: domain,
      },
    });

    await prisma.assessment.create({
      data: {
        targetId: target.id,
        userId: user.id,
        domain,
        status: 'RUNNING',
      },
    });

    await assert.rejects(
      async () => {
        await AssessmentService.createAssessment(user.id, domain);
      },
      (err: any) => {
        assert.strictEqual(err.statusCode, 409);
        assert.match(err.message, /already actively running or queued/);
        return true;
      }
    );
  });

  it('3. Recently completed scan within cooldown period should be rejected', async () => {
    const domain = `recent-scan-${crypto.randomUUID()}.com`;
    const target = await prisma.target.create({
      data: {
        userId: user.id,
        domain,
        normalizedHostname: domain,
      },
    });

    // Completed 30 seconds ago (cooldown is 180s)
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

    await assert.rejects(
      async () => {
        await AssessmentService.createAssessment(user.id, domain);
      },
      (err: any) => {
        assert.strictEqual(err.statusCode, 429);
        assert.match(err.message, /Target scan cooldown active/);
        return true;
      }
    );
  });

  it('4. Cooldown expired should allow a new scan', async () => {
    const domain = `expired-scan-${crypto.randomUUID()}.com`;
    const target = await prisma.target.create({
      data: {
        userId: user.id,
        domain,
        normalizedHostname: domain,
      },
    });

    // Completed 250 seconds ago (exceeding 180s cooldown)
    await prisma.assessment.create({
      data: {
        targetId: target.id,
        userId: user.id,
        domain,
        status: 'COMPLETED',
        createdAt: new Date(Date.now() - 300 * 1000),
        completedAt: new Date(Date.now() - 250 * 1000),
      },
    });

    const result = await AssessmentService.createAssessment(user.id, domain);
    assert.ok(result.assessmentId);
    assert.strictEqual(result.status, 'QUEUED');
  });

  it('5. Failed scan should allow immediate rescan per product semantics', async () => {
    const domain = `failed-scan-${crypto.randomUUID()}.com`;
    const target = await prisma.target.create({
      data: {
        userId: user.id,
        domain,
        normalizedHostname: domain,
      },
    });

    await prisma.assessment.create({
      data: {
        targetId: target.id,
        userId: user.id,
        domain,
        status: 'FAILED',
        createdAt: new Date(Date.now() - 15 * 1000),
        completedAt: new Date(Date.now() - 10 * 1000),
      },
    });

    const result = await AssessmentService.createAssessment(user.id, domain);
    assert.ok(result.assessmentId);
    assert.strictEqual(result.status, 'QUEUED');
  });
});
