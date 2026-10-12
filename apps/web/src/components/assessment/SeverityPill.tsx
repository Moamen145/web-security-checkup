import React from 'react';
import { FindingSeverity } from '@wsc/shared';

interface SeverityPillProps {
  severity: FindingSeverity | 'PASS';
  size?: 'sm' | 'md';
}

export const SeverityPill: React.FC<SeverityPillProps> = ({ severity, size = 'md' }) => {
  const styles: Record<string, string> = {
    CRITICAL: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    HIGH: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    MEDIUM: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    LOW: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    INFO: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    PASS: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  };

  const currentStyle = styles[severity] || styles.INFO;
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-semibold';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${padding} ${currentStyle} tracking-wide uppercase font-mono`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {severity}
    </span>
  );
};
