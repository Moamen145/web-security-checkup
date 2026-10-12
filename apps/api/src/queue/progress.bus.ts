import { EventEmitter } from 'node:events';
import { ScanProgressEvent } from '@wsc/shared';

class ProgressBus extends EventEmitter {
  private progressCache = new Map<string, ScanProgressEvent>();

  public emitProgress(
    assessmentId: string,
    stage: string,
    progressPercent: number,
    message: string,
    statusOverride?: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  ): ScanProgressEvent {
    const status =
      statusOverride ||
      (progressPercent === 100
        ? 'COMPLETED'
        : progressPercent === 0
        ? 'QUEUED'
        : 'RUNNING');

    const event: ScanProgressEvent = {
      assessmentId,
      status,
      currentStage: stage,
      progressPercent,
      message,
      timestamp: new Date().toISOString(),
    };

    this.progressCache.set(assessmentId, event);
    this.emit(`progress:${assessmentId}`, event);
    this.emit('progress', event);

    // Auto-cleanup terminal progress cache after 15 minutes
    if (status === 'COMPLETED' || status === 'FAILED') {
      const timer = setTimeout(() => {
        this.progressCache.delete(assessmentId);
      }, 15 * 60 * 1000);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    }

    return event;
  }

  public getProgress(assessmentId: string): ScanProgressEvent | undefined {
    return this.progressCache.get(assessmentId);
  }

  public clearProgress(assessmentId: string): void {
    this.progressCache.delete(assessmentId);
  }
}

export const progressBus = new ProgressBus();
