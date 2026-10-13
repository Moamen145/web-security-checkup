import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { registerSchema, loginSchema } from '@wsc/shared';
import { AuthService } from './auth.service.js';
import { prisma } from '../../db/client.js';

export async function authRoutes(fastify: FastifyInstance) {
  // Register
  fastify.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const parsed = registerSchema.parse(request.body);
      const result = await AuthService.register(parsed);

      reply.setCookie('wsc_token', result.token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Login
  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const parsed = loginSchema.parse(request.body);
      const result = await AuthService.login(parsed);

      reply.setCookie('wsc_token', result.token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.status(200).send(result);
    } catch (err: any) {
      return reply.status(401).send({ error: err.message });
    }
  });

  // Logout
  fastify.post('/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie('wsc_token', { path: '/' });
    return reply.status(200).send({ message: 'Logged out successfully.' });
  });

  // Me
  fastify.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await resolveUserFromRequest(request);
    if (!user) {
      return reply.status(401).send({ error: 'Unauthenticated.' });
    }
    return reply.send({ user });
  });
}

export async function resolveUserFromRequest(request: FastifyRequest): Promise<any | null> {
  let token: string | undefined = undefined;

  // Check Bearer header
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if ((request as any).cookies?.wsc_token) {
    // Check Cookie
    token = (request as any).cookies.wsc_token;
  }

  if (!token) return null;

  try {
    const payload = AuthService.verifyToken(token);
    if (payload.scope === 'stream') {
      return null;
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, fullName: true, role: true, createdAt: true },
    });
    return user;
  } catch {
    return null;
  }
}
