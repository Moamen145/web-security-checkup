import React, { useEffect, useState } from 'react';
import { Target } from '@wsc/shared';
import { api } from '../services/api.js';
import { useRouter } from '../context/RouterContext.js';
import {
  History,
  Search,
  Plus,
  Shield,
  RotateCw,
  GitCompare,
  ArrowRight,
  Globe2,
  Calendar,
  Layers,
} from 'lucide-react';

export const AssessmentHistoryPage: React.FC = () => {
  const { navigate } = useRouter();
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTargets();
  }, []);

  async function loadTargets() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTargets();
      setTargets(res.targets);
    } catch (err: any) {
      setError(err.message || 'Failed to load targets history.');
    } finally {
      setLoading(false);
    }
  }

  const filteredTargets = targets.filter((t) =>
    t.domain.toLowerCase().includes(searchTerm.toLowerCase().trim())
  );

  const totalScans = targets.reduce((sum, t) => sum + t.assessmentCount, 0);
  const targetsWithScore = targets.filter((t) => t.latestScore !== null && t.latestScore !== undefined);
  const avgScore =
    targetsWithScore.length > 0
      ? Math.round(targetsWithScore.reduce((sum, t) => sum + (t.latestScore || 0), 0) / targetsWithScore.length)
      : null;

  return (
    <div className="space-y-8 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <History className="w-5 h-5 text-cyan-400" />
            <h1 className="text-2xl font-bold text-white tracking-tight">Assessment History & Monitored Targets</h1>
          </div>
          <p className="text-xs text-slate-400">
            Track historical configuration posture, security grades, and remediation progress over time
          </p>
        </div>

        <button
          onClick={() => navigate('/scan')}
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
          <span className="text-[11px] text-slate-500 mt-1 block">Across evaluated targets</span>
        </div>

        <div className="p-5 rounded-2xl bg-[#0f172a] border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-mono uppercase tracking-wider">Total Audits Recorded</span>
            <Layers className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-white">{totalScans}</div>
          <span className="text-[11px] text-slate-500 mt-1 block">Historical assessments</span>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search domain or host..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono transition"
          />
        </div>
        <span className="text-xs font-mono text-slate-400">
          Showing {filteredTargets.length} of {targets.length} targets
        </span>
      </div>

      {/* Target Cards Grid / List */}
      {loading ? (
        <div className="py-20 text-center text-xs font-mono text-slate-500">
          Loading audit records...
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs text-center">
          {error}
        </div>
      ) : filteredTargets.length === 0 ? (
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl py-16 px-4 text-center space-y-3">
          <Shield className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-semibold text-white">
            {searchTerm ? 'No matching domains found' : 'No Monitored Targets Yet'}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchTerm
              ? 'Try modifying your search query or clear the filter.'
              : 'Launch your first non-destructive security scan to begin tracking your website posture.'}
          </p>
          {!searchTerm && (
            <button
              onClick={() => navigate('/scan')}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition"
            >
              <Plus className="w-4 h-4" /> Start First Assessment
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTargets.map((target) => (
            <div
              key={target.id}
              className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition space-y-4 group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white font-mono truncate group-hover:text-cyan-400 transition">
                    {target.domain}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 font-mono">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>
                      {target.lastAssessedAt
                        ? `Last scan: ${new Date(target.lastAssessedAt).toLocaleDateString()}`
                        : 'No scans completed'}
                    </span>
                  </div>
                </div>

                {target.latestScore !== null && target.latestScore !== undefined ? (
                  <div className="text-right flex-shrink-0">
                    <div className="flex items-baseline gap-1 justify-end">
                      <span className="text-xl font-bold font-mono text-cyan-400">{target.latestScore}</span>
                      <span className="text-[10px] text-slate-500 font-mono">/100</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300 uppercase">
                      Grade {target.latestGrade}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-500 font-mono px-2 py-1 rounded bg-slate-900 border border-slate-800">
                    Pending
                  </span>
                )}
              </div>

              <div className="pt-3 border-t border-slate-850 flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-slate-400">
                  {target.assessmentCount} {target.assessmentCount === 1 ? 'audit' : 'audits'} recorded
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/scan?domain=${encodeURIComponent(target.domain)}`)}
                    title="Launch new scan"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => navigate(`/compare?targetId=${target.id}`)}
                    title="Compare scans"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition"
                  >
                    <GitCompare className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => navigate(`/target/${target.id}/history`)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
                  >
                    <span>Timeline</span>
                    <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
