import { afterEach, describe, expect, it } from 'vitest';
import { clearPortalThemePreference } from './portal-theme';

describe('portal theme', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem('mt-color-theme');
  });

  it('clears a previously saved dark portal theme', () => {
    document.documentElement.dataset.theme = 'brand';
    localStorage.setItem('mt-color-theme', 'brand');

    clearPortalThemePreference();

    expect(document.documentElement).not.toHaveAttribute('data-theme');
    expect(localStorage.getItem('mt-color-theme')).toBeNull();
  });
});
