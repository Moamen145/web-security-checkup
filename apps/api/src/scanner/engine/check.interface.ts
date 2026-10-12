import { CheckModuleExecutionResult, ScannerCheckMeta } from '@wsc/shared';
import { ValidatedTarget } from '../network/ssrf.guard.js';

export interface CheckExecutionContext {
  assessmentId: string;
  domain: string;
  target: ValidatedTarget;
  signal?: AbortSignal;
}

export interface IScannerCheck {
  readonly meta: ScannerCheckMeta;
  execute(context: CheckExecutionContext): Promise<CheckModuleExecutionResult>;
}
