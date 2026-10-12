import crypto from 'node:crypto';
import { prisma } from '../../db/client.js';
import { scannerQueue } from '../../queue/scanner.queue.js';
import { ENV } from '../../config/env.js';
import {
  ComparisonResult,
  Finding,
  FindingCategory,
  FindingSeverity,
  ScoreGrade,
} from '@wsc/shared';

export class AssessmentService {
  static async createAssessment(userId: string, domain: string) {
    const cleanHostname = domain.toLowerCase().trim();
    const newAssessmentId = crypto.randomUUID();

    // 1. Find or create Target for user (upsert to prevent race conditions on initial target creation)
    const target = await prisma.target.upsert({
      where: {
        userId_normalizedHostname: {
          userId,
          normalizedHostname: cleanHostname,
        },
      },
      update: {},
      create: {
        userId,
        domain: cleanHostname,
        normalizedHostname: cleanHostname,
      },
    });

    // 2. Pre-check: if target already has an activeAssessmentId or active assessment
    if (target.activeAssessmentId) {
      const error: any = new Error('An assessment is already actively running or queued for this target domain.');
      error.statusCode = 409;
      throw error;
    }

    const activeScan = await prisma.assessment.findFirst({
      where: {
        targetId: target.id,
        status: { in: ['RUNNING', 'QUEUED'] },
      },
    });

    if (activeScan) {
      const error: any = new Error('An assessment is already actively running or queued for this target domain.');
      error.statusCode = 409;
      throw error;
    }

    // 3. Cooldown check: prevent running duplicate scans during cooldown window
    const cooldownSeconds = ENV.TARGET_COOLDOWN_SECONDS || 180;
    const cooldownMs = cooldownSeconds * 1000;

    const latestCompleted = await prisma.assessment.findFirst({
      where: { targetId: target.id, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
    });

    const lastAssessedTime = target.lastAssessedAt || latestCompleted?.completedAt || latestCompleted?.createdAt;
    if (lastAssessedTime) {
      const elapsedMs = Date.now() - new Date(lastAssessedTime).getTime();
      if (elapsedMs < cooldownMs) {
        const remainingSec = Math.ceil((cooldownMs - elapsedMs) / 1000);
        const error: any = new Error(
          `Target scan cooldown active. This target was recently assessed. Please wait ${remainingSec} second${remainingSec === 1 ? '' : 's'} before requesting another scan.`
        );
        error.statusCode = 429;
        throw error;
      }
    }

    // 4. Atomic row-level reservation: reserve target with newAssessmentId
    // Only succeeds if activeAssessmentId is null AND cooldown has expired (or was never assessed)
    const cooldownThreshold = new Date(Date.now() - cooldownMs);
    const reservation = await prisma.target.updateMany({
      where: {
        id: target.id,
        activeAssessmentId: null,
        OR: [
          { lastAssessedAt: null },
          { lastAssessedAt: { lte: cooldownThreshold } },
        ],
      },
      data: {
        activeAssessmentId: newAssessmentId,
      },
    });

    if (reservation.count === 0) {
      // Re-query target to determine exact reason (active assessment vs cooldown)
      const currentTarget = await prisma.target.findUnique({
        where: { id: target.id },
      });

      if (currentTarget?.activeAssessmentId) {
        const error: any = new Error('An assessment is already actively running or queued for this target domain.');
        error.statusCode = 409;
        throw error;
      }

      if (currentTarget?.lastAssessedAt) {
        const elapsedMs = Date.now() - new Date(currentTarget.lastAssessedAt).getTime();
        if (elapsedMs < cooldownMs) {
          const remainingSec = Math.ceil((cooldownMs - elapsedMs) / 1000);
          const error: any = new Error(
            `Target scan cooldown active. This target was recently assessed. Please wait ${remainingSec} second${remainingSec === 1 ? '' : 's'} before requesting another scan.`
          );
          error.statusCode = 429;
          throw error;
        }
      }

      const error: any = new Error('An assessment is already actively running or queued for this target domain.');
      error.statusCode = 409;
      throw error;
    }

    // 5. Create Assessment record with status QUEUED
    let assessment;
    try {
      assessment = await prisma.assessment.create({
        data: {
          id: newAssessmentId,
          targetId: target.id,
          userId,
          domain: cleanHostname,
          status: 'QUEUED',
        },
      });
    } catch (createErr: any) {
      // Release target reservation if assessment record creation failed
      await prisma.target.update({
        where: { id: target.id },
        data: { activeAssessmentId: null },
      });
      throw createErr;
    }

    // 6. Enqueue background scan job with failure rollback
    try {
      await scannerQueue.enqueue({
        assessmentId: assessment.id,
        domain: cleanHostname,
        userId,
      });
    } catch (enqueueErr: any) {
      // Rollback target reservation and mark assessment as FAILED
      await prisma.$transaction([
        prisma.target.update({
          where: { id: target.id },
          data: { activeAssessmentId: null },
        }),
        prisma.assessment.update({
          where: { id: assessment.id },
          data: {
            status: 'FAILED',
            errorMessage: 'Failed to enqueue assessment job: ' + enqueueErr.message,
            completedAt: new Date(),
          },
        }),
      ]);
      throw enqueueErr;
    }

    return {
      assessmentId: assessment.id,
      targetId: target.id,
      status: 'QUEUED',
      createdAt: assessment.createdAt.toISOString(),
    };
  }

  static async getAssessment(assessmentId: string, userId: string) {
    const assessment = await prisma.assessment.findFirst({
      where: { id: assessmentId, userId },
      include: {
        summary: true,
        checkResults: true,
        findings: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!assessment) {
      return null;
    }

    let parsedSummary = null;
    if (assessment.summary) {
      parsedSummary = {
        ...assessment.summary,
        categoryScores: JSON.parse(assessment.summary.categoryScores || '{}'),
        countsBySeverity: JSON.parse(assessment.summary.countsBySeverity || '{}'),
        aiActionPlan: assessment.summary.aiActionPlan ? JSON.parse(assessment.summary.aiActionPlan) : [],
        generatedAt: assessment.summary.generatedAt.toISOString(),
      };
    }

    const parsedFindings = assessment.findings.map(this.deserializeFinding);

    const parsedCheckResults = assessment.checkResults.map((cr) => ({
      ...cr,
      rawEvidence: JSON.parse(cr.rawEvidence || '{}'),
      createdAt: cr.createdAt.toISOString(),
    }));

    return {
      ...assessment,
      startedAt: assessment.startedAt?.toISOString() || null,
      completedAt: assessment.completedAt?.toISOString() || null,
      createdAt: assessment.createdAt.toISOString(),
      summary: parsedSummary,
      findings: parsedFindings,
      checkResults: parsedCheckResults,
    };
  }

  static async getFindings(
    assessmentId: string,
    userId: string,
    filter?: { severity?: string; category?: string }
  ) {
    const assessment = await prisma.assessment.findFirst({
      where: { id: assessmentId, userId },
      select: { id: true },
    });

    if (!assessment) return null;

    const where: any = { assessmentId };
    if (filter?.severity) {
      where.severity = filter.severity;
    }
    if (filter?.category) {
      where.category = filter.category;
    }

    const findings = await prisma.finding.findMany({
      where,
      orderBy: [{ severity: 'asc' }, { scoreDeduction: 'desc' }],
    });

    return findings.map(this.deserializeFinding);
  }

  static async compareAssessments(
    baseId: string,
    compareId: string,
    userId: string
  ): Promise<ComparisonResult | null> {
    const [base, compare] = await Promise.all([
      prisma.assessment.findFirst({
        where: { id: baseId, userId },
        include: { findings: true },
      }),
      prisma.assessment.findFirst({
        where: { id: compareId, userId },
        include: { findings: true },
      }),
    ]);

    if (!base || !compare) return null;

    const baseFindings = base.findings.map(this.deserializeFinding);
    const compareFindings = compare.findings.map(this.deserializeFinding);

    const baseRuleMap = new Map<string, Finding>();
    baseFindings.forEach((f) => baseRuleMap.set(f.ruleId, f));

    const compareRuleMap = new Map<string, Finding>();
    compareFindings.forEach((f) => compareRuleMap.set(f.ruleId, f));

    const resolvedFindings: Finding[] = [];
    const persistingFindings: Finding[] = [];
    const newFindings: Finding[] = [];

    // Find resolved or persisting
    for (const [ruleId, baseFinding] of baseRuleMap.entries()) {
      if (compareRuleMap.has(ruleId)) {
        persistingFindings.push(compareRuleMap.get(ruleId)!);
      } else {
        resolvedFindings.push(baseFinding);
      }
    }

    // Find new findings
    for (const [ruleId, compareFinding] of compareRuleMap.entries()) {
      if (!baseRuleMap.has(ruleId)) {
        newFindings.push(compareFinding);
      }
    }

    const baseScore = base.score ?? 0;
    const compareScore = compare.score ?? 0;

    return {
      baseAssessment: {
        id: base.id,
        domain: base.domain,
        score: baseScore,
        grade: (base.grade || 'F') as ScoreGrade,
        createdAt: base.createdAt.toISOString(),
        findingCount: baseFindings.length,
      },
      compareAssessment: {
        id: compare.id,
        domain: compare.domain,
        score: compareScore,
        grade: (compare.grade || 'F') as ScoreGrade,
        createdAt: compare.createdAt.toISOString(),
        findingCount: compareFindings.length,
      },
      scoreDelta: compareScore - baseScore,
      resolvedFindings,
      persistingFindings,
      newFindings,
    };
  }

  private static deserializeFinding(f: any): Finding {
    return {
      id: f.id,
      assessmentId: f.assessmentId,
      checkResultId: f.checkResultId,
      ruleId: f.ruleId,
      category: f.category as FindingCategory,
      title: f.title,
      severity: f.severity as FindingSeverity,
      description: f.description,
      whyItMatters: f.whyItMatters,
      potentialImpact: f.potentialImpact,
      evidence: JSON.parse(f.evidence || '{}'),
      recommendation: f.recommendation,
      remediationCode: f.remediationCode || undefined,
      referenceUrl: f.referenceUrl,
      scoreDeduction: f.scoreDeduction,
      createdAt: f.createdAt.toISOString(),
    };
  }
}
