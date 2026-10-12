import React, { useEffect, useState } from 'react';
import { Target, ComparisonResult } from '@wsc/shared';
import { api } from '../services/api.js';
import { useRouter } from '../context/RouterContext.js';
import { DiffViewer } from '../components/assessment/DiffViewer.js';
import { GitCompare, ArrowRight, Loader2, AlertCircle } from 'lucide-react';

interface AssessmentComparePageProps {
  initialBaseId?: string;
  onNavigate?: (view: string, params?: any) => void;
}

export const AssessmentComparePage: React.FC<AssessmentComparePageProps> = ({
  initialBaseId,
}) => {
  const { searchParams } = useRouter();
  const queryBaseId = searchParams.get('baseId') || initialBaseId || '';
  const queryCompareId = searchParams.get('compareId') || '';
  const queryTargetId = searchParams.get('targetId') || '';

  const [targets, setTargets] = useState<Target[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string>(queryTargetId);
  const [targetScans, setTargetScans] = useState<any[]>([]);
  const [baseId, setBaseId] = useState<string>(queryBaseId);
  const [compareId, setCompareId] = useState<string>(queryCompareId);
  const [diff, setDiff] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTargets();
  }, []);

  useEffect(() => {
    if (selectedTargetId) {
      loadHistory(selectedTargetId);
    }
  }, [selectedTargetId]);

  async function loadTargets() {
    try {
      const res = await api.getTargets();
      setTargets(res.targets);
      if (!selectedTargetId && res.targets.length > 0) {
        setSelectedTargetId(res.targets[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load targets');
    }
  }

  async function loadHistory(targetId: string) {
    try {
      const res = await api.getTargetHistory(targetId);
      setTargetScans(res.history);

      if (!baseId && !compareId) {
        if (res.history.length >= 2) {
          // Default base to older scan, compare to newer scan
          setBaseId(res.history[1].id);
          setCompareId(res.history[0].id);
        } else if (res.history.length === 1) {
          setBaseId(res.history[0].id);
        }
      }
    } catch (err: any) {
      console.error(err);
    }
  }

  const handleCompare = async () => {
    if (!baseId || !compareId) {
      setError('Please select both a baseline assessment and a comparison assessment.');
      return;
    }

    if (baseId === compareId) {
      setError('Please select two different assessments to compare.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await api.compareAssessments(baseId, compareId);
      setDiff(res);
    } catch (err: any) {
      setError(err.message || 'Comparison failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 py-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <GitCompare className="w-6 h-6 text-cyan-400" />
          <span>Assessment Comparison Tool</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Verify configuration remediation by comparing two historical scans on a domain.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Selectors Panel */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          {/* Target Domain Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Monitored Domain</label>
            <select
              value={selectedTargetId}
              onChange={(e) => setSelectedTargetId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
            >
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.domain} ({t.assessmentCount} scans)
                </option>
              ))}
            </select>
          </div>

          {/* Baseline Scan */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Baseline (Older Scan)</label>
            <select
              value={baseId}
              onChange={(e) => setBaseId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
            >
              <option value="">Select baseline scan...</option>
              {targetScans.map((s) => (
                <option key={s.id} value={s.id}>
                  {new Date(s.createdAt).toLocaleDateString()} — Score: {s.score}/100 (Grade {s.grade})
                </option>
              ))}
            </select>
          </div>

          {/* Compare Scan */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Current (Newer Scan)</label>
            <select
              value={compareId}
              onChange={(e) => setCompareId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
            >
              <option value="">Select comparison scan...</option>
              {targetScans.map((s) => (
                <option key={s.id} value={s.id}>
                  {new Date(s.createdAt).toLocaleDateString()} — Score: {s.score}/100 (Grade {s.grade})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={handleCompare}
            disabled={loading || !baseId || !compareId}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-cyan-500/20 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Computing Diff...</span>
              </>
            ) : (
              <>
                <span>Compare Assessments</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Comparison Results */}
      {diff && <DiffViewer diff={diff} />}
    </div>
  );
};
