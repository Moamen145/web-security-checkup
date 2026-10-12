import { ScoreGrade } from '../constants/weights.js';
import { Finding, CategoryScores, SeverityCounts } from './finding.js';
import { CheckResult } from './check.js';

export const ASSESSMENT_STATUSES = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[keyof typeof ASSESSMENT_STATUSES];

export interface AssessmentSummary {
  id: string;
  assessmentId: string;
  categoryScores: CategoryScores;
  countsBySeverity: SeverityCounts;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  aiExecutiveSummary?: string | null;
  aiActionPlan?: Array<{
    priority: number;
    title: string;
    description: string;
    effort: 'LOW' | 'MEDIUM' | 'HIGH';
    category: string;
  }> | null;
  aiModelVersion?: string | null;
  generatedAt: string;
}

export interface Assessment {
  id: string;
  targetId: string;
  userId: string;
  domain: string;
  status: AssessmentStatus;
  score: number | null;
  grade: ScoreGrade | null;
  startedAt?: string | null;
  completedAt?: string | null;
  executionTimeMs?: number | null;
  errorMessage?: string | null;
  createdAt: string;
  summary?: AssessmentSummary | null;
  findings?: Finding[];
  checkResults?: CheckResult[];
}

export interface ComparisonResult {
  baseAssessment: {
    id: string;
    domain: string;
    score: number;
    grade: ScoreGrade;
    createdAt: string;
    findingCount: number;
  };
  compareAssessment: {
    id: string;
    domain: string;
    score: number;
    grade: ScoreGrade;
    createdAt: string;
    findingCount: number;
  };
  scoreDelta: number;
  resolvedFindings: Finding[];
  persistingFindings: Finding[];
  newFindings: Finding[];
}

export interface ScanProgressEvent {
  assessmentId: string;
  status: AssessmentStatus;
  currentStage: string;
  progressPercent: number;
  message: string;
  timestamp: string;
}
