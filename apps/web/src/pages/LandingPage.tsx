import React, { useState } from 'react';
import { Shield, Lock, FileCode, CheckCircle, ArrowRight, ShieldAlert, Cpu, Globe, Mail } from 'lucide-react';

interface LandingPageProps {
  onStartScan: (domain: string) => void;
  onNavigate?: (view: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onStartScan }) => {
  const [domain, setDomain] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (domain.trim()) {
      onStartScan(domain.trim());
    }
  };

  return (
    <div className="space-y-20 py-12">
      {/* Hero Section */}
      <section className="text-center max-w-4xl mx-auto px-4 space-y-6">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-xs font-mono font-medium tracking-wide">
          <Shield className="w-3.5 h-3.5" />
          <span>Defensive Web Security Configuration Platform</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-[1.15]">
          Is your website properly configured? <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400">
            Find out in 10 seconds.
          </span>
        </h1>

        <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Perform a safe, controlled assessment of your public TLS certificates, HTTP security headers, cookie boundaries, and email authentication without invasive penetration testing.
        </p>

        {/* Quick Domain Form */}
        <form onSubmit={handleSubmit} className="max-w-xl mx-auto pt-4">
          <div className="flex flex-col sm:flex-row gap-2.5 p-2 bg-slate-900/90 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur">
            <input
              type="text"
              placeholder="e.g. yourwebsite.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="flex-1 bg-transparent px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none font-mono"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm transition shadow-lg shadow-cyan-500/20"
            >
              <span>Check Security</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-2 font-mono">
            Controlled, non-destructive checks only. We never exploit vulnerabilities.
          </p>
        </form>
      </section>

      {/* Feature Pillars */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-white">What Web Security Checkup Evaluates</h2>
          <p className="text-sm text-slate-400 mt-2">
            Deterministic observations categorized across 6 critical web security dimensions.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-[#0f172a] border border-slate-800 hover:border-cyan-500/30 transition">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-4">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white">HTTPS & TLS Handshake</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Validates certificate expiration, trust chains, Subject Alternative Names (SAN), obsolete TLS 1.0/1.1 protocols, and plain HTTP redirection.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#0f172a] border border-slate-800 hover:border-cyan-500/30 transition">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-4">
              <FileCode className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white">HTTP Security Headers</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Inspects Strict-Transport-Security (HSTS), Content-Security-Policy (CSP), X-Frame-Options, and Referrer policies with copy-paste remediation snippets.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#0f172a] border border-slate-800 hover:border-cyan-500/30 transition">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white">Cookie Security Flags</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Verifies Secure flags on HTTPS sites, HttpOnly restrictions against XSS script access, and SameSite CSRF boundary configurations.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#0f172a] border border-slate-800 hover:border-cyan-500/30 transition">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4">
              <Mail className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white">Email Spoofing Defense</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Analyzes SPF qualifier strengths, DMARC policy enforcement (p=reject vs quarantine), and DKIM selector presence to defend your brand.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#0f172a] border border-slate-800 hover:border-cyan-500/30 transition">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-4">
              <Globe className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white">DNS Health & Routing</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Examines public A, AAAA, and CNAME address mapping to confirm reachability and identify unmaintained records.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#0f172a] border border-slate-800 hover:border-cyan-500/30 transition">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-4">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white">Exposure & Fingerprinting</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Detects verbose Server and X-Powered-By banners disclosing backend frameworks and version numbers to third parties.
            </p>
          </div>
        </div>
      </section>

      {/* Defensive Philosophy Notice */}
      <section className="max-w-4xl mx-auto px-4">
        <div className="p-8 rounded-2xl bg-slate-900/40 border border-slate-800 flex flex-col md:flex-row items-center gap-6">
          <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex-shrink-0">
            <CheckCircle className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Defensive & Responsible by Design</h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Web Security Checkup does not exploit software, guess passwords, or flood servers. It performs only standard HTTP HEAD/GET queries and public DNS lookups. Every scan is rate-limited and protected by strict anti-SSRF IP filters.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
