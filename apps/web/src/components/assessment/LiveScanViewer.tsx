import React, { useEffect, useState, useRef } from 'react';
import { api } from '../../services/api.js';
import { ScanProgressEvent } from '@wsc/shared';
import { Shield, CheckCircle2, AlertCircle, Loader2, WifiOff } from 'lucide-react';

interface LiveScanViewerProps {
  assessmentId: string;
  domain: string;
  onComplete: () => void;
}

const STAGES = [
  { id: 'PREFLIGHT', label: 'Domain & SSRF Guard' },
  { id: 'TLS_HTTPS', label: 'HTTPS & TLS Transport' },
  { id: 'SECURITY_HEADERS', label: 'Security Headers' },
  { id: 'COOKIES', label: 'Cookie Boundaries' },
  { id: 'DNS', label: 'DNS Infrastructure' },
  { id: 'EMAIL_SECURITY', label: 'Email SPF / DMARC' },
  { id: 'EXPOSURE', label: 'Exposure & Disclosure' },
  { id: 'SCORING', label: 'Scoring & Normalization' },
];

export const LiveScanViewer: React.FC<LiveScanViewerProps> = ({ assessmentId, domain, onComplete }) => {
  const [progress, setProgress] = useState<ScanProgressEvent>({
    assessmentId,
    status: 'RUNNING',
    currentStage: 'PREFLIGHT',
    progressPercent: 10,
    message: 'Initializing non-destructive security checks...',
    timestamp: new Date().toISOString(),
  });
  const [error, setError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const reconnectAttemptsRef = useRef(0);
  const isFinishedRef = useRef(false);

  useEffect(() => {
    let unsubscribeStream: (() => void) | null = null;
    let pollInterval: NodeJS.Timeout | null = null;

    const checkServerStatus = async () => {
      try {
        const assessment = await api.getAssessment(assessmentId);
        if (assessment.status === 'COMPLETED') {
          isFinishedRef.current = true;
          setProgress((prev) => ({
            ...prev,
            status: 'COMPLETED',
            progressPercent: 100,
            message: 'All checks successfully evaluated.',
          }));
          setTimeout(onComplete, 1000);
        } else if (assessment.status === 'FAILED') {
          isFinishedRef.current = true;
          setError(assessment.errorMessage || 'Assessment execution failed on the server.');
        }
      } catch (err) {
        console.warn('Fallback status check failed:', err);
      }
    };

    const connectSse = () => {
      if (isFinishedRef.current) return;

      unsubscribeStream = api.subscribeToScanStream(
        assessmentId,
        (event) => {
          setIsReconnecting(false);
          reconnectAttemptsRef.current = 0;
          setProgress(event);

          if (event.status === 'COMPLETED') {
            isFinishedRef.current = true;
            setTimeout(onComplete, 1200);
          } else if (event.status === 'FAILED') {
            isFinishedRef.current = true;
            setError(event.message || 'Assessment execution failed.');
          }
        },
        async (err) => {
          console.warn('SSE stream disconnected or errored:', err);
          if (isFinishedRef.current) return;

          // Check server status via API first (DB is authoritative)
          await checkServerStatus();
          if (isFinishedRef.current) return;

          if (reconnectAttemptsRef.current < 3) {
            setIsReconnecting(true);
            reconnectAttemptsRef.current += 1;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 4000);
            setTimeout(() => {
              if (!isFinishedRef.current) {
                if (unsubscribeStream) unsubscribeStream();
                connectSse();
              }
            }, delay);
          } else {
            // After max SSE retries, fall back to polling the database state every 2.5 seconds
            setIsReconnecting(true);
            if (!pollInterval) {
              pollInterval = setInterval(async () => {
                await checkServerStatus();
                if (isFinishedRef.current && pollInterval) {
                  clearInterval(pollInterval);
                }
              }, 2500);
            }
          }
        }
      );
    };

    connectSse();

    return () => {
      if (unsubscribeStream) unsubscribeStream();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [assessmentId, onComplete]);

  return (
    <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 md:p-8 max-w-3xl mx-auto shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-5 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Shield className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-cyan-400">Live Security Checkup</span>
            <h2 className="text-xl font-bold text-white font-mono mt-0.5">{domain}</h2>
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold font-mono text-cyan-400">{progress.progressPercent}%</span>
          <span className="block text-[11px] text-slate-500 uppercase tracking-wider">Progress</span>
        </div>
      </div>

      {/* Accessible Animated Progress Bar */}
      <div
        className="w-full bg-slate-900 rounded-full h-3 mb-6 p-0.5 border border-slate-800 overflow-hidden"
        role="progressbar"
        aria-valuenow={progress.progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Assessment scan progress"
      >
        <div
          className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-500 ease-out shadow-[0_0_12px_rgba(6,182,212,0.5)]"
          style={{ width: `${progress.progressPercent}%` }}
        />
      </div>

      {/* Reconnecting Banner (if SSE drops but scan is still alive in DB) */}
      {isReconnecting && !error && (
        <div
          role="status"
          className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-4 flex items-center gap-2.5 text-xs text-amber-300"
        >
          <WifiOff className="w-4 h-4 text-amber-400 flex-shrink-0 animate-pulse" />
          <span>Live event stream reconnecting... Checking server status directly.</span>
        </div>
      )}

      {/* Current Stage Message with aria-live for screen readers */}
      <div
        className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 mb-6 flex items-center gap-3"
        role="status"
        aria-live="polite"
      >
        {progress.status === 'RUNNING' || progress.status === 'QUEUED' ? (
          <Loader2 className="w-5 h-5 text-cyan-400 animate-spin flex-shrink-0" />
        ) : progress.status === 'COMPLETED' ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
        ) : (
          <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-cyan-300 font-medium">Stage: {progress.currentStage}</p>
          <p className="text-sm text-slate-300 truncate mt-0.5">{progress.message}</p>
        </div>
      </div>

      {/* Stage pipeline checklist */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {STAGES.map((stg, idx) => {
          const currentStageIndex = STAGES.findIndex((s) => s.id === progress.currentStage);
          const isDone = progress.status === 'COMPLETED' || currentStageIndex > idx;
          const isCurrent = progress.currentStage === stg.id && progress.status !== 'COMPLETED';

          return (
            <div
              key={stg.id}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border text-xs font-mono transition ${
                isDone
                  ? 'bg-slate-900/40 border-slate-800/80 text-emerald-400'
                  : isCurrent
                    ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                    : 'bg-slate-950/40 border-slate-900 text-slate-600'
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : isCurrent ? (
                <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-slate-700 flex items-center justify-center text-[10px] text-slate-500">
                  {idx + 1}
                </div>
              )}
              <span className="truncate">{stg.label}</span>
            </div>
          );
        })}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3"
        >
          <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
