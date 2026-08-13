import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import appStyles from '../styles/app.css?raw';
import { ToastProvider } from '../toast/ToastContext';
import { AdminIntegrationsPage } from './AdminIntegrationsPage';

afterEach(() => vi.restoreAllMocks());

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider><AdminIntegrationsPage /></ToastProvider>
    </QueryClientProvider>
  );
}

describe('AdminIntegrationsPage', () => {
  it('renders four-column tiles and opens forms with saved tokens hidden by default', async () => {
    vi.spyOn(api.admin, 'integrations').mockResolvedValue({
      mailtrap: {
        configured: true,
        token: 'mailtrap-secret-token',
        senderEmail: 'hello@mt-panel.sbs',
        senderName: 'MT Panel',
        domain: 'mt-panel.sbs',
        updatedAt: '2030-01-01T10:00:00.000Z'
      },
      telegram: {
        configured: true,
        token: '123456:telegram-secret-token',
        chatId: '-1001234567890',
        botUsername: 'mt_backup_bot',
        botName: 'MT Backup',
        updatedAt: '2030-01-01T10:00:00.000Z'
      }
    });
    vi.spyOn(api.admin, 'horoshopIntegration').mockResolvedValue({
      configured: false,
      status: 'disconnected',
      storeDomain: '',
      pollingIntervalMinutes: null,
      lastSyncAt: null,
      lastError: null,
      counts: { categories: 0, products: 0, modifications: 0 },
      latestRun: null
    });

    const user = userEvent.setup();
    renderPage();

    const telegramTile = await screen.findByRole('button', { name: 'Відкрити налаштування Telegram. Підключено' });
    expect(screen.getByRole('button', { name: 'Відкрити налаштування Mailtrap. Підключено' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Відкрити налаштування Хорошоп. Не налаштовано' })).toBeInTheDocument();
    expect(appStyles).toMatch(/\.integration-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,minmax\(0,1fr\)\)/);
    expect(appStyles).toMatch(/\.integration-modal__form\s*\{[^}]*align-items:\s*start/);

    await user.click(telegramTile);
    expect(screen.getByRole('dialog', { name: 'Telegram' })).toBeInTheDocument();
    const telegramToken = screen.getByLabelText('Bot token');
    expect(telegramToken).toHaveValue('••••••••••••');
    expect(telegramToken).toHaveAttribute('type', 'text');
    expect(telegramToken).toHaveAttribute('readonly');

    await user.click(screen.getByRole('button', { name: 'Показати Telegram bot token' }));
    expect(telegramToken).toHaveValue('123456:telegram-secret-token');
    expect(telegramToken).toHaveAttribute('type', 'text');
    expect(telegramToken).not.toHaveAttribute('readonly');
    await user.click(screen.getByRole('button', { name: 'Закрити' }));

    await user.click(screen.getByRole('button', { name: 'Відкрити налаштування Mailtrap. Підключено' }));
    expect(screen.getByRole('dialog', { name: 'Mailtrap' })).toBeInTheDocument();
    const mailtrapToken = screen.getByLabelText('Mailtrap API token');
    expect(mailtrapToken).toHaveValue('••••••••••••');
    expect(mailtrapToken).toHaveAttribute('type', 'text');
    expect(mailtrapToken).toHaveAttribute('readonly');
  });

  it('connects Хорошоп without exposing saved credentials in the integration state', async () => {
    vi.spyOn(api.admin, 'integrations').mockResolvedValue({
      mailtrap: {
        configured: false, token: '', senderEmail: '', senderName: '', domain: '', updatedAt: null
      },
      telegram: {
        configured: false, token: '', chatId: '', botUsername: '', botName: '', updatedAt: null
      }
    });
    vi.spyOn(api.admin, 'horoshopIntegration').mockResolvedValue({
      configured: false,
      status: 'disconnected',
      storeDomain: '',
      pollingIntervalMinutes: null,
      lastSyncAt: null,
      lastError: null,
      counts: { categories: 0, products: 0, modifications: 0 },
      latestRun: null
    });
    const connect = vi.spyOn(api.admin, 'connectHoroshopIntegration').mockResolvedValue({
      configured: true,
      status: 'syncing',
      storeDomain: 'test-shop.example.com',
      pollingIntervalMinutes: 15,
      lastSyncAt: null,
      lastError: null,
      counts: { categories: 0, products: 0, modifications: 0 },
      latestRun: null
    });

    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Відкрити налаштування Хорошоп. Не налаштовано' }));
    expect(screen.getByRole('dialog', { name: 'Хорошоп' })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Домен магазину/), 'test-shop.example.com');
    await user.type(screen.getByLabelText('Логін адміністратора'), 'catalog-owner');
    await user.type(screen.getByLabelText('Пароль адміністратора'), 'secret-password');
    await user.click(screen.getByRole('button', { name: 'Підключити й імпортувати' }));

    expect(connect.mock.calls[0]?.[0]).toEqual({
      storeDomain: 'test-shop.example.com',
      login: 'catalog-owner',
      password: 'secret-password',
      pollingIntervalMinutes: 15
    });
    expect(screen.getByText('Магазин Хорошоп підключено. Повний імпорт каталогу запущено.')).toBeInTheDocument();
  });

  it('updates the automatic Horoshop reconciliation interval without reconnecting the store', async () => {
    vi.spyOn(api.admin, 'integrations').mockResolvedValue({
      mailtrap: {
        configured: false, token: '', senderEmail: '', senderName: '', domain: '', updatedAt: null
      },
      telegram: {
        configured: false, token: '', chatId: '', botUsername: '', botName: '', updatedAt: null
      }
    });
    vi.spyOn(api.admin, 'horoshopIntegration').mockResolvedValue({
      configured: true,
      status: 'connected',
      storeDomain: 'test-shop.example.com',
      pollingIntervalMinutes: 15,
      lastSyncAt: '2030-01-01T10:00:00.000Z',
      lastError: null,
      counts: { categories: 4, products: 120, modifications: 260 },
      latestRun: null
    });
    const updateSettings = vi.spyOn(api.admin, 'updateHoroshopIntegrationSettings').mockResolvedValue({
      configured: true,
      status: 'connected',
      storeDomain: 'test-shop.example.com',
      pollingIntervalMinutes: 60,
      lastSyncAt: '2030-01-01T10:00:00.000Z',
      lastError: null,
      counts: { categories: 4, products: 120, modifications: 260 },
      latestRun: null
    });

    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Відкрити налаштування Хорошоп. Підключено' }));
    const intervalInput = screen.getByRole('spinbutton', { name: /Інтервал автоматичної звірки/u });
    await user.clear(intervalInput);
    await user.type(intervalInput, '60');
    await user.click(screen.getByRole('button', { name: 'Зберегти інтервал' }));

    expect(updateSettings.mock.calls[0]?.[0]).toEqual({ pollingIntervalMinutes: 60 });
    expect(screen.getByText('Автоматичну звірку каталогу налаштовано кожні 60 хв.')).toBeInTheDocument();
  });
});
