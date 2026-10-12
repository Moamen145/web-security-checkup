import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { useRouter } from '../context/RouterContext.js';
import { Shield, Lock, Mail, User, AlertCircle, Loader2 } from 'lucide-react';

interface RegisterPageProps {
  onNavigate?: (view: string) => void;
  onSuccess?: () => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ onNavigate, onSuccess }) => {
  const { register } = useAuth();
  const { navigate } = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);

    try {
      await register({ fullName: fullName.trim(), email: email.trim(), password });
      if (onSuccess) {
        onSuccess();
      } else {
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoToLogin = () => {
    if (onNavigate) onNavigate('login');
    navigate('/login');
  };

  return (
    <div className="max-w-md mx-auto py-16 px-4">
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-cyan-500/10">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Create Account</h1>
          <p className="text-xs text-slate-400 mt-1">Start tracking and monitoring your website security</p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="reg-fullname" className="block text-xs font-medium text-slate-300 mb-1.5">
              Full Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" aria-hidden="true" />
              <input
                id="reg-fullname"
                name="name"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Developer"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
              />
            </div>
          </div>

          <div>
            <label htmlFor="reg-email" className="block text-xs font-medium text-slate-300 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" aria-hidden="true" />
              <input
                id="reg-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@company.com"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition font-mono"
              />
            </div>
          </div>

          <div>
            <label htmlFor="reg-password" className="block text-xs font-medium text-slate-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" aria-hidden="true" />
              <input
                id="reg-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition font-mono"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Must be at least 8 characters</p>
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password || !fullName}
            className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-cyan-500/20 disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creating Account...</span>
              </>
            ) : (
              <span>Register</span>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-6 pt-6 border-t border-slate-850">
          Already registered?{' '}
          <button
            type="button"
            onClick={handleGoToLogin}
            className="text-cyan-400 hover:underline font-semibold focus:outline-none"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
};
