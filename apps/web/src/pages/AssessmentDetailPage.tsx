import React, { useEffect, useState, useCallback } from 'react';
import {
  Assessment,
  Finding,
  FindingCategory,
  CATEGORIES,
  CATEGORY_LABELS,
} from '@wsc/shared';
import { api } from '../services/api.js';
import { useRouter } from '../context/RouterContext.js';
import { ScoreGauge } from '../components/assessment/ScoreGauge.js';
import { FindingCard } from '../components/assessment/FindingCard.js';
import { TopFixesWidget } from '../components/assessment/TopFixesWidget.js';
import { LiveScanViewer } from '../components/assessment/LiveScanViewer.js';
import { SeverityPill } from '../components/assessment/SeverityPill.js';
import {
  Printer,
  GitCompare,
  RotateCw,
  Sparkles,
  Shield,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  AlertCircle,
  ArrowLeft,
  X,
  Copy,
  Check,
  ExternalLink,
  Code2,
  Lock,
  FileCode,
  ShieldAlert,
  Globe,
  Mail,
  Cpu,
} from 'lucide-react';

interface AssessmentDetailPageProps {
  assessmentId?: string;
  onNavigate?: (view: string, params?: any) => void;
}

const CATEGORY_ICONS: Record<FindingCategory, React.ReactNode> = {
  TLS_HTTPS: <Lock className="w-4 h-4 text-cyan-400" />,
  SECURITY_HEADERS: <FileCode className="w-4 h-4 text-blue-400" />,
  COOKIES: <ShieldAlert className="w-4 h-4 text-indigo-400" />,
  DNS: <Globe className="w-4 h-4 text-purple-400" />,
  EMAIL_SECURITY: <Mail className="w-4 h-4 text-emerald-400" />,
  EXPOSURE: <Cpu className="w-4 h-4 text-amber-400" />,
};

export const AssessmentDetailPage: React.FC<AssessmentDetailPageProps> = ({
  assessmentId: propAssessmentId,
  onNavigate,
}) => {
  const { params, navigate } = useRouter();
  const assessmentId = propAssessmentId || params.id;

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [activeDrawerFinding, setActiveDrawerFinding] = useState<Finding | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const loadAssessment = useCallback(async () => {
    if (!assessmentId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAssessment(assessmentId);
      setAssessment(data);
    } catch (err: any) {
      console.error('Failed to load assessment:', err);
      setError(err.message || 'Assessment report could not be found.');
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    loadAssessment();
  }, [loadAssessment]);

  // Handle ESC key to close finding drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeDrawerFinding) {
        setActiveDrawerFinding(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDrawerFinding]);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const handleGoBack = () => {
    if (onNavigate) onNavigate('dashboard');
    navigate('/dashboard');
  };

  const handleReScan = () => {
    if (!assessment) return;
    if (onNavigate) onNavigate('new-scan', { domain: assessment.domain });
    navigate(`/scan?domain=${encodeURIComponent(assessment.domain)}`);
  };

  const handleCompare = () => {
    if (!assessment) return;
    if (onNavigate) onNavigate('compare', { baseId: assessment.id });
    navigate(`/compare?baseId=${assessment.id}`);
  };

  if (loading) {
    return (
      <div className="py-24 text-center space-y-3 font-mono text-xs text-slate-500">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p>Retrieving assessment report data...</p>
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="py-16 text-center space-y-4 max-w-md mx-auto">
        <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 w-12 h-12 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-white">Assessment Not Found</h2>
        <p className="text-xs text-slate-400">
          {error || 'The requested assessment could not be retrieved or does not exist.'}
        </p>
        <button
          onClick={handleGoBack}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition"
        >
          <ArrowLeft className="w-4 h-4" /> Return to Dashboard
        </button>
      </div>
    );
  }

  // If scan is still running or queued, embed live stream viewer
  if (assessment.status === 'RUNNING' || assessment.status === 'QUEUED') {
    return (
      <div className="py-12 space-y-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button
            onClick={handleGoBack}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
          <span className="text-xs font-mono text-cyan-400 uppercase tracking-wider">
            Assessment Status: {assessment.status}
          </span>
        </div>
        <LiveScanViewer
          assessmentId={assessment.id}
          domain={assessment.domain}
          onComplete={loadAssessment}
        />
      </div>
    );
  }

  const findings = assessment.findings || [];
  const summary = assessment.summary;
  const categoryScores = summary?.categoryScores || ({} as any);
  const counts = summary?.countsBySeverity || { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };

  // Filter findings
  const filteredFindings = findings.filter((f) => {
    if (selectedCategory !== 'ALL' && f.category !== selectedCategory) return false;
    if (selectedSeverity !== 'ALL' && f.severity !== selectedSeverity) return false;
    return true;
  });

  return (
    <div className="space-y-8 py-6">
      {/* Back button & Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <button
          onClick={handleGoBack}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReScan}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition"
          >
            <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
            <span>Re-scan</span>
          </button>

          <button
            onClick={handleCompare}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition"
          >
            <GitCompare className="w-3.5 h-3.5 text-indigo-400" />
            <span>Compare</span>
          </button>

          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-medium transition"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Main Scorecard Banner */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
          {/* Domain & Metadata */}
          <div className="space-y-3 flex-1 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-xs font-mono text-cyan-400">
              <Shield className="w-3.5 h-3.5" />
              <span>Assessment Report</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight">
              {assessment.domain}
            </h1>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 text-xs text-slate-400 font-mono">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                {assessment.completedAt ? new Date(assessment.completedAt).toLocaleString() : 'In Progress'}
              </span>
              <span>•</span>
              <span>Execution: {assessment.executionTimeMs}ms</span>
            </div>

            {/* Severity Distribution Pills */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 pt-2">
              <span className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-full font-mono font-semibold">
                {counts.CRITICAL} Critical
              </span>
              <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full font-mono font-semibold">
                {counts.HIGH} High
              </span>
              <span className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-1 rounded-full font-mono font-semibold">
                {counts.MEDIUM} Medium
              </span>
              <span className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-full font-mono font-semibold">
                {counts.LOW} Low
              </span>
              <span className="text-xs text-slate-400 bg-slate-500/10 border border-slate-500/20 px-2.5 py-1 rounded-full font-mono font-semibold">
                {counts.INFO} Info
              </span>
            </div>
          </div>

          {/* Overall Score Gauge */}
          <div className="flex-shrink-0">
            <ScoreGauge score={assessment.score || 0} grade={(assessment.grade || 'F') as any} size={190} />
          </div>
        </div>
      </div>

      {/* 6 Dimension Category Scorecards Grid */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider font-mono">
          Security Dimensions & Posture
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(Object.keys(CATEGORIES) as FindingCategory[]).map((catKey) => {
            const catScoreObj = categoryScores[catKey];
            const hasError = !catScoreObj || catScoreObj.status === 'ERROR' || catScoreObj.status === 'UNAVAILABLE' || catScoreObj.score === null;
            const scoreVal = catScoreObj?.score;
            const catLabel = CATEGORY_LABELS[catKey];
            const catFindingsCount = findings.filter((f) => f.category === catKey).length;

            return (
              <div
                key={catKey}
                onClick={() => {
                  setSelectedCategory(catKey);
                  setSelectedSeverity('ALL');
                }}
                className={`p-4 rounded-xl border transition cursor-pointer ${
                  selectedCategory === catKey
                    ? 'bg-slate-900 border-cyan-500/50 shadow-md shadow-cyan-500/10'
                    : 'bg-[#0f172a] border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                      {CATEGORY_ICONS[catKey]}
                    </div>
                    <span className="text-xs font-semibold text-slate-200">{catLabel}</span>
                  </div>

                  {hasError ? (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
                      UNAVAILABLE
                    </span>
                  ) : scoreVal! >= 80 ? (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                      PASS
                    </span>
                  ) : scoreVal! >= 60 ? (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/30 text-yellow-400">
                      WARN
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400">
                      FAIL
                    </span>
                  )}
                </div>

                <div className="flex items-baseline justify-between">
                  {hasError ? (
                    <div>
                      <span className="text-lg font-bold font-mono text-slate-500">N/A</span>
                      <p className="text-[11px] text-amber-400/90 mt-1 leading-snug">
                        Check unavailable or timed out. Category not factored into security grade.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-extrabold font-mono text-cyan-400">{scoreVal}</span>
                        <span className="text-xs text-slate-500 font-mono">/ 100</span>
                      </div>
                      <span className="text-xs font-mono text-slate-400">
                        {catFindingsCount} {catFindingsCount === 1 ? 'finding' : 'findings'}
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* "What Should I Fix First?" Top Fixes Widget */}
      <TopFixesWidget
        findings={findings}
        onSelectFinding={(f) => {
          setSelectedCategory(f.category);
          setSelectedSeverity('ALL');
          setActiveDrawerFinding(f);
        }}
      />

      {/* AI Executive Summary & Action Plan (if available) */}
      {summary?.aiExecutiveSummary && (
        <div className="bg-gradient-to-r from-slate-900 to-[#0f172a] border border-cyan-500/20 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white">Executive Security Synthesis</h3>
            <span className="text-[10px] font-mono text-cyan-400/80 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20 ml-auto">
              {summary.aiModelVersion || 'Deterministic synthesis'}
            </span>
          </div>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {summary.aiExecutiveSummary}
          </p>

          {summary.aiActionPlan && summary.aiActionPlan.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-800">
              <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider block mb-2 font-mono">
                Prioritized Action Plan
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {summary.aiActionPlan.map((action) => (
                  <div
                    key={action.priority}
                    className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono font-bold text-cyan-400">
                        #{action.priority} {action.title}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        Effort: {action.effort}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">{action.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Findings Section with Category & Severity Filter Tabs */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3 no-print">
          <div>
            <h2 className="text-base font-bold text-white">Security Findings</h2>
            <p className="text-xs text-slate-400">Showing {filteredFindings.length} of {findings.length} findings</p>
          </div>

          {/* Severity filter pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].map((sev) => (
              <button
                key={sev}
                onClick={() => setSelectedSeverity(sev)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition ${
                  selectedSeverity === sev
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-400'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2 no-print">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              selectedCategory === 'ALL'
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            All Categories ({findings.length})
          </button>
          {Object.entries(CATEGORIES).map(([catKey, catVal]) => {
            const count = findings.filter((f) => f.category === catVal).length;
            return (
              <button
                key={catKey}
                onClick={() => setSelectedCategory(catVal)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  selectedCategory === catVal
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                {CATEGORY_LABELS[catVal as FindingCategory]} ({count})
              </button>
            );
          })}
        </div>

        {/* Findings List */}
        <div className="space-y-4">
          {filteredFindings.length === 0 ? (
            <div className="py-12 text-center bg-[#0f172a] border border-slate-800 rounded-2xl p-6">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-200">No Findings in this Category</p>
              <p className="text-xs text-slate-400 mt-1">All checked directives satisfy defensive best practices.</p>
            </div>
          ) : (
            filteredFindings.map((finding) => (
              <div
                key={finding.id}
                onClick={() => setActiveDrawerFinding(finding)}
                className="cursor-pointer"
              >
                <FindingCard finding={finding} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Slide-over Drawer for Finding Details */}
      {activeDrawerFinding && (
        <div className="fixed inset-0 z-50 overflow-hidden no-print">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setActiveDrawerFinding(null)}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-2xl bg-[#0f172a] border-l border-slate-800 shadow-2xl p-6 sm:p-8 overflow-y-auto space-y-6">
              {/* Drawer Header */}
              <div className="flex items-start justify-between border-b border-slate-800 pb-5">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityPill severity={activeDrawerFinding.severity} size="sm" />
                    <span className="text-xs font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      {CATEGORY_LABELS[activeDrawerFinding.category]}
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      [{activeDrawerFinding.ruleId}]
                    </span>
                    {activeDrawerFinding.scoreDeduction > 0 && (
                      <span className="text-xs font-mono font-medium text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                        -{activeDrawerFinding.scoreDeduction} pts
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-bold text-white leading-snug">
                    {activeDrawerFinding.title}
                  </h2>
                </div>

                <button
                  onClick={() => setActiveDrawerFinding(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  aria-label="Close detail panel"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* The Problem */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-semibold">
                  Observed Problem
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-3.5 rounded-xl border border-slate-850">
                  {activeDrawerFinding.description}
                </p>
              </div>

              {/* Why It Matters & Potential Impact */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 uppercase tracking-wider">
                    <AlertTriangle className="w-4 h-4" /> Why It Matters
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed pt-1">
                    {activeDrawerFinding.whyItMatters}
                  </p>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-400 uppercase tracking-wider">
                    <XCircle className="w-4 h-4" /> Potential Impact
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed pt-1">
                    {activeDrawerFinding.potentialImpact}
                  </p>
                </div>
              </div>

              {/* Recommended Action */}
              <div className="space-y-1.5">
                <h3 className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-semibold">
                  Recommended Action
                </h3>
                <p className="text-xs text-slate-200 leading-relaxed bg-emerald-500/5 p-3.5 rounded-xl border border-emerald-500/20">
                  {activeDrawerFinding.recommendation}
                </p>
              </div>

              {/* Remediation Snippet */}
              {activeDrawerFinding.remediationCode && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-semibold flex items-center gap-1.5">
                      <Code2 className="w-3.5 h-3.5" /> Remediation Snippet
                    </span>
                    <button
                      onClick={() => handleCopyCode(activeDrawerFinding.remediationCode!)}
                      className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-white transition font-mono"
                    >
                      {copiedSnippet ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy Code
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-cyan-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {activeDrawerFinding.remediationCode}
                  </pre>
                </div>
              )}

              {/* Evidence Details */}
              {activeDrawerFinding.evidence && Object.keys(activeDrawerFinding.evidence).length > 0 && (
                <div className="space-y-1.5">
                  <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
                    Observed Server Evidence
                  </h3>
                  <pre className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
                    {JSON.stringify(activeDrawerFinding.evidence, null, 2)}
                  </pre>
                </div>
              )}

              {/* Documentation Reference Link */}
              {activeDrawerFinding.referenceUrl && (
                <div className="pt-2 border-t border-slate-800">
                  <a
                    href={activeDrawerFinding.referenceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:underline font-mono"
                  >
                    <span>View RFC / Security Standard Reference</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
