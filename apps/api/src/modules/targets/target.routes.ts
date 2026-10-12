import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../db/client.js';
import { resolveUserFromRequest } from '../auth/auth.routes.js';

export async function targetRoutes(fastify: FastifyInstance) {
  // List targets for user
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await resolveUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Authentication required.' });
    }

    const targets = await prisma.target.findMany({
      where: { userId: user.id },
      include: {
        assessments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { score: true, grade: true, status: true, createdAt: true },
        },
        _count: {
          select: { assessments: true },
        },
      },
      orderBy: { lastAssessedAt: 'desc' },
    });

    const mapped = targets.map((t) => {
      const latest = t.assessments[0];
      return {
        id: t.id,
        userId: t.userId,
        domain: t.domain,
        normalizedHostname: t.normalizedHostname,
        isVerified: t.isVerified,
        isFavorite: t.isFavorite,
        lastAssessedAt: t.lastAssessedAt?.toISOString() || null,
        latestScore: latest ? latest.score : null,
        latestGrade: latest ? latest.grade : null,
        assessmentCount: t._count.assessments,
        createdAt: t.createdAt.toISOString(),
      };
    });

    return reply.send({ targets: mapped });
  });

  // Get scan history for a target
  fastify.get('/:targetId/history', async (request: FastifyRequest<{ Params: { targetId: string } }>, reply: FastifyReply) => {
    const user = await resolveUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Authentication required.' });
    }

    const target = await prisma.target.findFirst({
      where: { id: request.params.targetId, userId: user.id },
    });

    if (!target) {
      return reply.status(404).send({ error: 'Target not found.' });
    }

    const assessments = await prisma.assessment.findMany({
      where: { targetId: target.id, userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { findings: true },
        },
      },
    });

    const mapped = assessments.map((a) => ({
      id: a.id,
      domain: a.domain,
      status: a.status,
      score: a.score,
      grade: a.grade,
      executionTimeMs: a.executionTimeMs,
      findingCount: a._count.findings,
      createdAt: a.createdAt.toISOString(),
      completedAt: a.completedAt?.toISOString() || null,
    }));

    return reply.send({ target, history: mapped });
  });

  // Delete target
  fastify.delete('/:targetId', async (request: FastifyRequest<{ Params: { targetId: string } }>, reply: FastifyReply) => {
    const user = await resolveUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Authentication required.' });
    }

    await prisma.target.deleteMany({
      where: { id: request.params.targetId, userId: user.id },
    });

    return reply.send({ message: 'Target deleted.' });
  });
}
