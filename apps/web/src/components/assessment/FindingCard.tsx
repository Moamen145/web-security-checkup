import React, { useState } from 'react';
import { Finding, CATEGORY_LABELS } from '@wsc/shared';
import { SeverityPill } from './SeverityPill.js';
import { ChevronDown, ChevronUp, Copy, Check, ExternalLink, Code2, AlertTriangle, ShieldCheck } from 'lucide-react';

interface FindingCardProps {
  finding: Finding;
}

export const FindingCard: React.FC<FindingCardProps> = ({ finding }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (finding.remediationCode) {
      navigator.clipboard.writeText(finding.remediationCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const categoryLabel = CATEGORY_LABELS[finding.category] || finding.category;

  return (
    <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all duration-200">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-[260px]">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <SeverityPill severity={finding.severity} size="sm" />
            <span className="text-xs text-slate-400 font-mono bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700/50">
              {categoryLabel}
            </span>
            <span className="text-xs text-slate-500 font-mono">[{finding.ruleId}]</span>
            {finding.scoreDeduction > 0 && (
              <span className="text-xs font-mono font-medium text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                -{finding.scoreDeduction} pts
              </span>
            )}
          </div>
          <h3 className="text-base font-semibold text-slate-100 leading-snug">{finding.title}</h3>
          <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">{finding.description}</p>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition"
        >
          {expanded ? (
            <>
              Less Details <ChevronUp className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              Inspect & Fix <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>

      {/* Expanded Remediation & Evidence Drawer */}
      {expanded && (
        <div className="mt-5 pt-4 border-t border-slate-800/80 space-y-4">
          {/* Why it matters & Impact */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Why It Matters
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{finding.whyItMatters}</p>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-400 uppercase tracking-wider mb-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Potential Impact
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{finding.potentialImpact}</p>
            </div>
          </div>

          {/* Recommendation */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3.5">
            <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
              Recommended Action
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">{finding.recommendation}</p>
          </div>

          {/* Remediation Snippet */}
          {finding.remediationCode && (
            <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900/80 border-b border-slate-800 text-xs">
                <span className="flex items-center gap-1.5 font-mono text-slate-300">
                  <Code2 className="w-3.5 h-3.5 text-cyan-400" /> Remediation Config Snippet
                </span>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-slate-400 hover:text-white transition text-xs font-mono"
                >
                  {copied ? (
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
              <pre className="p-3.5 text-xs font-mono text-cyan-300 overflow-x-auto leading-relaxed whitespace-pre-wrap">
                {finding.remediationCode}
              </pre>
            </div>
          )}

          {/* Evidence and Reference Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-400">
            {finding.referenceUrl && (
              <a
                href={finding.referenceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-cyan-400 hover:underline"
              >
                Documentation / RFC Reference <ExternalLink className="w-3 h-3" />
              </a>
            )}

            {finding.evidence && Object.keys(finding.evidence).length > 0 && (
              <details className="cursor-pointer text-slate-500 hover:text-slate-400">
                <summary className="font-mono">View Raw Evidence Data</summary>
                <pre className="mt-2 p-3 bg-slate-950 border border-slate-800 rounded text-[11px] font-mono text-slate-300 overflow-x-auto">
                  {JSON.stringify(finding.evidence, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
