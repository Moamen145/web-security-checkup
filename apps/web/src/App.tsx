import React, { useEffect } from 'react';
import { useAuth } from './context/AuthContext.js';
import { useRouter } from './context/RouterContext.js';
import { Navbar } from './components/layout/Navbar.js';
import { Footer } from './components/layout/Footer.js';
import { LandingPage } from './pages/LandingPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { NewScanPage } from './pages/NewScanPage.js';
import { AssessmentDetailPage } from './pages/AssessmentDetailPage.js';
import { AssessmentComparePage } from './pages/AssessmentComparePage.js';
import { TargetHistoryPage } from './pages/TargetHistoryPage.js';
import { AssessmentHistoryPage } from './pages/AssessmentHistoryPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { Shield, ArrowLeft } from 'lucide-react';

const PROTECTED_ROUTES = [
  '/dashboard',
  '/scan',
  '/assessment/:id',
  '/history',
  '/target/:id/history',
  '/compare',
  '/settings',
];

function matchPattern(pattern: string, pathname: string): boolean {
  const patternSegments = pattern.split('/').filter(Boolean);
  const pathSegments = pathname.split('/').filter(Boolean);

  if (patternSegments.length !== pathSegments.length) {
    return false;
  }

  for (let i = 0; i < patternSegments.length; i++) {
    const pSeg = patternSegments[i];
    const aSeg = pathSegments[i];
    if (pSeg.startsWith(':')) {
      continue;
    }
    if (pSeg !== aSeg) {
      return false;
    }
  }
  return true;
}

export const App: React.FC = () => {
  const { user, loading } = useAuth();
  const { pathname, params, navigate } = useRouter();

  // Authentication redirects
  useEffect(() => {
    if (loading) return;

    const isProtected = PROTECTED_ROUTES.some((routePattern) => matchPattern(routePattern, pathname));

    if (!user && isProtected) {
      navigate('/login', { replace: true });
    } else if (user && (pathname === '/login' || pathname === '/register')) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, pathname, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090d16] flex flex-col items-center justify-center space-y-4 font-mono text-xs text-cyan-400">
        <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <p>Initializing Web Security Checkup...</p>
      </div>
    );
  }

  // Determine which page to render based on URL pattern
  const renderRoute = () => {
    if (pathname === '/') {
      return user ? (
        <DashboardPage />
      ) : (
        <LandingPage
          onStartScan={(domain) => {
            if (user) {
              navigate(`/scan?domain=${encodeURIComponent(domain)}`);
            } else {
              navigate(`/login?domain=${encodeURIComponent(domain)}`);
            }
          }}
        />
      );
    }

    if (pathname === '/login') {
      return (
        <LoginPage
          onSuccess={() => {
            navigate('/dashboard');
          }}
        />
      );
    }

    if (pathname === '/register') {
      return (
        <RegisterPage
          onSuccess={() => {
            navigate('/dashboard');
          }}
        />
      );
    }

    if (pathname === '/dashboard') {
      return <DashboardPage />;
    }

    if (pathname === '/scan') {
      return <NewScanPage />;
    }

    if (matchPattern('/assessment/:id', pathname)) {
      return <AssessmentDetailPage assessmentId={params.id} />;
    }

    if (pathname === '/history') {
      return <AssessmentHistoryPage />;
    }

    if (matchPattern('/target/:id/history', pathname)) {
      return <TargetHistoryPage targetId={params.id} />;
    }

    if (pathname === '/compare') {
      return <AssessmentComparePage />;
    }

    if (pathname === '/settings') {
      return <SettingsPage />;
    }

    // 404 Not Found Page
    return (
      <div className="max-w-md mx-auto py-20 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto">
          <Shield className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">Page Not Found</h1>
        <p className="text-xs text-slate-400 font-mono">
          The requested route <span className="text-cyan-400 font-semibold">{pathname}</span> does not exist.
        </p>
        <button
          onClick={() => navigate(user ? '/dashboard' : '/')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition mt-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{user ? 'Return to Dashboard' : 'Return to Home'}</span>
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {renderRoute()}
      </main>

      <Footer />
    </div>
  );
};
