import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import appStyles from '../styles/app.css?raw';
import { ToastProvider } from '../toast/ToastContext';
import type { BackupRun } from '../types/integration';
import { AdminBackupsPage } from './AdminBackupsPage';

const dialogMocks = vi.hoisted(() => ({ confirm: vi.fn() }));

vi.mock('../dialogs/ConfirmDialogContext', () => ({
  useConfirmDialog: () => dialogMocks.confirm
}));

const completedRun: BackupRun = {
  id: 'backup-run-1',
  trigger: 'manual',
  status: 'success',
  fileName: 'mt-workspace-backup-2030-01-01T10-00-00.tar.gz',
  sizeBytes: 2_000_000,
  telegramMessageId: 42,
  errorMessage: '',
  startedAt: '2030-01-01T10:00:00.000Z',
  completedAt: '2030-01-01T10:00:20.000Z'
};

beforeEach(() => {
  dialogMocks.confirm.mockResolvedValue(true);
  vi.spyOn(api.admin, 'integrations').mockResolvedValue({
    mailtrap: {
      configured: false,
      token: '',
      senderEmail: '',
      senderName: '',
      domain: '',
      updatedAt: null
    },
    telegram: {
      configured: true,
      token: 'telegram-token',
      chatId: '-1001234567890',
      botUsername: 'backup_bot',
      botName: 'Backup Bot',
      updatedAt: '2030-01-01T10:00:00.000Z'
    }
  });
  vi.spyOn(api.admin, 'backups').mockResolvedValue({
    settings: {
      automaticEnabled: true,
      scheduleType: 'daily',
      scheduleTime: '03:00',
      scheduleWeekday: 1,
      timezone: 'Europe/Kyiv',
      nextRunAt: '2030-01-02T01:00:00.000Z',
      lastRunAt: '2030-01-01T01:00:00.000Z',
      updatedAt: '2030-01-01T01:00:00.000Z'
    },
    runs: [],
    telegramDocumentLimitBytes: 50 * 1024 * 1024
  });
});

afterEach(() => vi.restoreAllMocks());

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ToastProvider><AdminBackupsPage /></ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('AdminBackupsPage', () => {
  it('accepts a backup through drag and drop and keeps explorer selection available', async () => {
    renderPage();

    const dropzone = await screen.findByRole('button', { name: 'Перетягніть архів сюди або натисніть, щоб відкрити провідник' });
    const archive = new File(['workspace-backup'], 'workspace-2030-01-01.tar.gz', { type: 'application/gzip' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [archive] } });

    expect(screen.getByText('workspace-2030-01-01.tar.gz')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Відновити дані' })).toBeInTheDocument();
    expect(screen.getByLabelText('Вибрано архів workspace-2030-01-01.tar.gz. Натисніть, щоб вибрати інший')).toBeInTheDocument();
    expect(appStyles).toMatch(/\.backup-dropzone\s*\{[^}]*border:\s*1\.5px dashed/);
  });

  it('shows a loader and progress bar while a manual backup is running', async () => {
    let resolveBackup: ((run: BackupRun) => void) | undefined;
    vi.spyOn(api.admin, 'runBackup').mockImplementation(() => new Promise((resolve) => { resolveBackup = resolve; }));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Створити зараз' }));

    const progress = screen.getByRole('progressbar', { name: 'Прогрес створення резервної копії' });
    expect(progress).toHaveAttribute('aria-valuenow', '8');
    expect(screen.getByText('Створюємо архів і надсилаємо його в Telegram...')).toBeInTheDocument();

    await act(async () => resolveBackup?.(completedRun));
    expect(progress).toHaveAttribute('aria-valuenow', '100');
  });
});
