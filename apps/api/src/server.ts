import { buildApp } from './app.js';
import { ENV } from './config/env.js';
import { prisma } from './db/client.js';
import { scannerWorker } from './queue/scanner.worker.js';
import { scannerQueue } from './queue/scanner.queue.js';

async function start() {
  const app = buildApp();

  try {
    // Connect to database
    await prisma.$connect();
    console.log('Connected to database successfully.');

    // Start BullMQ Scanner Worker
    scannerWorker.start();

    await app.listen({
      port: ENV.PORT,
      host: ENV.HOST,
    });

    console.log(`Web Security Checkup API running on http://localhost:${ENV.PORT}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }

  const gracefulShutdown = async () => {
    console.log('Shutting down server...');
    try {
      await scannerWorker.close();
      await scannerQueue.close();
      await app.close();
      await prisma.$disconnect();
    } catch (shutdownErr) {
      console.error('Error during shutdown:', shutdownErr);
    }
    process.exit(0);
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

start();
