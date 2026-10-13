import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../db/client.js';
import { ENV } from '../../config/env.js';
import { RegisterInput, LoginInput, User } from '@wsc/shared';

export class AuthService {
  static async register(input: RegisterInput): Promise<{ user: User; token: string }> {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existing) {
      throw new Error('An account with this email address already exists.');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(input.password, salt);

    const created = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        role: 'USER',
      },
    });

    const user: User = {
      id: created.id,
      email: created.email,
      fullName: created.fullName,
      role: created.role as any,
      createdAt: created.createdAt.toISOString(),
    };

    const token = this.generateToken(user);
    return { user, token };
  }

  static async login(input: LoginInput): Promise<{ user: User; token: string }> {
    const found = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!found) {
      throw new Error('Invalid email or password.');
    }

    const valid = await bcrypt.compare(input.password, found.passwordHash);
    if (!valid) {
      throw new Error('Invalid email or password.');
    }

    const user: User = {
      id: found.id,
      email: found.email,
      fullName: found.fullName,
      role: found.role as any,
      createdAt: found.createdAt.toISOString(),
    };

    const token = this.generateToken(user);
    return { user, token };
  }

  static generateToken(user: User): string {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
      },
      ENV.JWT_SECRET,
      { expiresIn: '7d' }
    );
  }

  static verifyToken(token: string): any {
    return jwt.verify(token, ENV.JWT_SECRET);
  }

  static generateStreamToken(userId: string, assessmentId: string): string {
    return jwt.sign(
      {
        sub: userId,
        assessmentId,
        scope: 'stream',
      },
      ENV.JWT_SECRET,
      { expiresIn: '5m' }
    );
  }

  static verifyStreamToken(token: string, assessmentId: string): { userId: string } {
    const payload = jwt.verify(token, ENV.JWT_SECRET) as any;
    if (payload.scope !== 'stream' || payload.assessmentId !== assessmentId || !payload.sub) {
      throw new Error('Invalid or expired stream token.');
    }
    return { userId: payload.sub };
  }
}
