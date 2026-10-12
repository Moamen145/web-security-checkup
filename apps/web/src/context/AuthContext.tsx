import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, LoginInput, RegisterInput } from '@wsc/shared';
import { api, setStoredToken } from '../services/api.js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (data: LoginInput) => Promise<void>;
  register: (data: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const res = await api.getMe();
      setUser(res.user);
    } catch {
      setUser(null);
      setStoredToken(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(data: LoginInput) {
    const res = await api.login(data);
    setStoredToken(res.token);
    setUser(res.user);
  }

  async function register(data: RegisterInput) {
    const res = await api.register(data);
    setStoredToken(res.token);
    setUser(res.user);
  }

  async function logout() {
    try {
      await api.logout();
    } catch {
      // Ignore
    } finally {
      setStoredToken(null);
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
