import { FindingSeverity } from './severities.js';

export const SEVERITY_DEDUCTIONS: Record<FindingSeverity, number> = {
  CRITICAL: 25,
  HIGH: 15,
  MEDIUM: 8,
  LOW: 3,
  INFO: 0,
};

export const CRITICAL_SCORE_CAPS = {
  ONE_CRITICAL_MAX_SCORE: 65, // Grade D max if 1 critical finding exists
  MULTIPLE_CRITICAL_MAX_SCORE: 40, // Grade F max if 2+ critical findings exist
};

export const GRADE_THRESHOLDS = [
  { min: 90, grade: 'A', description: 'Exemplary security configuration' },
  { min: 80, grade: 'B', description: 'Good posture with minor improvements advised' },
  { min: 70, grade: 'C', description: 'Fair posture with notable gaps in defense' },
  { min: 50, grade: 'D', description: 'Deficient posture with high exposure risks' },
  { min: 0, grade: 'F', description: 'Critical security flaws detected' },
] as const;

export type ScoreGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export function calculateGrade(score: number): ScoreGrade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}
