import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../lib/api';
import { CatalogWorkspacePage } from './CatalogWorkspacePage';

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Дмитро Лук’янчук', avatarUrl: '' }
  })
}));

function renderCatalog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}><MemoryRouter initialEntries={['/catalog/products']}>
      <Routes>
        <Route path="/catalog" element={<CatalogWorkspacePage />}>
          <Route path="products" element={<p>Товари каталогу</p>} />
        </Route>
      </Routes>
    </MemoryRouter></QueryClientProvider>
  );
}

describe('CatalogWorkspacePage', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    localStorage.removeItem('mt-catalog-sidebar-collapsed');
    vi.spyOn(api, 'horoshopCatalogSyncStatus').mockResolvedValue({
      configured: false, status: 'disconnected', serverNow: new Date().toISOString(),
      nextScheduledSyncAt: null, latestRun: null
    });
  });

  it('keeps history in the sidebar without separate import and preview entries', () => {
    renderCatalog();
    expect(screen.getByRole('button', { name: 'Повернутися на попередню сторінку' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Архів товарів' })).toHaveAttribute('href', '/catalog/archive');
    expect(screen.getByRole('link', { name: 'Історія змін' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Імпорт XLSX' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Preview магазину' })).not.toBeInTheDocument();
  });

  it('switches to compact navigation and remembers the preference', async () => {
    const user = userEvent.setup();
    const firstRender = renderCatalog();
    const workspace = firstRender.container.querySelector('.catalog-workspace');

    expect(workspace).not.toHaveClass('catalog-workspace--sidebar-collapsed');
    await user.click(screen.getByRole('button', { name: 'Згорнути меню каталогу' }));
    expect(workspace).toHaveClass('catalog-workspace--sidebar-collapsed');
    expect(localStorage.getItem('mt-catalog-sidebar-collapsed')).toBe('true');

    firstRender.unmount();
    const secondRender = renderCatalog();
    expect(secondRender.container.querySelector('.catalog-workspace')).toHaveClass('catalog-workspace--sidebar-collapsed');
    expect(screen.getByRole('button', { name: 'Розгорнути меню каталогу' })).toBeInTheDocument();
  });
});
