import { FindingCategory } from '../constants/categories.js';
import { FindingSeverity } from '../constants/severities.js';
import { CheckStatus } from './check.js';

export interface Finding {
  id: string;
  assessmentId: string;
  checkResultId?: string | null;
  ruleId: string;
  category: FindingCategory;
  title: string;
  severity: FindingSeverity;
  description: string;
  whyItMatters: string;
  potentialImpact: string;
  evidence: Record<string, any>;
  recommendation: string;
  remediationCode?: string;
  referenceUrl: string;
  scoreDeduction: number;
  createdAt: string;
}

export type SeverityCounts = Record<FindingSeverity, number>;

export interface CategoryScore {
  score: number | null;
  count: number;
  status?: CheckStatus;
  error?: string;
}

export type CategoryScores = Record<FindingCategory, CategoryScore>;
