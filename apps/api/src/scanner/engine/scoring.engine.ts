import {
  Finding,
  SeverityCounts,
  CategoryScores,
  FindingCategory,
  CheckStatus,
  CRITICAL_SCORE_CAPS,
  calculateGrade,
  ScoreGrade,
  CATEGORIES,
} from '@wsc/shared';

export interface CheckModuleStatusInput {
  checkModule: FindingCategory | string;
  status: CheckStatus | string;
  error?: string;
  rawEvidence?: Record<string, any>;
}

export interface ScoreCalculationResult {
  score: number;
  grade: ScoreGrade;
  totalDeductions: number;
  appliedCap?: number;
  countsBySeverity: SeverityCounts;
  categoryScores: CategoryScores;
}

export function computeSecurityScore(
  findings: Finding[],
  checkResults?: CheckModuleStatusInput[]
): ScoreCalculationResult {
  const countsBySeverity: SeverityCounts = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    INFO: 0,
  };

  const categoryDeductions: Record<FindingCategory, number> = {
    TLS_HTTPS: 0,
    SECURITY_HEADERS: 0,
    COOKIES: 0,
    DNS: 0,
    EMAIL_SECURITY: 0,
    EXPOSURE: 0,
  };

  const categoryFindingCounts: Record<FindingCategory, number> = {
    TLS_HTTPS: 0,
    SECURITY_HEADERS: 0,
    COOKIES: 0,
    DNS: 0,
    EMAIL_SECURITY: 0,
    EXPOSURE: 0,
  };

  let totalDeductions = 0;

  for (const finding of findings) {
    if (countsBySeverity[finding.severity] !== undefined) {
      countsBySeverity[finding.severity]++;
    }

    totalDeductions += finding.scoreDeduction;

    if (categoryDeductions[finding.category] !== undefined) {
      categoryDeductions[finding.category] += finding.scoreDeduction;
      categoryFindingCounts[finding.category]++;
    }
  }

  // Base score deduction
  let rawScore = 100 - totalDeductions;
  let appliedCap: number | undefined = undefined;

  // Apply critical finding caps
  if (countsBySeverity.CRITICAL >= 2) {
    if (rawScore > CRITICAL_SCORE_CAPS.MULTIPLE_CRITICAL_MAX_SCORE) {
      appliedCap = CRITICAL_SCORE_CAPS.MULTIPLE_CRITICAL_MAX_SCORE;
      rawScore = CRITICAL_SCORE_CAPS.MULTIPLE_CRITICAL_MAX_SCORE;
    }
  } else if (countsBySeverity.CRITICAL === 1) {
    if (rawScore > CRITICAL_SCORE_CAPS.ONE_CRITICAL_MAX_SCORE) {
      appliedCap = CRITICAL_SCORE_CAPS.ONE_CRITICAL_MAX_SCORE;
      rawScore = CRITICAL_SCORE_CAPS.ONE_CRITICAL_MAX_SCORE;
    }
  }

  // Normalized bounds [0, 100]
  const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));
  const grade = calculateGrade(finalScore);

  // Map check results to their respective modules
  const checkStatusMap = new Map<string, CheckModuleStatusInput>();
  if (checkResults) {
    for (const cr of checkResults) {
      checkStatusMap.set(cr.checkModule, cr);
    }
  }

  // Compute category scores (each out of 100, or null if check had an error/was unavailable)
  const categoryScores: CategoryScores = {} as CategoryScores;
  for (const catKey of Object.values(CATEGORIES)) {
    const checkResult = checkStatusMap.get(catKey);
    const catDeductions = categoryDeductions[catKey] || 0;
    const count = categoryFindingCounts[catKey] || 0;

    if (checkResult && checkResult.status === 'ERROR') {
      categoryScores[catKey] = {
        score: null,
        count,
        status: 'ERROR',
        error: checkResult.error || (checkResult.rawEvidence?.error as string) || 'Check unavailable due to network failure',
      };
    } else {
      categoryScores[catKey] = {
        score: Math.max(0, 100 - catDeductions),
        count,
        status: count > 0 ? (catDeductions >= 25 ? 'FAIL' : 'WARN') : 'PASS',
      };
    }
  }

  return {
    score: finalScore,
    grade,
    totalDeductions,
    appliedCap,
    countsBySeverity,
    categoryScores,
  };
}
