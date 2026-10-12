import React from 'react';
import { Shield, Lock } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-slate-900 bg-[#070a12] py-8 text-xs text-slate-500 no-print mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-500" />
          <span className="font-mono text-slate-400 font-semibold">Web Security Checkup</span>
          <span>— Controlled Defensive Assessment Engine</span>
        </div>

        <div className="flex items-center gap-2 text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded-full border border-slate-800 text-[11px]">
          <Lock className="w-3 h-3 text-emerald-400" />
          <span>Non-Destructive • Safe Observations Only • SSRF Protected</span>
        </div>

        <div className="text-[11px] text-slate-500">
          © {new Date().getFullYear()} Web Security Checkup SaaS. Built for developers & website owners.
        </div>
      </div>
    </footer>
  );
};
