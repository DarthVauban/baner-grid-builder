import { createContext, useContext, useLayoutEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

export type ThemeMode = 'light' | 'brand';

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<ThemeMode>(() => localStorage.getItem('mt-color-theme') === 'brand' ? 'brand' : 'light');

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('mt-color-theme', theme);
  }, [theme]);

  const value = useMemo(() => ({
    theme,
    setTheme,
    toggleTheme: () => setTheme((current) => current === 'light' ? 'brand' : 'light')
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
