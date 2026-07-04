import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { LoginInput, ProfileInput, RegisterInput, User } from '../types/user';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  updateProfile: (input: ProfileInput) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const clearSession = useCallback(() => {
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    let active = true;

    api.auth.me()
      .then((currentUser) => {
        if (!active) return;
        setUser(currentUser);
        setStatus('authenticated');
      })
      .catch(() => {
        if (active) clearSession();
      });

    const handleUnauthorized = () => clearSession();
    window.addEventListener('mt:unauthorized', handleUnauthorized);

    return () => {
      active = false;
      window.removeEventListener('mt:unauthorized', handleUnauthorized);
    };
  }, [clearSession]);

  const login = useCallback(async (input: LoginInput) => {
    const currentUser = await api.auth.login(input);
    setUser(currentUser);
    setStatus('authenticated');
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    await api.auth.register(input);
  }, []);

  const updateProfile = useCallback(async (input: ProfileInput) => {
    const updatedUser = await api.users.updateProfile(input);
    setUser(updatedUser);
    return updatedUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(() => ({ user, status, login, register, updateProfile, logout }), [
    user,
    status,
    login,
    register,
    updateProfile,
    logout
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
