import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

dotenv.config();

// Ensure data folder exists for SQLite
const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const DEV_DEFAULT_JWT_SECRET = 'wsc-super-secret-production-grade-key-2026';

export interface AppConfig {
  PORT: number;
  HOST: string;
  NODE_ENV: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
  TARGET_COOLDOWN_SECONDS: number;
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  REDIS_URL?: string;
  SCANNER_CONCURRENCY: number;
}

export function validateConfig(rawEnv: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = rawEnv.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const jwtSecret = rawEnv.JWT_SECRET;

  if (isProduction) {
    if (!jwtSecret || jwtSecret.trim() === '' || jwtSecret === DEV_DEFAULT_JWT_SECRET) {
      throw new Error(
        'Configuration error: JWT_SECRET must be explicitly provided in production and cannot use development fallback.'
      );
    }
  }

  return {
    PORT: parseInt(rawEnv.PORT || '4000', 10),
    HOST: rawEnv.HOST || '0.0.0.0',
    NODE_ENV: nodeEnv,
    DATABASE_URL: rawEnv.DATABASE_URL || `file:${path.resolve(dataDir, 'dev.db')}`,
    JWT_SECRET: jwtSecret || DEV_DEFAULT_JWT_SECRET,
    CORS_ORIGIN: rawEnv.CORS_ORIGIN || 'http://localhost:5173',
    TARGET_COOLDOWN_SECONDS: parseInt(rawEnv.TARGET_COOLDOWN_SECONDS || '180', 10),
    REDIS_HOST: rawEnv.REDIS_HOST || 'localhost',
    REDIS_PORT: parseInt(rawEnv.REDIS_PORT || '6379', 10),
    REDIS_PASSWORD: rawEnv.REDIS_PASSWORD || undefined,
    REDIS_URL: rawEnv.REDIS_URL || undefined,
    SCANNER_CONCURRENCY: parseInt(rawEnv.SCANNER_CONCURRENCY || '3', 10),
  };
}

export const ENV = validateConfig(process.env);
