import { CheckModuleExecutionResult } from '@wsc/shared';
import { IScannerCheck, CheckExecutionContext } from './check.interface.js';

export const DEFAULT_CHECK_TIMEOUT_MS = 10000;

/**
 * Executes a scanner check with complete error and timeout isolation.
 * Guarantees that neither an unexpected exception nor a hanging network operation
 * can crash or stall the parent assessment pipeline.
 */
export async function executeIsolatedCheck(
  check: IScannerCheck,
  context: CheckExecutionContext
): Promise<CheckModuleExecutionResult> {
  const startTime = Date.now();
  const timeoutMs = check.meta.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
  const abortController = new AbortController();

  let onParentAbort: (() => void) | null = null;
  // If a parent cancellation signal is provided, propagate abort
  if (context.signal) {
    if (context.signal.aborted) {
      abortController.abort();
    } else {
      onParentAbort = () => abortController.abort();
      context.signal.addEventListener('abort', onParentAbort, { once: true });
    }
  }

  let timer: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<CheckModuleExecutionResult>((resolve) => {
    timer = setTimeout(() => {
      abortController.abort();
      const elapsed = Date.now() - startTime;
      resolve({
        module: check.meta.category,
        status: 'ERROR',
        executionTimeMs: elapsed,
        evidence: {
          error: `Check "${check.meta.name}" timed out after ${timeoutMs}ms.`,
          timeout: true,
        },
        findings: [],
        error: `Check "${check.meta.name}" timed out after ${timeoutMs}ms.`,
      });
    }, timeoutMs);
  });

  try {
    const executionPromise = (async (): Promise<CheckModuleExecutionResult> => {
      try {
        const result = await check.execute({
          ...context,
          signal: abortController.signal,
        });

        // Ensure module property matches metadata category
        return {
          ...result,
          module: result.module || check.meta.category,
          executionTimeMs: result.executionTimeMs ?? Date.now() - startTime,
        };
      } catch (err: any) {
        const elapsed = Date.now() - startTime;
        return {
          module: check.meta.category,
          status: 'ERROR',
          executionTimeMs: elapsed,
          evidence: {
            error: err.message || 'Check execution failed unexpectedly.',
            errorName: err.name,
          },
          findings: [],
          error: err.message || 'Check execution failed unexpectedly.',
        };
      }
    })();

    const finalResult = await Promise.race([executionPromise, timeoutPromise]);
    return finalResult;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    if (context.signal && onParentAbort) {
      context.signal.removeEventListener('abort', onParentAbort);
    }
  }
}

