import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useRouter } from '../../context/RouterContext.js';
import {
  Shield,
  PlusCircle,
  LayoutDashboard,
  GitCompare,
  History,
  Settings,
  LogOut,
  Menu,
  X,
  User,
} from 'lucide-react';

interface NavbarProps {
  currentView?: string;
  onNavigate?: (view: string, params?: any) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate }) => {
  const { user, logout } = useAuth();
  const { pathname, navigate } = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNav = (targetUrl: string, legacyViewName: string) => {
    setMobileMenuOpen(false);
    if (onNavigate) {
      onNavigate(legacyViewName);
    }
    navigate(targetUrl);
  };

  const isActive = (url: string, legacyName: string) => {
    return pathname === url || currentView === legacyName;
  };

  return (
    <nav className="border-b border-slate-800 bg-[#090d16]/95 backdrop-blur sticky top-0 z-40 no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div
            onClick={() => handleNav(user ? '/dashboard' : '/', user ? 'dashboard' : 'landing')}
            className="flex items-center gap-3 cursor-pointer group focus:outline-none"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                handleNav(user ? '/dashboard' : '/', user ? 'dashboard' : 'landing');
              }
            }}
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white flex items-center gap-1.5 font-mono">
                WebSecurity<span className="text-cyan-400">Checkup</span>
              </span>
              <span className="hidden sm:block text-[10px] text-slate-500 uppercase tracking-widest -mt-1 font-mono">
                Defensive Scanner
              </span>
            </div>
          </div>

          {/* Desktop Navigation items */}
          {user ? (
            <div className="hidden md:flex items-center gap-1.5">
              <button
                onClick={() => handleNav('/dashboard', 'dashboard')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  isActive('/dashboard', 'dashboard')
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-850'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => handleNav('/scan', 'new-scan')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  isActive('/scan', 'new-scan')
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-850'
                }`}
              >
                <PlusCircle className="w-4 h-4 text-cyan-400" />
                <span>New Scan</span>
              </button>

              <button
                onClick={() => handleNav('/history', 'history')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  isActive('/history', 'history')
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-850'
                }`}
              >
                <History className="w-4 h-4" />
                <span>History</span>
              </button>

              <button
                onClick={() => handleNav('/compare', 'compare')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  isActive('/compare', 'compare')
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-850'
                }`}
              >
                <GitCompare className="w-4 h-4" />
                <span>Compare</span>
              </button>

              <button
                onClick={() => handleNav('/settings', 'settings')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  isActive('/settings', 'settings')
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-850'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </button>

              <div className="h-4 w-px bg-slate-800 mx-2" />

              <div className="flex items-center gap-2 pl-1">
                <button
                  onClick={() => handleNav('/settings', 'settings')}
                  className="flex items-center gap-1.5 text-xs font-mono text-slate-300 hover:text-cyan-400 transition"
                  title="View Profile Settings"
                >
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  <span className="max-w-[140px] truncate">{user.fullName || user.email}</span>
                </button>
                <button
                  onClick={logout}
                  title="Sign Out"
                  aria-label="Sign Out"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-3">
              <button
                onClick={() => handleNav('/login', 'login')}
                className="text-xs font-medium text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition"
              >
                Sign In
              </button>
              <button
                onClick={() => handleNav('/register', 'register')}
                className="text-xs font-medium bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-4 py-1.5 rounded-lg transition shadow-md shadow-cyan-500/20"
              >
                Get Started
              </button>
            </div>
          )}

          {/* Mobile hamburger button */}
          <div className="flex md:hidden items-center gap-2">
            {user && (
              <button
                onClick={() => handleNav('/scan', 'new-scan')}
                className="px-2.5 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-xs font-medium flex items-center gap-1"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Scan</span>
              </button>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation menu"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition focus:outline-none"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-800 bg-[#090d16] px-4 pt-2 pb-4 space-y-2">
          {user ? (
            <>
              <div className="px-3 py-2 border-b border-slate-850 flex items-center justify-between text-xs font-mono text-slate-400">
                <span className="truncate">{user.fullName || user.email}</span>
                <span className="text-[10px] text-cyan-400 uppercase bg-cyan-500/10 px-1.5 py-0.5 rounded">
                  {user.role || 'User'}
                </span>
              </div>

              <button
                onClick={() => handleNav('/dashboard', 'dashboard')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                  isActive('/dashboard', 'dashboard')
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 text-cyan-400" />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => handleNav('/scan', 'new-scan')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                  isActive('/scan', 'new-scan')
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <PlusCircle className="w-4 h-4 text-cyan-400" />
                <span>New Security Checkup</span>
              </button>

              <button
                onClick={() => handleNav('/history', 'history')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                  isActive('/history', 'history')
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <History className="w-4 h-4 text-cyan-400" />
                <span>All History & Targets</span>
              </button>

              <button
                onClick={() => handleNav('/compare', 'compare')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                  isActive('/compare', 'compare')
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <GitCompare className="w-4 h-4 text-cyan-400" />
                <span>Comparison Tool</span>
              </button>

              <button
                onClick={() => handleNav('/settings', 'settings')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                  isActive('/settings', 'settings')
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Settings className="w-4 h-4 text-cyan-400" />
                <span>Account Settings</span>
              </button>

              <div className="pt-2 border-t border-slate-850">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-2 pt-1">
              <button
                onClick={() => handleNav('/login', 'login')}
                className="w-full text-center py-2.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
              >
                Sign In
              </button>
              <button
                onClick={() => handleNav('/register', 'register')}
                className="w-full text-center py-2.5 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 transition"
              >
                Get Started
              </button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
};
