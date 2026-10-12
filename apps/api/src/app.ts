import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ENV } from './config/env.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { assessmentRoutes } from './modules/assessments/assessment.routes.js';
import { targetRoutes } from './modules/targets/target.routes.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: ENV.NODE_ENV === 'development',
  });

  // CORS
  app.register(cors, {
    origin: true, // Allow web frontend
    credentials: true,
  });

  // Security Headers
  app.register(helmet, {
    contentSecurityPolicy: false, // Managed per-frontend
  });

  // Cookie Support
  app.register(cookie);

  // Rate Limiting
  app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
  });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // API v1 Routes
  app.register(authRoutes, { prefix: '/api/v1/auth' });
  app.register(assessmentRoutes, { prefix: '/api/v1/assessments' });
  app.register(targetRoutes, { prefix: '/api/v1/targets' });

  return app;
}
