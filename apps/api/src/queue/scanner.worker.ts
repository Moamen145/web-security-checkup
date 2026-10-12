import { Job, Worker, UnrecoverableError } from 'bullmq';
import { prisma } from '../db/client.js';
import { executeSecurityScan } from '../scanner/engine/scanner.runner.js';
import { progressBus } from './progress.bus.js';
import { getRedisConnectionOptions } from '../config/redis.js';
import { ENV } from '../config/env.js';

export const SCANNER_QUEUE_NAME = 'scanner-jobs';

export interface ScanJobData {
  assessmentId: string;
  domain: string;
  userId: string;
}

export interface ScanJobResult {
  assessmentId: string;
  score: number;
  grade: string;
  executionTimeMs: number;
  findingsCount: number;
}

/**
 * Dedicated core scanner job processor.
 * Performs all 10 worker responsibilities deterministically.
 */
export async function processScanJob(
  jobData: ScanJobData,
  job?: Job<ScanJobData>,
  scanRunner: typeof executeSecurityScan = executeSecurityScan
): Promise<ScanJobResult> {
  const startTime = Date.now();

  // 1. Validate required job data
  if (!jobData || !jobData.assessmentId || !jobData.domain || !jobData.userId) {
    throw new UnrecoverableError(
      'Invalid job payload: assessmentId, domain, and userId are required.'
    );
  }

  const { assessmentId, domain, userId } = jobData;

  // 2. Load the assessment from database
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { id: true, status: true, targetId: true, userId: true },
  });

  if (!assessment) {
    throw new UnrecoverableError(`Assessment ${assessmentId} not found in database.`);
  }

  // 3. Idempotency & validity check: avoid duplicate execution
  if (assessment.status === 'COMPLETED') {
    console.log(`[ScannerWorker] Assessment ${assessmentId} is already COMPLETED. Skipping duplicate execution.`);
    return {
      assessmentId,
      score: 0,
      grade: 'N/A',
      executionTimeMs: 0,
      findingsCount: 0,
    };
  }

  if (assessment.status === 'FAILED') {
    console.log(`[ScannerWorker] Assessment ${assessmentId} is already marked FAILED. Skipping.`);
    return {
      assessmentId,
      score: 0,
      grade: 'N/A',
      executionTimeMs: 0,
      findingsCount: 0,
    };
  }

  // 4. Transition assessment to RUNNING
  await prisma.assessment.update({
    where: { id: assessmentId },
    data: { status: 'RUNNING', startedAt: new Date() },
  });

  progressBus.emitProgress(
    assessmentId,
    'INITIALIZING',
    10,
    'Worker picked up assessment job. Preparing scanner...',
    'RUNNING'
  );

  console.log(`[ScannerWorker] Started scan for ${assessmentId} (${domain})`);

  try {
    // 5. Execute scanner runner with real-time progress callbacks
    const scanResult = await scanRunner(
      assessmentId,
      domain,
      (stage, percent, message) => {
        progressBus.emitProgress(assessmentId, stage, percent, message, 'RUNNING');
      }
    );

    // 6. Persist results in Prisma transaction
    await prisma.$transaction(async (tx) => {
      // Idempotency: verify findings not already written
      const existingFindings = await tx.finding.count({
        where: { assessmentId },
      });

      if (existingFindings === 0) {
        // Create check results
        for (const cr of scanResult.checkResults) {
          await tx.checkResult.create({
            data: {
              id: cr.id,
              assessmentId: cr.assessmentId,
              checkModule: cr.checkModule,
              status: cr.status,
              executionTimeMs: cr.executionTimeMs,
              rawEvidence: JSON.stringify(cr.rawEvidence),
              createdAt: new Date(cr.createdAt),
            },
          });
        }

        // Create findings
        for (const f of scanResult.findings) {
          await tx.finding.create({
            data: {
              id: f.id,
              assessmentId: f.assessmentId,
              checkResultId: f.checkResultId || null,
              ruleId: f.ruleId,
              category: f.category,
              title: f.title,
              severity: f.severity,
              description: f.description,
              whyItMatters: f.whyItMatters,
              potentialImpact: f.potentialImpact,
              evidence: JSON.stringify(f.evidence),
              recommendation: f.recommendation,
              remediationCode: f.remediationCode || null,
              referenceUrl: f.referenceUrl,
              scoreDeduction: f.scoreDeduction,
              createdAt: new Date(f.createdAt),
            },
          });
        }

        // Create assessment summary
        await tx.assessmentSummary.create({
          data: {
            id: scanResult.summary.id,
            assessmentId: scanResult.summary.assessmentId,
            categoryScores: JSON.stringify(scanResult.summary.categoryScores),
            countsBySeverity: JSON.stringify(scanResult.summary.countsBySeverity),
            totalChecks: scanResult.summary.totalChecks,
            passedChecks: scanResult.summary.passedChecks,
            failedChecks: scanResult.summary.failedChecks,
            aiExecutiveSummary: scanResult.summary.aiExecutiveSummary || null,
            aiActionPlan: scanResult.summary.aiActionPlan
              ? JSON.stringify(scanResult.summary.aiActionPlan)
              : null,
            aiModelVersion: scanResult.summary.aiModelVersion || null,
            generatedAt: new Date(scanResult.summary.generatedAt),
          },
        });
      }

      // 7. Transition assessment to COMPLETED
      await tx.assessment.update({
        where: { id: assessmentId },
        data: {
          status: 'COMPLETED',
          score: scanResult.score,
          grade: scanResult.grade,
          executionTimeMs: scanResult.executionTimeMs,
          completedAt: new Date(),
        },
      });

      // 8. Update target lastAssessedAt and clear activeAssessmentId lock
      if (assessment.targetId) {
        await tx.target.update({
          where: { id: assessment.targetId },
          data: {
            lastAssessedAt: new Date(),
            activeAssessmentId: null,
          },
        });
      }
    });

    // 9. Emit final COMPLETED progress event
    progressBus.emitProgress(
      assessmentId,
      'COMPLETED',
      100,
      'Security assessment successfully completed.',
      'COMPLETED'
    );

    console.log(
      `[ScannerWorker] Successfully completed assessment ${assessmentId} with score ${scanResult.score} (${scanResult.grade})`
    );

    return {
      assessmentId,
      score: scanResult.score,
      grade: scanResult.grade,
      executionTimeMs: Date.now() - startTime,
      findingsCount: scanResult.findings.length,
    };
  } catch (err: any) {
    const safeError = err.message || 'Scan execution encountered an unexpected error.';
    console.error(`[ScannerWorker] Scan failed for ${assessmentId}:`, safeError);

    const isUnrecoverable = err instanceof UnrecoverableError;
    const maxAttempts = job?.opts?.attempts ?? 1;
    const attemptsMade = job?.attemptsMade ?? 0;
    const hasRetriesRemaining = !isUnrecoverable && job !== undefined && attemptsMade < maxAttempts - 1;

    if (hasRetriesRemaining) {
      console.warn(
        `[ScannerWorker] Scan attempt ${attemptsMade + 1} of ${maxAttempts} failed for ${assessmentId}: ${safeError}. BullMQ retry will follow.`
      );

      // Keep status as RUNNING and keep target lock active during retry window
      await prisma.assessment.update({
        where: { id: assessmentId },
        data: {
          errorMessage: `Attempt ${attemptsMade + 1} failed: ${safeError}. Retrying...`,
        },
      });

      progressBus.emitProgress(
        assessmentId,
        'RETRYING',
        15,
        `Scan attempt ${attemptsMade + 1} failed. Retrying...`,
        'RUNNING'
      );
    } else {
      // 10. Terminal failure handling (attempts exhausted or unrecoverable error)
      await prisma.$transaction(async (tx) => {
        await tx.assessment.update({
          where: { id: assessmentId },
          data: {
            status: 'FAILED',
            errorMessage: safeError,
            completedAt: new Date(),
          },
        });

        if (assessment.targetId) {
          await tx.target.update({
            where: { id: assessment.targetId },
            data: { activeAssessmentId: null },
          });
        }
      });

      progressBus.emitProgress(
        assessmentId,
        'ERROR',
        100,
        safeError,
        'FAILED'
      );
    }

    throw err;
  }
}

/**
 * BullMQ Worker instance manager.
 */
export class ScannerWorker {
  private worker: Worker<ScanJobData, ScanJobResult> | null = null;

  public start(): Worker<ScanJobData, ScanJobResult> {
    if (this.worker) return this.worker;

    const connection = getRedisConnectionOptions();

    this.worker = new Worker<ScanJobData, ScanJobResult>(
      SCANNER_QUEUE_NAME,
      async (job: Job<ScanJobData>) => {
        return processScanJob(job.data, job);
      },
      {
        connection,
        concurrency: ENV.SCANNER_CONCURRENCY || 3,
        lockDuration: 60000,
        stalledInterval: 30000,
        maxStalledCount: 2,
      }
    );

    this.worker.on('active', (job) => {
      console.log(`[BullMQ Worker] Job ${job.id} active for assessment ${job.data.assessmentId}`);
    });

    this.worker.on('completed', (job) => {
      console.log(`[BullMQ Worker] Job ${job.id} completed for assessment ${job.data.assessmentId}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[BullMQ Worker] Job ${job?.id} failed:`, err.message);
    });

    this.worker.on('error', (err) => {
      console.error('[BullMQ Worker] Worker connection error:', err.message);
    });

    console.log(`[BullMQ Worker] Scanner worker initialized with concurrency ${ENV.SCANNER_CONCURRENCY || 3}`);
    return this.worker;
  }

  public async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[BullMQ Worker] Scanner worker shut down.');
    }
  }
}

export const scannerWorker = new ScannerWorker();
