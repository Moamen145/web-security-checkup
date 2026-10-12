import React, { useState, useEffect } from 'react';
import { api, extractCooldownSeconds } from '../services/api.js';
import { useRouter } from '../context/RouterContext.js';
import { normalizeDomain } from '@wsc/shared';
import { Shield, Lock, AlertCircle, ArrowRight, Loader2, Clock, CheckCircle } from 'lucide-react';

interface NewScanPageProps {
  initialDomain?: string;
  onScanCreated?: (assessmentId: string, domain: string) => void;
  onCancel?: () => void;
}

export const NewScanPage: React.FC<NewScanPageProps> = ({
  initialDomain = '',
  onScanCreated,
  onCancel,
}) => {
  const { navigate, searchParams } = useRouter();
  const queryDomain = searchParams.get('domain') || '';
  const [rawDomain, setRawDomain] = useState(initialDomain || queryDomain);
  const [authorized, setAuthorized] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [is409Conflict, setIs409Conflict] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);

  // Sync initial domain if query param changes
  useEffect(() => {
    if (queryDomain && !rawDomain) {
      setRawDomain(queryDomain);
    }
  }, [queryDomain]);

  // Live cooldown timer countdown
  useEffect(() => {
    if (cooldownRemaining <= 0) return;

    const timer = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  const normalized = normalizeDomain(rawDomain);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIs409Conflict(false);

    if (!authorized) {
      setError('You must confirm authorization before initiating an assessment.');
      return;
    }

    if (!normalized || normalized.length < 3) {
      setError('Please provide a valid domain name (e.g. example.com).');
      return;
    }

    if (cooldownRemaining > 0) {
      setError(`Target scan cooldown active. Please wait ${cooldownRemaining}s before requesting another scan.`);
      return;
    }

    setLoading(true);

    try {
      const res = await api.createAssessment(normalized);
      if (onScanCreated) {
        onScanCreated(res.assessmentId, normalized);
      } else {
        navigate(`/assessment/${res.assessmentId}`);
      }
    } catch (err: any) {
      const errMsg = err.message || 'Failed to initialize assessment.';
      const statusCode = err.statusCode;

      if (statusCode === 429 || errMsg.includes('cooldown')) {
        const secs = extractCooldownSeconds(errMsg);
        setCooldownRemaining(typeof secs === 'number' && secs > 0 ? secs : 60);
        setError(`Target cooldown active. Please wait before re-scanning this domain.`);
      } else if (statusCode === 409 || errMsg.includes('already active')) {
        setIs409Conflict(true);
        setError('An assessment is already actively running for this target. Please wait for it to complete.');
      } else {
        setError(errMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-800/80 pb-5 mb-6">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">New Security Assessment</h1>
            <p className="text-xs text-slate-400">Launch a safe, controlled configuration checkup</p>
          </div>
        </div>

        {/* Cooldown Warning Notice */}
        {cooldownRemaining > 0 && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5">
              <Clock className="w-5 h-5 text-amber-400 flex-shrink-0 animate-pulse" />
              <div>
                <span className="font-semibold block">Scan Cooldown Active</span>
                <span>
                  Anti-spam rate limit protects targets. Next scan available in{' '}
                  <strong className="font-mono text-white text-sm">{cooldownRemaining}s</strong>.
                </span>
              </div>
            </div>
            <div className="font-mono font-bold text-lg text-amber-400 bg-amber-500/10 px-3 py-1 rounded-lg border border-amber-500/20">
              {cooldownRemaining}s
            </div>
          </div>
        )}

        {/* Active Scan Conflict (409) Notice */}
        {is409Conflict && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5">
              <Loader2 className="w-5 h-5 text-cyan-400 flex-shrink-0 animate-spin" />
              <div>
                <span className="font-semibold block">Active Scan in Progress</span>
                <span>An audit is currently executing on this domain. Check your dashboard for live results.</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 font-bold text-xs flex-shrink-0"
            >
              Go to Dashboard
            </button>
          </div>
        )}

        {/* Generic Error Notice */}
        {error && !is409Conflict && cooldownRemaining === 0 && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-3"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="target-domain" className="block text-xs font-medium text-slate-300 mb-2">
              Target Website Domain
            </label>
            <input
              id="target-domain"
              type="text"
              required
              autoFocus
              placeholder="e.g. example.com or https://company.org/app"
              value={rawDomain}
              onChange={(e) => setRawDomain(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono transition"
            />
            {rawDomain && (
              <div className="text-[11px] text-slate-400 font-mono mt-2 flex items-center gap-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-850">
                <span className="text-slate-500">Sanitized Hostname:</span>
                <span className="text-cyan-400 font-bold">{normalized || '—'}</span>
                {normalized && (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 ml-auto flex-shrink-0" />
                )}
              </div>
            )}
          </div>

          {/* Accessible Authorization Checkbox */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition">
            <label htmlFor="auth-confirmation" className="flex items-start gap-3 cursor-pointer">
              <input
                id="auth-confirmation"
                type="checkbox"
                checked={authorized}
                onChange={(e) => setAuthorized(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-slate-700 text-cyan-500 focus:ring-cyan-500/30 bg-slate-900 focus:outline-none cursor-pointer"
              />
              <div>
                <p className="text-xs font-semibold text-slate-200">
                  Authorization Confirmation
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  I verify that I own this domain or have explicit authorization to evaluate its public web configuration.
                </p>
              </div>
            </label>
          </div>

          {/* Safe Assessment Notice */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1.5 font-mono">
            <div className="flex items-center gap-1.5 text-slate-300 font-semibold uppercase text-[10px] tracking-wider">
              <Lock className="w-3.5 h-3.5 text-emerald-400" /> Safe Scope Guarantee
            </div>
            <p>
              • Performs strictly standard HTTP HEAD/GET and DNS queries.
            </p>
            <p>
              • Does not perform port scans, exploit payloads, or brute-force tests.
            </p>
            <p>
              • Protected by anti-SSRF filters; private & cloud metadata IPs are blocked.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !rawDomain || cooldownRemaining > 0}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-cyan-500/20 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Initializing...</span>
                </>
              ) : cooldownRemaining > 0 ? (
                <>
                  <Clock className="w-4 h-4" />
                  <span>Cooldown ({cooldownRemaining}s)</span>
                </>
              ) : (
                <>
                  <span>Begin Security Checkup</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
