import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';

export interface RouteMatch {
  route: string;
  params: Record<string, string>;
}

export interface RouterContextType {
  path: string;
  pathname: string;
  searchParams: URLSearchParams;
  params: Record<string, string>;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterContextType | undefined>(undefined);

function matchRoute(pattern: string, pathname: string): Record<string, string> | null {
  const patternSegments = pattern.split('/').filter(Boolean);
  const pathSegments = pathname.split('/').filter(Boolean);

  if (patternSegments.length !== pathSegments.length) {
    return null;
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegments.length; i++) {
    const pSeg = patternSegments[i];
    const aSeg = pathSegments[i];

    if (pSeg.startsWith(':')) {
      const paramName = pSeg.slice(1);
      params[paramName] = decodeURIComponent(aSeg);
    } else if (pSeg !== aSeg) {
      return null;
    }
  }

  return params;
}

const KNOWN_ROUTES = [
  '/',
  '/login',
  '/register',
  '/dashboard',
  '/scan',
  '/assessment/:id',
  '/history',
  '/target/:id/history',
  '/compare',
  '/settings',
];

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    return window.location.pathname + window.location.search;
  });

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname + window.location.search);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (to: string, options?: { replace?: boolean }) => {
    // Legacy view adapter
    let resolvedTo = to;
    if (to === 'landing') resolvedTo = '/';
    else if (to === 'new-scan') resolvedTo = '/scan';
    else if (to === 'detail') resolvedTo = '/dashboard';
    else if (to === 'live-scan') resolvedTo = '/dashboard';

    if (resolvedTo.startsWith('/')) {
      if (options?.replace) {
        window.history.replaceState(null, '', resolvedTo);
      } else {
        window.history.pushState(null, '', resolvedTo);
      }
      setCurrentPath(resolvedTo);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const { pathname, searchParams } = useMemo(() => {
    const url = new URL(currentPath, window.location.origin);
    return { pathname: url.pathname, searchParams: url.searchParams };
  }, [currentPath]);

  const params = useMemo(() => {
    for (const pattern of KNOWN_ROUTES) {
      const matched = matchRoute(pattern, pathname);
      if (matched) {
        return matched;
      }
    }
    return {};
  }, [pathname]);

  return (
    <RouterContext.Provider
      value={{
        path: currentPath,
        pathname,
        searchParams,
        params,
        navigate,
      }}
    >
      {children}
    </RouterContext.Provider>
  );
};

export function useRouter(): RouterContextType {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return context;
}
