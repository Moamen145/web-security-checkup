import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../db/client.js';
import { scannerQueue } from '../queue/scanner.queue.js';
import { processScanJob } from '../queue/scanner.worker.js';
import { RULES, SEVERITY_DEDUCTIONS, normalizeDomain } from '@wsc/shared';

const isLiveGated = process.env.RUN_LIVE_TESTS !== 'true';

describe('PHASE 6 STEP 3: Final Scanner Integration & Verification', () => {
  let app: FastifyInstance;
  let testUserA: any;
  let testUserB: any;
  let tokenA: string;
  let tokenB: string;
  let liveAssessmentId: string;
  let liveTargetId: string;

  before(async () => {
    app = buildApp();
    await app.ready();
    await prisma.$connect();

    // User A
    const emailA = `integration-user-a-${crypto.randomUUID()}@example.org`;
    testUserA = await prisma.user.create({
      data: {
        email: emailA,
        fullName: 'Final Integration Tester A',
        passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890dummyhash',
        role: 'USER',
      },
    });

    // Login via API route to get real JWT for User A
    const loginResA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: emailA,
        password: 'Password123!Secure', // Will mock or create user properly
      },
    });

    // If login route verifies bcrypt, let's use the register route directly to ensure realistic hash
    const registeredEmail = `verified-e2e-${crypto.randomUUID()}@example.org`;
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: registeredEmail,
        password: 'Password123!Secure',
        fullName: 'Verified E2E Tester',
      },
    });
    assert.equal(regRes.statusCode, 201);
    const regData = JSON.parse(regRes.body);
    tokenA = regData.token;
    testUserA = regData.user;

    // User B (for cross-tenant IDOR tests)
    const regResB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `unauthorized-user-b-${crypto.randomUUID()}@example.org`,
        password: 'Password123!Secure',
        fullName: 'Unauthorized User B',
      },
    });
    assert.equal(regResB.statusCode, 201);
    const regDataB = JSON.parse(regResB.body);
    tokenB = regDataB.token;
    testUserB = regDataB.user;
  });

  after(async () => {
    try {
      if (testUserA) {
        await prisma.finding.deleteMany({ where: { assessment: { userId: testUserA.id } } });
        await prisma.checkResult.deleteMany({ where: { assessment: { userId: testUserA.id } } });
        await prisma.assessmentSummary.deleteMany({ where: { assessment: { userId: testUserA.id } } });
        await prisma.assessment.deleteMany({ where: { userId: testUserA.id } });
        await prisma.target.deleteMany({ where: { userId: testUserA.id } });
        await prisma.user.deleteMany({ where: { id: testUserA.id } });
      }
      if (testUserB) {
        await prisma.finding.deleteMany({ where: { assessment: { userId: testUserB.id } } });
        await prisma.checkResult.deleteMany({ where: { assessment: { userId: testUserB.id } } });
        await prisma.assessmentSummary.deleteMany({ where: { assessment: { userId: testUserB.id } } });
        await prisma.assessment.deleteMany({ where: { userId: testUserB.id } });
        await prisma.target.deleteMany({ where: { userId: testUserB.id } });
        await prisma.user.deleteMany({ where: { id: testUserB.id } });
      }
      await scannerQueue.close();
      await app.close();
    } catch (cleanupErr) {
      console.warn('Final integration cleanup error:', cleanupErr);
    }
  });

  describe('1. Negative & Error Flows (Zero-Tolerance Controls)', () => {
    it('rejects invalid domain formats with HTTP 400', async () => {
      const invalidDomains = [
        '',
        '   ',
        'invalid domain with spaces.com',
        '-starting-with-dash.com',
        'ending-with-dash-.com',
        'domain..com',
        'a',
      ];

      for (const badDomain of invalidDomains) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/assessments',
          headers: { authorization: `Bearer ${tokenA}` },
          payload: { domain: badDomain, authorized: true },
        });

        assert.equal(res.statusCode, 400, `Expected 400 for "${badDomain}", got ${res.statusCode}`);
      }
    });

    it('rejects unauthorized or private SSRF targets with HTTP 400', async () => {
      const privateTargets = [
        '127.0.0.1',
        '10.0.0.1',
        '192.168.1.1',
        '169.254.169.254',
        'server.local',
        'infra.internal',
      ];

      for (const target of privateTargets) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/assessments',
          headers: { authorization: `Bearer ${tokenA}` },
          payload: { domain: target, authorized: true },
        });

        assert.equal(res.statusCode, 400, `Expected SSRF rejection for "${target}"`);
        const body = JSON.parse(res.body);
        assert.match(body.error, /Direct IP addresses are not permitted|Special-use and internal|Invalid domain/i);
      }
    });

    it('rejects unauthorized assessment creation when authorized is false', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/assessments',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { domain: 'example.com', authorized: false },
      });

      assert.equal(res.statusCode, 400);
    });

    it('rejects unauthenticated requests with HTTP 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/assessments',
        payload: { domain: 'example.com', authorized: true },
      });

      assert.equal(res.statusCode, 401);
    });
  });

  describe('2. Cross-Tenant IDOR Protection', () => {
    let dummyAssessmentId: string;

    before(async () => {
      // Create a target and assessment owned by User A
      const target = await prisma.target.create({
        data: {
          userId: testUserA.id,
          domain: 'tenant-isolation-test.org',
          normalizedHostname: 'tenant-isolation-test.org',
        },
      });

      const assessment = await prisma.assessment.create({
        data: {
          targetId: target.id,
          userId: testUserA.id,
          domain: 'tenant-isolation-test.org',
          status: 'COMPLETED',
          score: 90,
          grade: 'A',
        },
      });
      dummyAssessmentId = assessment.id;
    });

    it('prevents User B from reading User A assessment via HTTP GET (404 without leaking)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/assessments/${dummyAssessmentId}`,
        headers: { authorization: `Bearer ${tokenB}` },
      });

      assert.equal(res.statusCode, 404);
      const body = JSON.parse(res.body);
      assert.equal(body.error, 'Assessment not found.');
    });

    it('prevents User B from accessing User A findings (404)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/assessments/${dummyAssessmentId}/findings`,
        headers: { authorization: `Bearer ${tokenB}` },
      });

      assert.equal(res.statusCode, 404);
    });

    it('prevents User B from subscribing to User A SSE progress stream (404)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/assessments/${dummyAssessmentId}/stream`,
        headers: { authorization: `Bearer ${tokenB}` },
      });

      assert.equal(res.statusCode, 404);
      assert.notEqual(res.headers['content-type'], 'text/event-stream');
    });
  });

  describe('3. Concurrency Lock & Cooldown Rules', () => {
    const lockTestDomain = `concurrency-test-${crypto.randomUUID().slice(0, 6)}.org`;

    it('enforces 409 Conflict when a scan is already active for the target', async () => {
      // Create active scan
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/v1/assessments',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { domain: lockTestDomain, authorized: true },
      });
      assert.equal(res1.statusCode, 202);
      const data1 = JSON.parse(res1.body);

      // Second immediate scan for the same target domain while active
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/v1/assessments',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { domain: lockTestDomain, authorized: true },
      });
      assert.equal(res2.statusCode, 409);
      const data2 = JSON.parse(res2.body);
      assert.match(data2.error, /already actively running or queued/i);

      // Clean up BullMQ job so it doesn't linger
      const job = await scannerQueue.getJob(data1.assessmentId);
      if (job) await job.remove().catch(() => {});
    });

    it('enforces 429 Cooldown when an assessment was recently completed', async () => {
      const cooldownDomain = `cooldown-domain-${crypto.randomUUID().slice(0, 6)}.org`;
      const target = await prisma.target.create({
        data: {
          userId: testUserA.id,
          domain: cooldownDomain,
          normalizedHostname: cooldownDomain,
          lastAssessedAt: new Date(), // Just completed right now
        },
      });

      await prisma.assessment.create({
        data: {
          targetId: target.id,
          userId: testUserA.id,
          domain: cooldownDomain,
          status: 'COMPLETED',
          score: 85,
          grade: 'B',
          completedAt: new Date(),
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/assessments',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { domain: cooldownDomain, authorized: true },
      });

      assert.equal(res.statusCode, 429);
      const body = JSON.parse(res.body);
      assert.match(body.error, /Target scan cooldown active/i);
    });
  });

  describe('4. Result Integrity & Deterministic Scoring Verification', () => {
    it('verifies all registered rules have valid metadata and non-negative deductions', () => {
      for (const [ruleId, rule] of Object.entries(RULES)) {
        assert.ok(rule.id, `Rule ${ruleId} must have an ID`);
        assert.ok(rule.title, `Rule ${ruleId} must have a title`);
        assert.ok(rule.defaultDescription, `Rule ${ruleId} must have a defaultDescription`);
        assert.ok(rule.recommendation, `Rule ${ruleId} must have a recommendation`);

        const validCategories = ['TLS_HTTPS', 'SECURITY_HEADERS', 'COOKIES', 'DNS', 'EMAIL_SECURITY', 'EXPOSURE'];
        assert.ok(
          validCategories.includes(rule.category),
          `Rule ${ruleId} category ${rule.category} must be one of the 6 valid categories`
        );

        const deduction = SEVERITY_DEDUCTIONS[rule.severity];
        assert.ok(typeof deduction === 'number', `Severity ${rule.severity} must map to numeric deduction`);
        assert.ok(deduction >= 0, `Deduction for ${rule.severity} must be non-negative`);

        // INFO severity must NOT deduce points
        if (rule.severity === 'INFO') {
          assert.equal(
            deduction,
            0,
            `INFO rule ${ruleId} must have deduction = 0 to avoid penalizing posture`
          );
        }
      }
    });
  });

  describe(
    '5. Full End-to-End Live Scan Integration (example.com)',
    { skip: isLiveGated ? 'Gated: RUN_LIVE_TESTS!=true (offline mode)' : false },
    () => {
      const liveTarget = 'example.com';

      it('executes full flow: API -> Queue -> Worker -> Scanner Engine -> DB -> Results -> History', async () => {
        // A. Assessment Creation via API (Fastify HTTP POST /api/v1/assessments)
        const createRes = await app.inject({
          method: 'POST',
          url: '/api/v1/assessments',
          headers: { authorization: `Bearer ${tokenA}` },
          payload: { domain: liveTarget, authorized: true },
        });

        assert.equal(createRes.statusCode, 202);
        const createBody = JSON.parse(createRes.body);
        assert.ok(createBody.assessmentId);
        assert.ok(createBody.targetId);
        assert.equal(createBody.status, 'QUEUED');

        liveAssessmentId = createBody.assessmentId;
        liveTargetId = createBody.targetId;

        // B. Target Reservation Lock verified in DB
        const targetBefore = await prisma.target.findUnique({
          where: { id: liveTargetId },
        });
        assert.ok(targetBefore);
        assert.equal(targetBefore.activeAssessmentId, liveAssessmentId, 'Target must be locked with assessment ID');

        // C. BullMQ Job Enqueued in Redis
        const job = await scannerQueue.getJob(liveAssessmentId);
        assert.ok(job, 'BullMQ Job must be found in Redis');
        assert.equal(job.data.domain, 'example.com');
        assert.equal(job.data.userId, testUserA.id);

        // D. Worker processes job with real Scanner Engine
        const progressEvents: string[] = [];
        const jobResult = await processScanJob(job.data, job);

        assert.equal(jobResult.assessmentId, liveAssessmentId);
        assert.ok(typeof jobResult.score === 'number');
        assert.ok(jobResult.score >= 0 && jobResult.score <= 100);
        assert.ok(['A', 'B', 'C', 'D', 'F'].includes(jobResult.grade));

        // E. Database State Verification
        const assessmentAfter = await prisma.assessment.findUnique({
          where: { id: liveAssessmentId },
        });
        assert.ok(assessmentAfter);
        assert.equal(assessmentAfter.status, 'COMPLETED');
        assert.equal(assessmentAfter.score, jobResult.score);
        assert.equal(assessmentAfter.grade, jobResult.grade);
        assert.ok(assessmentAfter.completedAt);

        // F. Target Lock Released in DB
        const targetAfter = await prisma.target.findUnique({
          where: { id: liveTargetId },
        });
        assert.ok(targetAfter);
        assert.equal(targetAfter.activeAssessmentId, null, 'Target lock must be released (null)');
        assert.ok(targetAfter.lastAssessedAt, 'lastAssessedAt must be recorded');

        // G. All 6 Categories evaluated in CheckResults
        const dbCheckResults = await prisma.checkResult.findMany({
          where: { assessmentId: liveAssessmentId },
        });
        assert.equal(dbCheckResults.length, 6, 'Exactly 6 check results must be recorded');
        const recordedModules = dbCheckResults.map((r) => r.checkModule);
        assert.ok(recordedModules.includes('TLS_HTTPS'));
        assert.ok(recordedModules.includes('SECURITY_HEADERS'));
        assert.ok(recordedModules.includes('COOKIES'));
        assert.ok(recordedModules.includes('DNS'));
        assert.ok(recordedModules.includes('EMAIL_SECURITY'));
        assert.ok(recordedModules.includes('EXPOSURE'));

        // H. Findings verified in DB
        const dbFindings = await prisma.finding.findMany({
          where: { assessmentId: liveAssessmentId },
        });
        assert.ok(Array.isArray(dbFindings));
        for (const finding of dbFindings) {
          assert.ok(finding.ruleId in RULES, `Finding ruleId ${finding.ruleId} must be registered`);
          assert.ok(finding.title);
          assert.ok(finding.severity);
          assert.ok(finding.recommendation);
          assert.ok(finding.evidence !== null);
        }

        // I. Assessment Summary verified in DB
        const dbSummary = await prisma.assessmentSummary.findUnique({
          where: { assessmentId: liveAssessmentId },
        });
        assert.ok(dbSummary);
        assert.equal(dbSummary.totalChecks, 6);
        assert.ok(dbSummary.categoryScores);

        // J. Results retrieval via API (GET /api/v1/assessments/:id)
        const getAssessmentRes = await app.inject({
          method: 'GET',
          url: `/api/v1/assessments/${liveAssessmentId}`,
          headers: { authorization: `Bearer ${tokenA}` },
        });
        assert.equal(getAssessmentRes.statusCode, 200);
        const fetchedAssessment = JSON.parse(getAssessmentRes.body);
        assert.equal(fetchedAssessment.id, liveAssessmentId);
        assert.equal(fetchedAssessment.status, 'COMPLETED');
        assert.equal(fetchedAssessment.score, jobResult.score);
        assert.equal(fetchedAssessment.checkResults.length, 6);
        assert.ok(fetchedAssessment.summary);

        // K. Findings retrieval via API (GET /api/v1/assessments/:id/findings)
        const getFindingsRes = await app.inject({
          method: 'GET',
          url: `/api/v1/assessments/${liveAssessmentId}/findings`,
          headers: { authorization: `Bearer ${tokenA}` },
        });
        assert.equal(getFindingsRes.statusCode, 200);
        const fetchedFindings = JSON.parse(getFindingsRes.body);
        assert.ok(Array.isArray(fetchedFindings.findings));

        // L. Target History retrieval via API (GET /api/v1/targets/:targetId/history)
        const getHistoryRes = await app.inject({
          method: 'GET',
          url: `/api/v1/targets/${liveTargetId}/history`,
          headers: { authorization: `Bearer ${tokenA}` },
        });
        assert.equal(getHistoryRes.statusCode, 200);
        const historyBody = JSON.parse(getHistoryRes.body);
        assert.ok(historyBody.target);
        assert.equal(historyBody.target.id, liveTargetId);
        assert.ok(Array.isArray(historyBody.history));
        assert.equal(historyBody.history.length, 1);
        assert.equal(historyBody.history[0].id, liveAssessmentId);

        // M. Targets listing for Dashboard (GET /api/v1/targets)
        const getTargetsRes = await app.inject({
          method: 'GET',
          url: '/api/v1/targets',
          headers: { authorization: `Bearer ${tokenA}` },
        });
        assert.equal(getTargetsRes.statusCode, 200);
        const targetsBody = JSON.parse(getTargetsRes.body);
        assert.ok(Array.isArray(targetsBody.targets));
        const liveTargetItem = targetsBody.targets.find((t: any) => t.id === liveTargetId);
        assert.ok(liveTargetItem);
        assert.equal(liveTargetItem.latestScore, jobResult.score);
        assert.equal(liveTargetItem.latestGrade, jobResult.grade);
        assert.equal(liveTargetItem.assessmentCount, 1);
      });
    }
  );
});
