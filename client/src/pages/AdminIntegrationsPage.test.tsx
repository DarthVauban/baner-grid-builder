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

    const user = userEvent.setup();
    renderPage();

    const telegramTile = await screen.findByRole('button', { name: 'Відкрити налаштування Telegram. Підключено' });
    expect(screen.getByRole('button', { name: 'Відкрити налаштування Mailtrap. Підключено' })).toBeInTheDocument();
    expect(appStyles).toMatch(/\.integration-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,minmax\(0,1fr\)\)/);

    await user.click(telegramTile);
    expect(screen.getByRole('dialog', { name: 'Telegram' })).toBeInTheDocument();
    const telegramToken = screen.getByLabelText('Bot token');
    expect(telegramToken).toHaveValue('123456:telegram-secret-token');
    expect(telegramToken).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Показати Telegram bot token' }));
    expect(telegramToken).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Закрити' }));

    await user.click(screen.getByRole('button', { name: 'Відкрити налаштування Mailtrap. Підключено' }));
    expect(screen.getByRole('dialog', { name: 'Mailtrap' })).toBeInTheDocument();
    const mailtrapToken = screen.getByLabelText('Mailtrap API token');
    expect(mailtrapToken).toHaveValue('mailtrap-secret-token');
    expect(mailtrapToken).toHaveAttribute('type', 'password');
  });
});
