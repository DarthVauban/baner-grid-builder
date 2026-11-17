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
      nextScheduledSyncAt: new Date(Date.parse(now) + 5 * 60_000).toISOString(),
      counts: { products: 1586, modifications: 5042 }, latestRun: null
    };
    vi.spyOn(api, 'horoshopCatalogSyncStatus').mockResolvedValue(status);
    renderIndicator();
    expect(await screen.findByRole('status', { name: /Автосинхронізація через 00:05:/u })).toBeInTheDocument();
    const countdown = screen.getByText(/^00:05:\d{2}$/u);
    expect(countdown).toHaveClass('topbar-catalog-sync__countdown');
    expect(countdown.parentElement).toHaveClass('topbar-catalog-sync');
    const counts = screen.getByRole('group', { name: 'Поточний стан магазину' });
    expect(counts).toHaveTextContent('Товари1 586Модифікації5 042');
    expect(counts).not.toHaveTextContent('Стікери');
    expect(countdown.parentElement).not.toContainElement(counts);
  });

  it('shows live progress when the catalog is syncing', async () => {
    vi.spyOn(api, 'horoshopCatalogSyncStatus').mockResolvedValue({
      configured: true, status: 'syncing', serverNow: new Date().toISOString(),
      nextScheduledSyncAt: null, latestRun: {
        status: 'running', progressPercentage: 42, exportItemsReceived: 420, exportItemsTotal: 1_000,
        stickersReceived: 15, productsReceived: 431, modificationsReceived: 500
      }, counts: { products: 1586, modifications: 5042 }
    });
    renderIndicator();
    expect(await screen.findByRole('status', { name: /Синхронізація каталогу · 42%/u })).toBeInTheDocument();
    expect(screen.getByText('420 із 1000 отримано')).toBeInTheDocument();
    const counts = screen.getByRole('group', { name: 'Поточна звірка каталогу' });
    expect(counts).toHaveTextContent('Стікери15Товари431Модифікації500');
    expect(counts).not.toHaveTextContent('пакет');
  });
});
