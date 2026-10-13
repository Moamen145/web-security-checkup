import { ConnectionOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { ENV } from './env.js';

export function getRedisConnectionOptions(): ConnectionOptions {
  if (ENV.REDIS_URL) {
    try {
      const parsed = new URL(ENV.REDIS_URL);
      const isTls = parsed.protocol === 'rediss:';
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port || '6379', 10),
        username: parsed.username || undefined,
        password: parsed.password || undefined,
        tls: isTls ? {} : undefined,
        maxRetriesPerRequest: null,
      };
    } catch {
      // Fall back to discrete host/port
    }
  }

  return {
    host: ENV.REDIS_HOST,
    port: ENV.REDIS_PORT,
    password: ENV.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };
}

export function createRedisClient(label = 'Client'): Redis {
  const options = getRedisConnectionOptions();
  const client = new Redis({
    ...options,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy(times) {
      if (times > 5) return null;
      return Math.min(times * 500, 2000);
    },
  });

  client.on('error', (err) => {
    console.error(`[Redis:${label}] Connection error: ${err.message}`);
  });

  return client;
}
