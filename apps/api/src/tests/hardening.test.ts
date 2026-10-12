import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../db/client.js';
import { processScanJob } from '../queue/scanner.worker.js';
import { progressBus } from '../queue/progress.bus.js';
import { AuthService } from '../modules/auth/auth.service.js';

describe('PHASE 7: Hardening & Production Reliability Verification', () => {
  let app: FastifyInstance;
  let user: any;
  let token: string;

  before(async () => {
    app = buildApp();
    await app.ready();
    await prisma.$connect();

    user = await prisma.user.create({
      data: {
        email: `hardening-user-${crypto.randomUUID()}@example.org`,
        fullName: 'Hardening Verifier',
        passwordHash: 'dummyhash',
        role: 'USER',
      },
    });

    token = AuthService.generateToken({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: 'USER',
      createdAt: user.createdAt.toISOString(),
    });
  });

  after(async () => {
    try {
      if (user) {
        await prisma.finding.deleteMany({ where: { assessment: { userId: user.id } } });
        await prisma.checkResult.deleteMany({ where: { assessment: { userId: user.id } } });
        await prisma.assessmentSummary.deleteMany({ where: { assessment: { userId: user.id } } });
        await prisma.assessment.deleteMany({ where: { userId: user.id } });
        await prisma.target.deleteMany({ where: { userId: user.id } });
        await prisma.user.deleteMany({ where: { id: user.id } });
      }
      await app.close();
    } catch (cleanupErr) {
      console.warn('Hardening test teardown error:', cleanupErr);
    }
  });

  describe('1. BullMQ Retry State Synchronization & Lock Integrity', () => {
    it('preserves RUNNING state and target lock on non-terminal attempt failure, then completes on retry', async () => {
      const domain = `retry-sync-test-${crypto.randomUUID().slice(0, 8)}.com`;

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

      await prisma.target.update({
        where: { id: target.id },
        data: { activeAssessmentId: assessment.id },
      });

      const progressEvents: any[] = [];
      const onProgress = (e: any) => progressEvents.push(e);
      progressBus.on(`progress:${assessment.id}`, onProgress);

      try {
        // --- ATTEMPT 1: Simulated transient network failure ---
        const attempt1Job: any = {
          data: { assessmentId: assessment.id, domain, userId: user.id },
          attemptsMade: 0,
          opts: { attempts: 2 },
        };

        const failingRunner = async () => {
          throw new Error('Transient network timeout during DNS query');
        };

        await assert.rejects(
          async () => {
            await processScanJob(attempt1Job.data, attempt1Job, failingRunner as any);
          },
          /Transient network timeout/
        );

        // Verify that after Attempt 1:
        // 1. Assessment status remains RUNNING (NOT FAILED!)
        const assessmentAfterAttempt1 = await prisma.assessment.findUnique({
          where: { id: assessment.id },
        });
        assert.ok(assessmentAfterAttempt1);
        assert.equal(assessmentAfterAttempt1.status, 'RUNNING', 'Assessment must stay RUNNING during retry backoff');
        assert.match(assessmentAfterAttempt1.errorMessage || '', /Attempt 1 failed.*Retrying/);

        // 2. Target activeAssessmentId lock remains HELD (NOT released prematurely!)
        const targetAfterAttempt1 = await prisma.target.findUnique({
          where: { id: target.id },
        });
        assert.ok(targetAfterAttempt1);
        assert.equal(targetAfterAttempt1.activeAssessmentId, assessment.id, 'Target lock must NOT be released before retries exhaust');

        // 3. Retry progress event was emitted
        const retryEvent = progressEvents.find((e) => e.currentStage === 'RETRYING');
        assert.ok(retryEvent, 'RETRYING progress event must be emitted');
        assert.equal(retryEvent.status, 'RUNNING');

        // --- ATTEMPT 2: Successful retry ---
        const attempt2Job: any = {
          data: { assessmentId: assessment.id, domain, userId: user.id },
          attemptsMade: 1,
          opts: { attempts: 2 },
        };

        const mockSuccessRunner = async (aId: string) => ({
          score: 95,
          grade: 'A' as any,
          executionTimeMs: 150,
          checkResults: [],
          findings: [],
          summary: {
            id: crypto.randomUUID(),
            assessmentId: aId,
            categoryScores: {} as any,
            countsBySeverity: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 },
            totalChecks: 6,
            passedChecks: 6,
            failedChecks: 0,
            generatedAt: new Date().toISOString(),
          },
        });

        const attempt2Result = await processScanJob(attempt2Job.data, attempt2Job, mockSuccessRunner as any);
        assert.equal(attempt2Result.score, 95);

        // Verify that after successful Attempt 2:
        const assessmentAfterAttempt2 = await prisma.assessment.findUnique({
          where: { id: assessment.id },
        });
        assert.ok(assessmentAfterAttempt2);
        assert.equal(assessmentAfterAttempt2.status, 'COMPLETED');
        assert.equal(assessmentAfterAttempt2.score, 95);

        // Target lock is now released
        const targetAfterAttempt2 = await prisma.target.findUnique({
          where: { id: target.id },
        });
        assert.ok(targetAfterAttempt2);
        assert.equal(targetAfterAttempt2.activeAssessmentId, null);
      } finally {
        progressBus.removeListener(`progress:${assessment.id}`, onProgress);
      }
    });

    it('transitions to FAILED and releases target lock only when all attempts are exhausted', async () => {
      const domain = `retry-exhaust-test-${crypto.randomUUID().slice(0, 8)}.com`;

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

      await prisma.target.update({
        where: { id: target.id },
        data: { activeAssessmentId: assessment.id },
      });

      // Simulated final attempt (attemptsMade = 1 of 2)
      const finalJob: any = {
        data: { assessmentId: assessment.id, domain, userId: user.id },
        attemptsMade: 1,
        opts: { attempts: 2 },
      };

      const failingRunner = async () => {
        throw new Error('Persistent network failure');
      };

      await assert.rejects(
        async () => {
          await processScanJob(finalJob.data, finalJob, failingRunner as any);
        },
        /Persistent network failure/
      );

      // Now it must transition to terminal FAILED state
      const failedAssessment = await prisma.assessment.findUnique({
        where: { id: assessment.id },
      });
      assert.ok(failedAssessment);
      assert.equal(failedAssessment.status, 'FAILED');

      // Target lock must be released
      const updatedTarget = await prisma.target.findUnique({
        where: { id: target.id },
      });
      assert.ok(updatedTarget);
      assert.equal(updatedTarget.activeAssessmentId, null);
    });
  });

  describe('2. Credentialed SSE CORS Origin Reflection', () => {
    it('reflects requesting origin and sets Access-Control-Allow-Credentials on SSE stream', async () => {
      // Create a test assessment
      const target = await prisma.target.create({
        data: {
          userId: user.id,
          domain: 'sse-cors-test.org',
          normalizedHostname: 'sse-cors-test.org',
        },
      });

      const assessment = await prisma.assessment.create({
        data: {
          targetId: target.id,
          userId: user.id,
          domain: 'sse-cors-test.org',
          status: 'COMPLETED',
          score: 85,
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/assessments/${assessment.id}/stream`,
        headers: {
          authorization: `Bearer ${token}`,
          origin: 'http://localhost:5173',
        },
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173');
      assert.equal(res.headers['access-control-allow-credentials'], 'true');
    });
  });

  describe('3. Production Global Error Handler & Info Leakage Prevention', () => {
    it('preserves clean client error messages for 4xx errors', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/assessments',
        headers: { authorization: `Bearer ${token}` },
        payload: { domain: 'invalid domain', authorized: true },
      });

      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.ok(body.error);
    });
  });
});
