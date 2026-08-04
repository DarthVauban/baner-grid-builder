import { describe, expect, it } from 'vitest';
import appStyles from '../styles/app.css?raw';

describe('AppShell sidebar styles', () => {
  it('keeps the workspace navigation compact as more links are added', () => {
    expect(appStyles).toMatch(/\.sidebar\s*\{[^}]*padding:\s*18px 14px 14px/);
    expect(appStyles).toMatch(/\.sidebar__brand\s*\{[^}]*padding:\s*0 7px 17px/);
    expect(appStyles).toMatch(/\.sidebar__label--spaced\s*\{[^}]*margin-top:\s*18px/);
    expect(appStyles).toMatch(/\.sidebar__link\s*\{[^}]*min-height:\s*38px[^}]*margin:\s*1px 0[^}]*font-size:\s*13px/);
    expect(appStyles).toMatch(/\.sidebar__profile-link \.avatar\s*\{[^}]*width:\s*34px[^}]*height:\s*34px/);
  });

  it('uses compact branded scrollbars without native arrow buttons', () => {
    expect(appStyles).toMatch(/:where\(\.app-shell, \.catalog-workspace, \.trade-in-workspace, \.modal-backdrop\) \*::\-webkit-scrollbar\s*\{[^}]*width:\s*8px[^}]*height:\s*8px/);
    expect(appStyles).toMatch(/::\-webkit-scrollbar-thumb\s*\{[^}]*border-radius:\s*999px[^}]*background-color:\s*var\(--admin-scrollbar-thumb\)/);
    expect(appStyles).toMatch(/::\-webkit-scrollbar-button\s*\{[^}]*display:\s*none[^}]*width:\s*0[^}]*height:\s*0/);
    expect(appStyles).toMatch(/\.sidebar,\s*\.catalog-sidebar,\s*\.trade-in-sidebar\s*\{[^}]*--admin-scrollbar-thumb:/);
  });
});
