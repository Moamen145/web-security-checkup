import React, { useState } from 'react';
import { ComparisonResult } from '@wsc/shared';
import { SeverityPill } from './SeverityPill.js';
import { CheckCircle2, AlertTriangle, ArrowUpRight, ArrowDownRight, Minus, RefreshCw } from 'lucide-react';

interface DiffViewerProps {
  diff: ComparisonResult;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ diff }) => {
  const [activeTab, setActiveTab] = useState<'resolved' | 'new' | 'persisting'>('resolved');

  const isImproved = diff.scoreDelta > 0;
  const isDeclined = diff.scoreDelta < 0;

  return (
    <div className="space-y-6">
      {/* High-level score comparison banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Baseline Scan */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Baseline Assessment</span>
          <div className="flex items-baseline gap-3 mt-2">
            <span className="text-3xl font-bold font-mono text-slate-100">{diff.baseAssessment.score}</span>
            <span className="text-xs font-bold font-mono px-2 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300">
              Grade {diff.baseAssessment.grade}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-2 font-mono">
            {new Date(diff.baseAssessment.createdAt).toLocaleDateString()} • {diff.baseAssessment.findingCount} findings
          </p>
        </div>

        {/* Delta */}
        <div
          className={`border rounded-xl p-5 flex flex-col justify-center items-center text-center ${
            isImproved
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : isDeclined
                ? 'bg-rose-500/10 border-rose-500/30'
                : 'bg-slate-900 border-slate-800'
          }`}
        >
          <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Score Progression</span>
          <div className="flex items-center gap-1 mt-1">
            {isImproved ? (
              <ArrowUpRight className="w-6 h-6 text-emerald-400" />
            ) : isDeclined ? (
              <ArrowDownRight className="w-6 h-6 text-rose-400" />
            ) : (
              <Minus className="w-6 h-6 text-slate-400" />
            )}
            <span
              className={`text-3xl font-bold font-mono ${
                isImproved ? 'text-emerald-400' : isDeclined ? 'text-rose-400' : 'text-slate-300'
              }`}
            >
              {isImproved ? `+${diff.scoreDelta}` : diff.scoreDelta}
            </span>
          </div>
          <span className="text-xs text-slate-400 mt-1">
            {isImproved ? 'Configuration Hardened' : isDeclined ? 'Defensive Posture Regressed' : 'No Score Change'}
          </span>
        </div>

        {/* Comparison Scan */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Current Assessment</span>
          <div className="flex items-baseline gap-3 mt-2">
            <span className="text-3xl font-bold font-mono text-cyan-400">{diff.compareAssessment.score}</span>
            <span className="text-xs font-bold font-mono px-2 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
              Grade {diff.compareAssessment.grade}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-2 font-mono">
            {new Date(diff.compareAssessment.createdAt).toLocaleDateString()} • {diff.compareAssessment.findingCount} findings
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('resolved')}
          className={`flex items-center gap-2 pb-3 px-3 text-xs font-semibold uppercase tracking-wider transition border-b-2 ${
            activeTab === 'resolved'
              ? 'border-emerald-400 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          Resolved ({diff.resolvedFindings.length})
        </button>

        <button
          onClick={() => setActiveTab('new')}
          className={`flex items-center gap-2 pb-3 px-3 text-xs font-semibold uppercase tracking-wider transition border-b-2 ${
            activeTab === 'new'
              ? 'border-rose-400 text-rose-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          New / Regressions ({diff.newFindings.length})
        </button>

        <button
          onClick={() => setActiveTab('persisting')}
          className={`flex items-center gap-2 pb-3 px-3 text-xs font-semibold uppercase tracking-wider transition border-b-2 ${
            activeTab === 'persisting'
              ? 'border-slate-400 text-slate-200'
              : 'border-transparent text-slate-500 hover:text-slate-400'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          Persisting ({diff.persistingFindings.length})
        </button>
      </div>

      {/* Tab Contents */}
      <div className="space-y-3">
        {activeTab === 'resolved' && (
          <>
            {diff.resolvedFindings.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-6 text-center">No findings were resolved between these scans.</p>
            ) : (
              diff.resolvedFindings.map((f) => (
                <div
                  key={f.id}
                  className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-start justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <SeverityPill severity={f.severity} size="sm" />
                      <span className="text-xs font-mono text-emerald-400">Fixed & Verified</span>
                      <span className="text-xs font-mono text-slate-500">[{f.ruleId}]</span>
                    </div>
                    <h4 className="text-sm font-semibold text-slate-200">{f.title}</h4>
                    <p className="text-xs text-slate-400 mt-1">{f.description}</p>
                  </div>
                  <span className="text-xs font-mono font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex-shrink-0">
                    +{f.scoreDeduction} pts
                  </span>
                </div>
              ))
            )}
          </>
        )}

        {activeTab === 'new' && (
          <>
            {diff.newFindings.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-6 text-center">No new security issues or regressions detected.</p>
            ) : (
              diff.newFindings.map((f) => (
                <div
                  key={f.id}
                  className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 flex items-start justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <SeverityPill severity={f.severity} size="sm" />
                      <span className="text-xs font-mono text-rose-400">New Regression</span>
                      <span className="text-xs font-mono text-slate-500">[{f.ruleId}]</span>
                    </div>
                    <h4 className="text-sm font-semibold text-slate-200">{f.title}</h4>
                    <p className="text-xs text-slate-400 mt-1">{f.description}</p>
                  </div>
                  <span className="text-xs font-mono font-medium text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 flex-shrink-0">
                    -{f.scoreDeduction} pts
                  </span>
                </div>
              ))
            )}
          </>
        )}

        {activeTab === 'persisting' && (
          <>
            {diff.persistingFindings.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-6 text-center">No persisting findings.</p>
            ) : (
              diff.persistingFindings.map((f) => (
                <div
                  key={f.id}
                  className="p-4 rounded-xl bg-[#0f172a] border border-slate-800 flex items-start justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <SeverityPill severity={f.severity} size="sm" />
                      <span className="text-xs font-mono text-slate-400">Unchanged</span>
                      <span className="text-xs font-mono text-slate-500">[{f.ruleId}]</span>
                    </div>
                    <h4 className="text-sm font-semibold text-slate-200">{f.title}</h4>
                    <p className="text-xs text-slate-400 mt-1">{f.description}</p>
                  </div>
                  <span className="text-xs font-mono text-slate-500 flex-shrink-0">-{f.scoreDeduction} pts</span>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
};
