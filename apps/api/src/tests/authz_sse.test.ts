import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { buildApp } from '../app.js';
import { prisma } from '../db/client.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { scannerQueue } from '../queue/scanner.queue.js';
import { FastifyInstance } from 'fastify';

describe('SEC-01: SSE IDOR Authorization Protection', () => {
  let app: FastifyInstance;
  let userA: any;
  let userB: any;
  let tokenA: string;
  let tokenB: string;
  let assessmentB: any;

  before(async () => {
    app = buildApp();
    await app.ready();

    // Create User A
    const emailA = `usera-${crypto.randomUUID()}@example.com`;
    userA = await prisma.user.create({
      data: {
        email: emailA,
        fullName: 'User A',
        passwordHash: 'hashed_password_placeholder',
        role: 'USER',
      },
    });
    tokenA = AuthService.generateToken({
      id: userA.id,
      email: userA.email,
      fullName: userA.fullName,
      role: 'USER',
      createdAt: userA.createdAt.toISOString(),
    });

    // Create User B
    const emailB = `userb-${crypto.randomUUID()}@example.com`;
    userB = await prisma.user.create({
      data: {
        email: emailB,
        fullName: 'User B',
        passwordHash: 'hashed_password_placeholder',
        role: 'USER',
      },
    });
    tokenB = AuthService.generateToken({
      id: userB.id,
      email: userB.email,
      fullName: userB.fullName,
      role: 'USER',
      createdAt: userB.createdAt.toISOString(),
    });

    // Create Target and Assessment belonging strictly to User B
    const targetB = await prisma.target.create({
      data: {
        userId: userB.id,
        domain: 'tenant-b-site.example.com',
        normalizedHostname: 'tenant-b-site.example.com',
      },
    });

    assessmentB = await prisma.assessment.create({
      data: {
        targetId: targetB.id,
        userId: userB.id,
        domain: 'tenant-b-site.example.com',
        status: 'RUNNING',
      },
    });

    // Seed progress cache in scanner queue so stream ends deterministically
    (scannerQueue as any).progressCache.set(assessmentB.id, {
      assessmentId: assessmentB.id,
      status: 'COMPLETED',
      currentStage: 'COMPLETED',
      progressPercent: 100,
      message: 'Assessment completed.',
      timestamp: new Date().toISOString(),
    });
  });

  after(async () => {
    // Cleanup DB records
    if (assessmentB) {
      await prisma.assessment.deleteMany({ where: { id: assessmentB.id } });
      await prisma.target.deleteMany({ where: { userId: userB.id } });
    }
    if (userA) await prisma.user.deleteMany({ where: { id: userA.id } });
    if (userB) await prisma.user.deleteMany({ where: { id: userB.id } });
    await app.close();
  });

  it("User A cannot subscribe to User B's assessment stream (IDOR rejected)", async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessmentB.id}/stream`,
      headers: {
        authorization: `Bearer ${tokenA}`,
      },
    });

    // Must return 404 Not Found without leaking existence
    assert.strictEqual(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error, 'Assessment not found.');

    // SSE headers must NOT have been set
    assert.notStrictEqual(res.headers['content-type'], 'text/event-stream');
  });

  it("User B CAN subscribe to User B's own assessment stream (Authorized)", async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessmentB.id}/stream`,
      headers: {
        authorization: `Bearer ${tokenB}`,
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.match(res.headers['content-type'] as string, /text\/event-stream/);
    assert.match(res.body, /event: progress/);
  });

  it('Unauthenticated user cannot subscribe to any stream', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessmentB.id}/stream`,
    });

    assert.strictEqual(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error, 'Authentication required.');
  });
});
