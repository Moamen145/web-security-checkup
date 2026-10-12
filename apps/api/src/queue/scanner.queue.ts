import { Queue, Job } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.js';
import { progressBus } from './progress.bus.js';
import { SCANNER_QUEUE_NAME, ScanJobData, ScanJobResult } from './scanner.worker.js';
import { ScanProgressEvent } from '@wsc/shared';

export interface ScanJob {
  assessmentId: string;
  domain: string;
  userId: string;
}

export class ScannerQueue {
  private queue: Queue<ScanJobData, ScanJobResult> | null = null;

  public getQueue(): Queue<ScanJobData, ScanJobResult> {
    if (!this.queue) {
      const connection = getRedisConnectionOptions();
      this.queue = new Queue<ScanJobData, ScanJobResult>(SCANNER_QUEUE_NAME, {
        connection,
        defaultJobOptions: {
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: { age: 3600, count: 500 },
          removeOnFail: { age: 86400, count: 1000 },
        },
      });

      this.queue.on('error', (err) => {
        console.error('[ScannerQueue] Redis queue error:', err.message);
      });
    }
    return this.queue;
  }

  public async enqueue(jobData: ScanJobData): Promise<Job<ScanJobData>> {
    // 1. Immediately emit QUEUED progress to progressBus for immediate SSE feedback
    progressBus.emitProgress(
      jobData.assessmentId,
      'QUEUED',
      0,
      'Job queued, waiting for scanner worker...',
      'QUEUED'
    );

    // 2. Add job to BullMQ with deterministic jobId to prevent duplicate queue entries
    const queue = this.getQueue();
    const job = await queue.add('scan', jobData, {
      jobId: `assessment-${jobData.assessmentId}`,
    });

    return job;
  }

  public getProgress(assessmentId: string): ScanProgressEvent | undefined {
    return progressBus.getProgress(assessmentId);
  }

  public get progressCache(): Map<string, ScanProgressEvent> {
    return (progressBus as any).progressCache;
  }

  public async getJob(assessmentId: string): Promise<Job<ScanJobData> | undefined> {
    const queue = this.getQueue();
    return queue.getJob(`assessment-${assessmentId}`);
  }

  public async close(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
  }

  // Forward event emitter methods to progressBus for backward compatibility
  public on(event: string, listener: (...args: any[]) => void): this {
    progressBus.on(event, listener);
    return this;
  }

  public once(event: string, listener: (...args: any[]) => void): this {
    progressBus.once(event, listener);
    return this;
  }

  public removeListener(event: string, listener: (...args: any[]) => void): this {
    progressBus.removeListener(event, listener);
    return this;
  }

  public off(event: string, listener: (...args: any[]) => void): this {
    progressBus.off(event, listener);
    return this;
  }

  public emit(event: string, ...args: any[]): boolean {
    return progressBus.emit(event, ...args);
  }
}

export const scannerQueue = new ScannerQueue();
