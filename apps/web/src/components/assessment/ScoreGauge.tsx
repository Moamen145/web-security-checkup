import React from 'react';
import { ScoreGrade } from '@wsc/shared';

interface ScoreGaugeProps {
  score: number;
  grade: ScoreGrade;
  size?: number;
}

export const ScoreGauge: React.FC<ScoreGaugeProps> = ({ score, grade, size = 180 }) => {
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference - (score / 100) * circumference;

  let colorClass = 'text-emerald-400 stroke-emerald-400';
  let gradeBg = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';

  if (score < 50 || grade === 'F') {
    colorClass = 'text-rose-500 stroke-rose-500';
    gradeBg = 'bg-rose-500/10 text-rose-400 border-rose-500/30';
  } else if (score < 70 || grade === 'D') {
    colorClass = 'text-amber-500 stroke-amber-500';
    gradeBg = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  } else if (score < 80 || grade === 'C') {
    colorClass = 'text-yellow-400 stroke-yellow-400';
    gradeBg = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
  } else if (score < 90 || grade === 'B') {
    colorClass = 'text-cyan-400 stroke-cyan-400';
    gradeBg = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
  }

  return (
    <div className="relative inline-flex flex-col items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="stroke-slate-800"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={`${colorClass} transition-all duration-1000 ease-out`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={progressOffset}
          strokeLinecap="round"
          fill="transparent"
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-4xl font-bold font-mono tracking-tight text-white">{score}</span>
        <span className="text-xs uppercase tracking-wider text-slate-400 mt-0.5">/ 100</span>
        <span
          className={`mt-2 px-2.5 py-0.5 text-xs font-bold rounded border uppercase tracking-wider ${gradeBg}`}
        >
          Grade {grade}
        </span>
      </div>
    </div>
  );
};
