import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createAssessmentSchema, compareAssessmentsSchema } from '@wsc/shared';
import { AssessmentService } from './assessment.service.js';
import { resolveUserFromRequest } from '../auth/auth.routes.js';
import { progressBus } from '../../queue/progress.bus.js';
import { generateAiExplanation } from '../../scanner/ai/ai.advisor.js';
import { prisma } from '../../db/client.js';

export async function assessmentRoutes(fastify: FastifyInstance) {
  // Create Assessment
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await resolveUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Authentication required.' });
    }

    try {
      const parsed = createAssessmentSchema.parse(request.body);
      const result = await AssessmentService.createAssessment(user.id, parsed.domain);
      return reply.status(202).send(result);
    } catch (err: any) {
      const statusCode = err.statusCode || 400;
      return reply.status(statusCode).send({ error: err.message });
    }
  });

  // Compare Assessments
  fastify.get('/compare', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await resolveUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Authentication required.' });
    }

    try {
      const { baseId, compareId } = compareAssessmentsSchema.parse(request.query);
      const diff = await AssessmentService.compareAssessments(baseId, compareId, user.id);
      if (!diff) {
        return reply.status(404).send({ error: 'One or both assessments not found or unauthorized.' });
      }
      return reply.send(diff);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Get Assessment by ID
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const user = await resolveUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Authentication required.' });
    }

    const assessment = await AssessmentService.getAssessment(request.params.id, user.id);
    if (!assessment) {
      return reply.status(404).send({ error: 'Assessment not found.' });
    }

    return reply.send(assessment);
  });

  // Get Findings for Assessment
  fastify.get(
    '/:id/findings',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { severity?: string; category?: string };
      }>,
      reply: FastifyReply
    ) => {
      const user = await resolveUserFromRequest(request);
      if (!user) {
        return reply.status(401).send({ error: 'Authentication required.' });
      }

      const findings = await AssessmentService.getFindings(
        request.params.id,
        user.id,
        request.query
      );

      if (!findings) {
        return reply.status(404).send({ error: 'Assessment not found.' });
      }

      return reply.send({ findings });
    }
  );

  // SSE Stream for Real-Time Scan Progress
  fastify.get(
    '/:id/stream',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = await resolveUserFromRequest(request);
      if (!user) {
        return reply.status(401).send({ error: 'Authentication required.' });
      }

      const assessmentId = request.params.id;

      // SEC-01: Verify that assessment exists AND belongs to the authenticated user before establishing SSE
      const assessment = await prisma.assessment.findFirst({
        where: { id: assessmentId, userId: user.id },
        select: { id: true, status: true, errorMessage: true },
      });

      if (!assessment) {
        return reply.status(404).send({ error: 'Assessment not found.' });
      }

      // Establish Server-Sent Events headers
      reply.hijack();
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
      const origin = request.headers.origin;
      if (origin) {
        reply.raw.setHeader('Access-Control-Allow-Origin', origin);
        reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
      } else {
        reply.raw.setHeader('Access-Control-Allow-Origin', '*');
      }

      // 1. If already terminal in DB, immediately emit terminal event and close stream
      if (assessment.status === 'COMPLETED') {
        const terminalEvent = {
          assessmentId,
          status: 'COMPLETED',
          currentStage: 'COMPLETED',
          progressPercent: 100,
          message: 'Assessment completed.',
          timestamp: new Date().toISOString(),
        };
        reply.raw.write(`event: progress\ndata: ${JSON.stringify(terminalEvent)}\n\n`);
        reply.raw.end();
        return;
      }

      if (assessment.status === 'FAILED') {
        const terminalEvent = {
          assessmentId,
          status: 'FAILED',
          currentStage: 'ERROR',
          progressPercent: 100,
          message: assessment.errorMessage || 'Assessment execution failed.',
          timestamp: new Date().toISOString(),
        };
        reply.raw.write(`event: progress\ndata: ${JSON.stringify(terminalEvent)}\n\n`);
        reply.raw.end();
        return;
      }

      // 2. Check if progressBus has cached progress
      const cachedProgress = progressBus.getProgress(assessmentId);
      if (cachedProgress) {
        reply.raw.write(`event: progress\ndata: ${JSON.stringify(cachedProgress)}\n\n`);
        if (cachedProgress.status === 'COMPLETED' || cachedProgress.status === 'FAILED') {
          reply.raw.end();
          return;
        }
      } else {
        // Send initial synthetic QUEUED event if not yet picked up
        const queuedEvent = {
          assessmentId,
          status: 'QUEUED',
          currentStage: 'QUEUED',
          progressPercent: 0,
          message: 'Job queued, waiting for scanner worker...',
          timestamp: new Date().toISOString(),
        };
        reply.raw.write(`event: progress\ndata: ${JSON.stringify(queuedEvent)}\n\n`);
      }

      const onProgress = (event: any) => {
        reply.raw.write(`event: progress\ndata: ${JSON.stringify(event)}\n\n`);
        if (event.status === 'COMPLETED' || event.status === 'FAILED') {
          cleanup();
          reply.raw.end();
        }
      };

      const cleanup = () => {
        progressBus.removeListener(`progress:${assessmentId}`, onProgress);
      };

      progressBus.on(`progress:${assessmentId}`, onProgress);
      request.raw.on('close', cleanup);
    }
  );

  // Re-generate or fetch AI explanation
  fastify.post(
    '/:id/ai-explain',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = await resolveUserFromRequest(request);
      if (!user) {
        return reply.status(401).send({ error: 'Authentication required.' });
      }

      const assessment = await AssessmentService.getAssessment(request.params.id, user.id);
      if (!assessment || !assessment.findings) {
        return reply.status(404).send({ error: 'Assessment not found.' });
      }

      const aiResult = await generateAiExplanation(
        assessment.domain,
        assessment.score || 0,
        (assessment.grade || 'F') as any,
        assessment.findings
      );

      // Update in DB
      await prisma.assessmentSummary.upsert({
        where: { assessmentId: assessment.id },
        update: {
          aiExecutiveSummary: aiResult.executiveSummary,
          aiActionPlan: JSON.stringify(aiResult.actionPlan),
          aiModelVersion: aiResult.modelVersion,
        },
        create: {
          assessmentId: assessment.id,
          aiExecutiveSummary: aiResult.executiveSummary,
          aiActionPlan: JSON.stringify(aiResult.actionPlan),
          aiModelVersion: aiResult.modelVersion,
          categoryScores: '{}',
          countsBySeverity: '{}',
        },
      });

      return reply.send(aiResult);
    }
  );
}
