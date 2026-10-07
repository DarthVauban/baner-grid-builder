import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import type { HoroshopCatalogSyncStatus } from '../types/integration';
import { HoroshopCatalogSyncIndicator } from './HoroshopCatalogSyncIndicator';

afterEach(() => vi.restoreAllMocks());

function renderIndicator() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><HoroshopCatalogSyncIndicator /></QueryClientProvider>);
}

describe('HoroshopCatalogSyncIndicator', () => {
  it('shows the time to the next server scheduled synchronization', async () => {
    const now = new Date().toISOString();
    const status: HoroshopCatalogSyncStatus = {
      configured: true, status: 'connected', serverNow: now,
      nextScheduledSyncAt: new Date(Date.parse(now) + 5 * 60_000).toISOString(), latestRun: null
    };
    vi.spyOn(api, 'horoshopCatalogSyncStatus').mockResolvedValue(status);
    renderIndicator();
    expect(await screen.findByRole('status', { name: /Автосинхронізація через 00:05:/u })).toBeInTheDocument();
    const countdown = screen.getByText(/^00:05:\d{2}$/u);
    expect(countdown).toHaveClass('topbar-catalog-sync__countdown');
    expect(countdown.parentElement).toHaveClass('topbar-catalog-sync');
  });

  it('shows live progress when the catalog is syncing', async () => {
    vi.spyOn(api, 'horoshopCatalogSyncStatus').mockResolvedValue({
      configured: true, status: 'syncing', serverNow: new Date().toISOString(),
      nextScheduledSyncAt: null, latestRun: {
        status: 'running', progressPercentage: 42, exportItemsReceived: 420, exportItemsTotal: 1_000
      }
    });
    renderIndicator();
    expect(await screen.findByRole('status', { name: /Синхронізація каталогу · 42%/u })).toBeInTheDocument();
    expect(screen.getByText('420 із 1000 отримано')).toBeInTheDocument();
  });
});
