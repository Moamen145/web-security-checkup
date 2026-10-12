import React, { useEffect, useState } from 'react';
import { Target } from '@wsc/shared';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.js';
import { useRouter } from '../context/RouterContext.js';
import { Shield, Plus, Globe2, History, Trash2, Activity, ArrowRight } from 'lucide-react';

interface DashboardPageProps {
  onNavigate?: (view: string, params?: any) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTargets();
  }, []);

  async function loadTargets() {
    try {
      const res = await api.getTargets();
      setTargets(res.targets);
    } catch (err) {
      console.error('Failed to load targets:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleDelete = async (targetId: string, domain: string) => {
    if (confirm(`Remove ${domain} and all its scan history?`)) {
      try {
        await api.deleteTarget(targetId);
        setTargets((prev) => prev.filter((t) => t.id !== targetId));
      } catch (err: any) {
        alert(err.message || 'Failed to delete target.');
      }
    }
  };

  const handleNewScan = (domain?: string) => {
    if (domain) {
      if (onNavigate) onNavigate('new-scan', { domain });
      navigate(`/scan?domain=${encodeURIComponent(domain)}`);
    } else {
      if (onNavigate) onNavigate('new-scan');
      navigate('/scan');
    }
  };

  const handleViewHistory = (targetId: string) => {
    if (onNavigate) onNavigate('history', { targetId });
    navigate(`/target/${targetId}/history`);
  };

  const totalScans = targets.reduce((sum, t) => sum + t.assessmentCount, 0);
  const targetsWithScore = targets.filter((t) => t.latestScore !== null && t.latestScore !== undefined);
  const avgScore =
    targetsWithScore.length > 0
      ? Math.round(targetsWithScore.reduce((sum, t) => sum + (t.latestScore || 0), 0) / targetsWithScore.length)
      : null;

  return (
    <div className="space-y-8 py-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Security Dashboard</h1>
          <p className="text-xs text-slate-400 mt-1">
            Welcome back, <span className="text-cyan-400 font-medium">{user?.fullName || user?.email}</span>. Continuous defensive posture monitoring.
          </p>
        </div>

        <button
          onClick={() => handleNewScan()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-cyan-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>New Assessment</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-[#0f172a] border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-mono uppercase tracking-wider">Monitored Domains</span>
            <Globe2 className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-white">{targets.length}</div>
          <span className="text-[11px] text-slate-500 mt-1 block">Active web properties</span>
        </div>

        <div className="p-5 rounded-2xl bg-[#0f172a] border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-mono uppercase tracking-wider">Average Security Score</span>
            <Shield className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-cyan-400">
            {avgScore !== null ? `${avgScore} / 100` : '—'}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Weighted external posture</span>
        </div>

        <div className="p-5 rounded-2xl bg-[#0f172a] border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-mono uppercase tracking-wider">Total Scans Executed</span>
            <Activity className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-white">{totalScans}</div>
          <span className="text-[11px] text-slate-500 mt-1 block">Historical audits recorded</span>
        </div>
      </div>

      {/* Targets Table / List */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Monitored Domains</h2>
          <span className="text-xs font-mono text-slate-400">{targets.length} targets</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-500 font-mono">Loading targets...</div>
        ) : targets.length === 0 ? (
          <div className="py-16 text-center px-4 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto">
              <Shield className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-white">No Domains Assessed Yet</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Enter any domain you own or are authorized to assess to generate your first security report.
            </p>
            <button
              onClick={() => handleNewScan()}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition"
            >
              <Plus className="w-4 h-4" /> Start First Assessment
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {targets.map((target) => (
              <div
                key={target.id}
                className="px-6 py-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-900/60 transition group"
              >
                <div
                  className="min-w-[200px] cursor-pointer"
                  onClick={() => handleViewHistory(target.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-white group-hover:text-cyan-400 transition">
                      {target.domain}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition" />
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">
                    Last checked: {target.lastAssessedAt ? new Date(target.lastAssessedAt).toLocaleString() : 'Never'}
                  </span>
                </div>

                <div className="flex items-center gap-6">
                  {target.latestScore !== null && target.latestScore !== undefined ? (
                    <div className="text-right">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-lg font-bold font-mono text-cyan-400">{target.latestScore}</span>
                        <span className="text-[11px] text-slate-500 font-mono">/ 100</span>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300 uppercase">
                        Grade {target.latestGrade}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500 font-mono">Pending</span>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleNewScan(target.domain)}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-mono font-medium transition"
                    >
                      Re-scan
                    </button>

                    <button
                      onClick={() => handleViewHistory(target.id)}
                      title="View Scan History & Trends"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                    >
                      <History className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleDelete(target.id, target.domain)}
                      title="Delete Monitored Target"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
