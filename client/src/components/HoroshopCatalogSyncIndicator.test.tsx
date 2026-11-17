import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import type { HoroshopCatalogSyncStatus } from '../types/integration';
import { HoroshopCatalogSyncIndicator } from './HoroshopCatalogSyncIndicator';
import { ToastProvider } from '../toast/ToastContext';

const idleStatus = (): HoroshopCatalogSyncStatus => ({
  configured: true, canSync: true, status: 'connected', serverNow: new Date().toISOString(),
  nextScheduledSyncAt: null, counts: { stickers: 15, products: 1586, modifications: 5042 }, latestRun: null
});

const integration = {
  configured: true, status: 'syncing' as const, storeDomain: '', pollingIntervalMinutes: 15,
  lastSyncAt: null, lastError: null, counts: { categories: 0, stickers: 15, products: 1586, modifications: 5042 }, latestRun: null
};

afterEach(() => vi.restoreAllMocks());

function renderIndicator() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ToastProvider><HoroshopCatalogSyncIndicator /></ToastProvider></QueryClientProvider>);
}

describe('HoroshopCatalogSyncIndicator', () => {
  it('shows the time to the next server scheduled synchronization', async () => {
    const now = new Date().toISOString();
    const status: HoroshopCatalogSyncStatus = {
      configured: true, canSync: true, status: 'connected', serverNow: now,
      nextScheduledSyncAt: new Date(Date.parse(now) + 5 * 60_000).toISOString(),
      counts: { stickers: 15, products: 1586, modifications: 5042 }, latestRun: null
    };
    vi.spyOn(api, 'horoshopCatalogSyncStatus').mockResolvedValue(status);
    renderIndicator();
    expect(await screen.findByRole('status', { name: /Автосинхронізація через 00:05:/u })).toBeInTheDocument();
    const countdown = screen.getByText(/^00:05:\d{2}$/u);
    expect(countdown).toHaveClass('topbar-catalog-sync__countdown');
    expect(countdown.parentElement).toHaveClass('topbar-catalog-sync');
    const counts = screen.getByRole('group', { name: 'Поточний стан магазину' });
    expect(counts).toHaveTextContent('Стікери15Товари1 586Модифікації5 042');
    expect(countdown.parentElement).not.toContainElement(counts);
  });

  it('shows live progress when the catalog is syncing', async () => {
    vi.spyOn(api, 'horoshopCatalogSyncStatus').mockResolvedValue({
      configured: true, canSync: true, status: 'syncing', serverNow: new Date().toISOString(),
      nextScheduledSyncAt: null, latestRun: {
        status: 'running', progressPercentage: 42, exportItemsReceived: 420, exportItemsTotal: 1_000,
        stickersReceived: 15, productsReceived: 431, modificationsReceived: 500
      }, counts: { stickers: 12, products: 1586, modifications: 5042 }
    });
    renderIndicator();
    expect(await screen.findByRole('status', { name: /Синхронізація каталогу · 42%/u })).toBeInTheDocument();
    expect(screen.getByText('420 із 1000 отримано')).toBeInTheDocument();
    const counts = screen.getByRole('group', { name: 'Поточна звірка каталогу' });
    expect(counts).toHaveTextContent('Стікери15Товари431Модифікації500');
    expect(counts).not.toHaveTextContent('пакет');
    expect(screen.getByRole('button', { name: 'Синхронізація триває' })).toBeDisabled();
  });

  it('starts a manual sync once and refreshes the header before allowing another start', async () => {
    const user = userEvent.setup();
    const status = idleStatus();
    vi.spyOn(api, 'horoshopCatalogSyncStatus').mockImplementation(async () => status);
    let finish!: (value: { started: boolean; integration: typeof integration }) => void;
    const start = vi.spyOn(api.horoshopCatalog, 'sync').mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    renderIndicator();
    const button = await screen.findByRole('button', { name: 'Синхронізувати зараз' });
    await user.click(button);
    expect(screen.getByRole('button', { name: 'Запускаємо синхронізацію' })).toBeDisabled();
    await user.click(button);
    expect(start).toHaveBeenCalledTimes(1);
    status.status = 'syncing';
    finish({ started: true, integration });
    expect(await screen.findByText('Звірку каталогу запущено.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Синхронізація триває' })).toBeDisabled());
    expect(screen.getByRole('group', { name: 'Стікери: 0' })).toBeInTheDocument();
  });

  it('shows request failures and a busy response, allowing a retry', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'horoshopCatalogSyncStatus').mockResolvedValue(idleStatus());
    const start = vi.spyOn(api.horoshopCatalog, 'sync').mockRejectedValueOnce(new Error('Сервер недоступний.'))
      .mockResolvedValueOnce({ started: false, integration });
    renderIndicator();
    const button = await screen.findByRole('button', { name: 'Синхронізувати зараз' });
    await user.click(button);
    expect(await screen.findByText('Сервер недоступний.')).toBeInTheDocument();
    expect(button).toBeEnabled();
    await user.click(button);
    expect(await screen.findByText('Каталог зайнятий. Дочекайтеся завершення поточної операції.')).toBeInTheDocument();
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('hides manual sync from a user without access', async () => {
    vi.spyOn(api, 'horoshopCatalogSyncStatus').mockResolvedValue({ ...idleStatus(), canSync: false });
    renderIndicator();
    await screen.findByRole('group', { name: 'Стікери: 15' });
    expect(screen.queryByRole('button', { name: 'Синхронізувати зараз' })).not.toBeInTheDocument();
  });

  it.each(['disconnected', 'disconnecting', 'purge_failed'] as const)('blocks manual sync when the store is %s', async (status) => {
    vi.spyOn(api, 'horoshopCatalogSyncStatus').mockResolvedValue({ ...idleStatus(), status, configured: status !== 'disconnected' });
    renderIndicator();
    expect(await screen.findByRole('button', { name: 'Синхронізувати зараз' })).toBeDisabled();
  });
});
