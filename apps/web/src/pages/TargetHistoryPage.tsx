import React, { useEffect, useState } from 'react';
import { Target } from '@wsc/shared';
import { api } from '../services/api.js';
import { useRouter } from '../context/RouterContext.js';
import { History, ArrowLeft, ArrowUpRight, ArrowDownRight, Minus, Eye, GitCompare, RotateCw } from 'lucide-react';

interface TargetHistoryPageProps {
  targetId?: string;
  onNavigate?: (view: string, params?: any) => void;
}

export const TargetHistoryPage: React.FC<TargetHistoryPageProps> = ({
  targetId: propTargetId,
  onNavigate,
}) => {
  const { params, navigate } = useRouter();
  const targetId = propTargetId || params.id;

  const [target, setTarget] = useState<Target | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (targetId) {
      loadHistory();
    }
  }, [targetId]);

  async function loadHistory() {
    setLoading(true);
    try {
      const res = await api.getTargetHistory(targetId!);
      setTarget(res.target);
      setHistory(res.history);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleGoBack = () => {
    if (onNavigate) onNavigate('dashboard');
    navigate('/dashboard');
  };

  const handleReScan = (domain: string) => {
    if (onNavigate) onNavigate('new-scan', { domain });
    navigate(`/scan?domain=${encodeURIComponent(domain)}`);
  };

  const handleViewAssessment = (assessmentId: string) => {
    if (onNavigate) onNavigate('detail', { assessmentId });
    navigate(`/assessment/${assessmentId}`);
  };

  const handleCompare = (baseId: string, compareId: string) => {
    if (onNavigate) onNavigate('compare', { baseId, compareId });
    navigate(`/compare?baseId=${baseId}&compareId=${compareId}`);
  };

  if (loading) {
    return <div className="py-24 text-center text-xs font-mono text-slate-500">Loading audit history...</div>;
  }

  if (!target) {
    return (
      <div className="py-16 text-center space-y-3">
        <p className="text-xs text-slate-400">Target not found or invalid target ID.</p>
        <button onClick={handleGoBack} className="text-xs text-cyan-400 hover:underline">
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-6">
      <button
        onClick={handleGoBack}
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <History className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Audit History & Trends</span>
          </div>
          <h1 className="text-2xl font-bold text-white font-mono">{target.domain}</h1>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            {history.length} assessment(s) recorded since {new Date(target.createdAt).toLocaleDateString()}
          </p>
        </div>

        <button
          onClick={() => handleReScan(target.domain)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition"
        >
          <RotateCw className="w-3.5 h-3.5" /> Run New Scan
        </button>
      </div>

      {/* History Timeline */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 text-xs font-semibold text-white">
          Chronological Audit Log
        </div>

        {history.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500 font-mono">
            No audits recorded for this domain yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {history.map((scan, idx) => {
              const nextScan = history[idx + 1];
              let delta = 0;
              if (nextScan && scan.score !== null && nextScan.score !== null) {
                delta = scan.score - nextScan.score;
              }

              return (
                <div
                  key={scan.id}
                  className="px-6 py-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-900/60 transition"
                >
                  <div className="min-w-[180px]">
                    <span className="font-mono text-sm text-slate-200">
                      {new Date(scan.createdAt).toLocaleString()}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono block mt-0.5">
                      {scan.findingCount} finding(s) detected • {scan.executionTimeMs}ms
                    </span>
                  </div>

                  <div className="flex items-center gap-6">
                    {/* Score & Delta */}
                    <div className="text-right min-w-[100px]">
                      <div className="flex items-baseline justify-end gap-1.5">
                        <span className="text-lg font-bold font-mono text-cyan-400">{scan.score}</span>
                        <span className="text-[10px] text-slate-500 font-mono">/ 100</span>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border border-slate-700 bg-slate-800 text-slate-300 uppercase">
                          {scan.grade}
                        </span>
                      </div>

                      {idx < history.length - 1 && (
                        <span
                          className={`text-[11px] font-mono inline-flex items-center gap-0.5 mt-0.5 ${
                            delta > 0
                              ? 'text-emerald-400'
                              : delta < 0
                                ? 'text-rose-400'
                                : 'text-slate-500'
                          }`}
                        >
                          {delta > 0 ? (
                            <>
                              <ArrowUpRight className="w-3 h-3" /> +{delta} pts
                            </>
                          ) : delta < 0 ? (
                            <>
                              <ArrowDownRight className="w-3 h-3" /> {delta} pts
                            </>
                          ) : (
                            <>
                              <Minus className="w-3 h-3" /> 0 pts
                            </>
                          )}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewAssessment(scan.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition"
                      >
                        <Eye className="w-3.5 h-3.5 text-cyan-400" /> View
                      </button>

                      {idx < history.length - 1 && (
                        <button
                          onClick={() => handleCompare(history[idx + 1].id, scan.id)}
                          title="Compare with previous scan"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                        >
                          <GitCompare className="w-4 h-4 text-indigo-400" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
