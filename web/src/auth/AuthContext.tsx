import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AuthUser } from '../api/types';
import { api, tokenStore, userStore } from '../api/client';

interface AuthContextValue {
  user: AuthUser | null;
  loaded: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => userStore.get() as AuthUser | null);
  const [loaded, setLoaded] = useState<boolean>(() => !tokenStore.get());

  const login = useCallback((token: string, u: AuthUser) => {
    tokenStore.set(token);
    userStore.set(u);
    setUser(u);
    setLoaded(true);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    userStore.clear();
    setUser(null);
    setLoaded(true);
  }, []);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setLoaded(true);
      return;
    }
    try {
      const me = await api.get<AuthUser>('/users/me');
      userStore.set(me);
      setUser(me);
      setLoaded(true);
    } catch {
      logout();
    }
  }, [logout]);

  const value = useMemo(
    () => ({ user, loaded, login, logout, refresh }),
    [user, loaded, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}