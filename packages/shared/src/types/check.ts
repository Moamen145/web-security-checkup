import { FindingCategory } from '../constants/categories.js';

export const CHECK_STATUSES = {
  PASS: 'PASS',
  WARN: 'WARN',
  FAIL: 'FAIL',
  INFO: 'INFO',
  ERROR: 'ERROR',
} as const;

export type CheckStatus = (typeof CHECK_STATUSES)[keyof typeof CHECK_STATUSES];

export interface CheckResult {
  id: string;
  assessmentId: string;
  checkModule: FindingCategory;
  status: CheckStatus;
  executionTimeMs: number;
  rawEvidence: Record<string, any>;
  createdAt: string;
}

export interface CheckModuleExecutionResult {
  module: FindingCategory;
  status: CheckStatus;
  executionTimeMs: number;
  evidence: Record<string, any>;
  findings: Array<{
    ruleId: string;
    customDescription?: string;
    customEvidence?: Record<string, any>;
  }>;
  error?: string;
}

export interface ScannerCheckMeta {
  id: string;
  category: FindingCategory;
  name: string;
  description: string;
  timeoutMs?: number;
}
