import React from 'react';
import { Finding, CATEGORY_LABELS } from '@wsc/shared';
import { SeverityPill } from './SeverityPill.js';
import { ArrowRight, Wrench } from 'lucide-react';

interface TopFixesWidgetProps {
  findings: Finding[];
  onSelectFinding: (finding: Finding) => void;
}

export const TopFixesWidget: React.FC<TopFixesWidgetProps> = ({ findings, onSelectFinding }) => {
  // Sort findings by severity and score deduction
  const topPriorities = [...findings]
    .filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH' || f.severity === 'MEDIUM')
    .sort((a, b) => b.scoreDeduction - a.scoreDeduction)
    .slice(0, 4);

  if (topPriorities.length === 0) {
    return (
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-6 text-center">
        <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
          ✓
        </div>
        <h3 className="text-base font-semibold text-slate-100">No Urgent Fixes Required</h3>
        <p className="text-xs text-slate-400 mt-1">
          No critical or high-severity vulnerabilities were observed. Maintain your current hardening policies.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
            <Wrench className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">What Should I Fix First?</h3>
            <p className="text-[11px] text-slate-400">High-impact remediations ranked to improve your score fastest</p>
          </div>
        </div>
        <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
          Top {topPriorities.length} Actions
        </span>
      </div>

      <div className="space-y-3">
        {topPriorities.map((item, idx) => (
          <div
            key={item.id}
            onClick={() => onSelectFinding(item)}
            className="flex items-center justify-between p-3 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 hover:bg-slate-900 cursor-pointer transition group"
          >
            <div className="flex items-start gap-3 min-w-0 pr-2">
              <span className="text-xs font-mono font-bold text-slate-500 mt-0.5 w-4">
                #{idx + 1}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <SeverityPill severity={item.severity} size="sm" />
                  <span className="text-[11px] text-slate-400 font-mono">
                    {CATEGORY_LABELS[item.category]}
                  </span>
                  <span className="text-[11px] font-mono text-rose-400">
                    +{item.scoreDeduction} pts regained
                  </span>
                </div>
                <h4 className="text-xs font-semibold text-slate-200 truncate group-hover:text-cyan-300 transition">
                  {item.title}
                </h4>
                <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                  {item.recommendation}
                </p>
              </div>
            </div>

            <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
};
