import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import appStyles from '../styles/app.css?raw';
import type { SystemMetrics } from '../types/system';
import { AdminSystemPage } from './AdminSystemPage';

const sampleMetrics: SystemMetrics = {
  sampledAt: '2030-01-01T10:00:00.000Z',
  status: 'degraded',
  issues: [{
    id: 'photo-parser',
    component: 'Фотопарсер',
    status: 'degraded',
    title: 'Є товари, які не вдалося обробити',
    description: 'Кількість невдалих обробок товарів за останні 24 години: 4. Сам сервер працює, але частина посилань або фотографій завершилася помилкою.',
    recommendation: 'Перегляньте список помилок, перевірте проблемні посилання та за потреби повторіть парсинг окремих товарів.',
    action: {
      label: 'Переглянути помилки парсера',
      href: '/catalog/photo-parser?tab=errors'
    }
  }],
  services: [
    { id: 'api', label: 'API сервера', status: 'operational', detail: '12 мс на збір метрик' },
    { id: 'database', label: 'PostgreSQL', status: 'operational', detail: '4 мс' },
    { id: 'storage', label: 'Сховище медіа', status: 'operational', detail: 'Постійний том, запис доступний' },
    { id: 'photo-parser', label: 'Фотопарсер', status: 'degraded', detail: 'Невдалих обробок за 24 год: 4' },
    { id: 'backups', label: 'Резервні копії', status: 'unknown', detail: 'Ще не запускались' }
  ],
  cpu: {
    status: 'operational',
    usagePercent: 27.4,
    processPercent: 3.2,
    cores: 8,
    model: 'Test CPU',
    loadAverage: [0.4, 0.3, 0.2]
  },
  memory: {
    status: 'operational',
    totalBytes: 16 * 1024 ** 3,
    usedBytes: 8 * 1024 ** 3,
    freeBytes: 8 * 1024 ** 3,
    usagePercent: 50,
    process: {
      rssBytes: 180 * 1024 ** 2,
      heapUsedBytes: 70 * 1024 ** 2,
      heapTotalBytes: 100 * 1024 ** 2,
      externalBytes: 5 * 1024 ** 2
    }
  },
  storage: {
    status: 'operational',
    writable: true,
    persistent: true,
    totalBytes: 100 * 1024 ** 3,
    usedBytes: 62 * 1024 ** 3,
    freeBytes: 38 * 1024 ** 3,
    usagePercent: 62
  },
  database: {
    status: 'operational',
    latencyMs: 4.1,
    sizeBytes: 420 * 1024 ** 2,
    serverTime: '2030-01-01T10:00:00.000Z',
    latestMigration: '034_photo_parser.sql',
    pool: { total: 4, idle: 3, waiting: 0 }
  },
  runtime: {
    environment: 'production',
    buildSha: 'abcdef1234567890',
    nodeVersion: 'v24.0.0',
    platform: 'linux',
    platformRelease: '6.8.0',
    architecture: 'x64',
    hostname: 'workspace-01',
    processId: 42,
    processUptimeSeconds: 7_200,
    hostUptimeSeconds: 172_800,
    eventLoopUtilizationPercent: 1.2,
    collectionDurationMs: 12
  },
  workload: {
    approvedUsers: 15,
    activeTasks: 7,
    openApplications: 3,
    photoParser: { queued: 2, running: 1, failedLast24Hours: 4 },
    backups: {
      automaticEnabled: true,
      nextRunAt: '2030-01-02T01:00:00.000Z',
      lastRunAt: '2030-01-01T01:00:00.000Z',
      latestStatus: 'success',
      latestCompletedAt: '2030-01-01T01:02:00.000Z'
    }
  }
};

afterEach(() => vi.restoreAllMocks());

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <AdminSystemPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('AdminSystemPage', () => {
  it('renders live resources, services and the five-state legend', async () => {
    vi.spyOn(api.admin, 'systemMetrics').mockResolvedValue(sampleMetrics);
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Технічний стан' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Потребує уваги' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Що саме потребує уваги' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Є товари, які не вдалося обробити' })).toBeInTheDocument();
    expect(screen.getByText(/Кількість невдалих обробок товарів за останні 24 години: 4/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Переглянути помилки парсера/ })).toHaveAttribute('href', '/catalog/photo-parser?tab=errors');
    expect(screen.getByText('8 логічних ядер')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Графік навантаження CPU 27% та RAM 50%/ })).toBeInTheDocument();
    expect(screen.getAllByText('Потребує уваги').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Критичний стан').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Неактивно').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Стан невідомий').length).toBeGreaterThan(0);
    expect(appStyles).toMatch(/\.system-resource-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4/);
    expect(appStyles).toMatch(/\.system-diagnostics\s*\{[^}]*border:/);
  });

  it('allows the administrator to request an immediate refresh', async () => {
    const metrics = vi.spyOn(api.admin, 'systemMetrics').mockResolvedValue(sampleMetrics);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('API сервера');
    await user.click(screen.getByRole('button', { name: 'Оновити зараз' }));
    expect(metrics).toHaveBeenCalledTimes(2);
  });
});
