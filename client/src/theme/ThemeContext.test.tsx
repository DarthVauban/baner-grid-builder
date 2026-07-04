import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeContext';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return <button type="button" onClick={toggleTheme}>{theme}</button>;
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.removeItem('mt-color-theme');
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it('switches to the brand theme and remembers the choice', () => {
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'light' }));

    expect(screen.getByRole('button', { name: 'brand' })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe('brand');
    expect(localStorage.getItem('mt-color-theme')).toBe('brand');
  });
});
