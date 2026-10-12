import React from 'react';
import { useAuth } from '../context/AuthContext.js';
import { useRouter } from '../context/RouterContext.js';
import {
  Settings,
  User,
  ShieldCheck,
  Key,
  Cookie,
  Server,
  LogOut,
  Clock,
  CheckCircle2,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { user, logout } = useAuth();
  const { navigate } = useRouter();

  if (!user) {
    navigate('/login');
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      {/* Page Header */}
      <div className="flex items-center gap-3 border-b border-slate-800 pb-5">
        <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
          <Settings className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Account & Security Settings</h1>
          <p className="text-xs text-slate-400">
            Manage your defensive scanning identity, session preferences, and security configuration
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column: User Identity Card */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 text-cyan-300 flex items-center justify-center">
                <User className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-white truncate">{user.fullName || 'Security Analyst'}</h2>
                <span className="text-[11px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20 uppercase">
                  {user.role}
                </span>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-slate-850 text-xs">
              <div>
                <span className="text-[11px] text-slate-500 block uppercase font-mono">Email Address</span>
                <span className="font-mono text-slate-200 break-all">{user.email}</span>
              </div>

              <div>
                <span className="text-[11px] text-slate-500 block uppercase font-mono">Account ID</span>
                <span className="font-mono text-[11px] text-slate-400 truncate block">{user.id}</span>
              </div>

              <div>
                <span className="text-[11px] text-slate-500 block uppercase font-mono">Member Since</span>
                <span className="font-mono text-slate-300 flex items-center gap-1.5 mt-0.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Active session'}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-850">
              <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right column: Security Architecture & Controls */}
        <div className="md:col-span-2 space-y-6">
          {/* Active Session & Storage Hardening */}
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-white">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Session & Transport Security</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Your session is authenticated via hardened HTTP-only cookies protected against Cross-Site Scripting (XSS)
              and Cross-Site Request Forgery (CSRF). No bearer tokens are exposed to JavaScript storage.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                <div className="flex items-center gap-2 text-xs font-mono font-medium text-cyan-400">
                  <Cookie className="w-4 h-4" />
                  <span>HTTP-Only Cookie Auth</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Credentials stored in protected cookies with <code className="text-slate-300">SameSite=Lax</code> and <code className="text-slate-300">Secure</code> flags.
                </p>
                <div className="flex items-center gap-1 text-[10px] text-emerald-400 pt-1">
                  <CheckCircle2 className="w-3 h-3" /> Active & Protected
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                <div className="flex items-center gap-2 text-xs font-mono font-medium text-cyan-400">
                  <Key className="w-4 h-4" />
                  <span>Token URL Isolation</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Zero access tokens or secrets are ever appended to browser address URLs or SSE endpoints.
                </p>
                <div className="flex items-center gap-1 text-[10px] text-emerald-400 pt-1">
                  <CheckCircle2 className="w-3 h-3" /> Enforced by Policy
                </div>
              </div>
            </div>
          </div>

          {/* Scanner Infrastructure */}
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-white">
              <Server className="w-4 h-4 text-cyan-400" />
              <span>Defensive Scanner Guardrails</span>
            </div>

            <div className="space-y-3 text-xs text-slate-300 font-mono">
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-850">
                <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white">Anti-SSRF IP Validation</span>
                  <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
                    Targets resolving to private (RFC 1918), loopback (127.0.0.0/8), or cloud metadata (169.254.169.254) networks are rejected before connection.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-850">
                <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white">Target Cooldown & Concurrency Guard</span>
                  <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
                    Automatic 60-second cooldown per target prevents denial-of-service pressure against assessed hosts.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-850">
                <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white">Safe Scope Guarantee</span>
                  <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
                    All audits are strictly non-invasive (HTTP HEAD/GET, TLS handshake, public DNS queries). No active exploitation or fuzzing.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
