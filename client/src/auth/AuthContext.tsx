import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import type {
  LoginInput,
  ProfileInput,
  RegisterInput,
  RegistrationStart,
  RegistrationVerifyInput,
  TwoFactorLoginChallenge,
  TwoFactorLoginVerifyInput,
  User
} from '../types/user';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'unavailable';

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  login: (input: LoginInput) => Promise<TwoFactorLoginChallenge | null>;
  verifyLoginTwoFactor: (input: TwoFactorLoginVerifyInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<RegistrationStart>;
  verifyRegistration: (input: RegistrationVerifyInput) => Promise<User>;
  updateProfile: (input: ProfileInput) => Promise<User>;
  refreshUser: () => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isAuthenticationError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

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
      .catch((error: unknown) => {
        if (!active) return;
        if (isAuthenticationError(error)) {
          clearSession();
          return;
        }

        // A temporary API/database outage must not destroy a valid browser session.
        setStatus('unavailable');
      });

    const handleUnauthorized = () => clearSession();
    window.addEventListener('mt:unauthorized', handleUnauthorized);

    return () => {
      active = false;
      window.removeEventListener('mt:unauthorized', handleUnauthorized);
    };
  }, [clearSession]);

  const login = useCallback(async (input: LoginInput) => {
    const result = await api.auth.login(input);
    if ('twoFactorRequired' in result) return result;

    setUser(result);
    setStatus('authenticated');
    return null;
  }, []);

  const verifyLoginTwoFactor = useCallback(async (input: TwoFactorLoginVerifyInput) => {
    const currentUser = await api.auth.verifyLoginTwoFactor(input);
    setUser(currentUser);
    setStatus('authenticated');
  }, []);

  const register = useCallback((input: RegisterInput) => api.auth.register(input), []);

  const verifyRegistration = useCallback(async (input: RegistrationVerifyInput) => {
    const currentUser = await api.auth.verifyRegistration(input);
    setUser(currentUser);
    setStatus('authenticated');
    return currentUser;
  }, []);

  const updateProfile = useCallback(async (input: ProfileInput) => {
    const updatedUser = await api.users.updateProfile(input);
    setUser(updatedUser);
    return updatedUser;
  }, []);

  const refreshUser = useCallback(async () => {
    setStatus('loading');
    try {
      const currentUser = await api.auth.me();
      setUser(currentUser);
      setStatus('authenticated');
      return currentUser;
    } catch (error) {
      if (isAuthenticationError(error)) {
        clearSession();
      } else {
        setStatus('unavailable');
      }
      throw error;
    }
  }, [clearSession]);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(() => ({
    user,
    status,
    login,
    verifyLoginTwoFactor,
    register,
    verifyRegistration,
    updateProfile,
    refreshUser,
    logout
  }), [
    user,
    status,
    login,
    verifyLoginTwoFactor,
    register,
    verifyRegistration,
    updateProfile,
    refreshUser,
    logout
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
