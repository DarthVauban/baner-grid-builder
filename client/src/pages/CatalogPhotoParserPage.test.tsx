import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import type { CatalogPhotoParserErrorFeed } from '../types/catalog';
import { CatalogPhotoParserPage } from './CatalogPhotoParserPage';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  showToast: vi.fn()
}));

vi.mock('../dialogs/ConfirmDialogContext', () => ({
  useConfirmDialog: () => mocks.confirm
}));

vi.mock('../toast/ToastContext', () => ({
  useToast: () => ({ showToast: mocks.showToast })
}));

const errorFeed: CatalogPhotoParserErrorFeed = {
  items: [{
    id: 'run-1',
    batchId: 'batch-1',
    productId: 'product-1',
    productCode: 'SM-000001',
    productName: 'Test Phone',
    mainImageUrl: '',
    sourceUrl: 'https://shop.example.com/test-phone',
    adapterId: 'example',
    status: 'failed',
    foundCount: 0,
    savedCount: 0,
    skippedCount: 0,
    errorMessage: 'Сторінка повернула HTTP 403',
    errors: [{ stage: 'page', message: 'HTTP 403' }],
    createdAt: '2030-01-01T10:00:00.000Z',
    startedAt: '2030-01-01T10:00:01.000Z',
    completedAt: '2030-01-01T10:00:02.000Z'
  }],
  total: 1,
  page: 1,
  pageSize: 25,
  pageCount: 1
};

beforeEach(() => {
  window.localStorage.clear();
  mocks.confirm.mockResolvedValue(true);
  vi.spyOn(api.catalog.photoParser, 'errors').mockResolvedValue(errorFeed);
  vi.spyOn(api.catalog.photoParser, 'clearErrors').mockResolvedValue({ clearedCount: 1 });
});

afterEach(() => vi.restoreAllMocks());

function renderPage(entry = '/catalog/photo-parser?tab=errors') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <QueryClientProvider client={client}>
        <CatalogPhotoParserPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('CatalogPhotoParserPage error log', () => {
  it('clears error notifications only after confirmation', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Очистити журнал' }));

    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Очистити журнал помилок?',
      tone: 'danger'
    }));
    expect(api.catalog.photoParser.clearErrors).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      'Журнал очищено. Приховано записів: 1.',
      'success'
    ));
  });

  it('keeps the log when confirmation is cancelled', async () => {
    mocks.confirm.mockResolvedValue(false);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Очистити журнал' }));

    expect(api.catalog.photoParser.clearErrors).not.toHaveBeenCalled();
  });
});

describe('CatalogPhotoParserPage media folder', () => {
  it('selects a parent folder and sends it with the parser batch', async () => {
    const folder = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Смартфони',
      parentId: null,
      createdBy: null,
      createdAt: '2030-01-01T10:00:00.000Z',
      updatedAt: '2030-01-01T10:00:00.000Z'
    };
    vi.spyOn(api.catalog.photoParser, 'products').mockResolvedValue({
      items: [{
        id: 'product-1',
        productCode: 'SM-000001',
        name: 'Samsung S25 Ultra',
        mainImageUrl: '',
        photoCount: 0,
        sourceUrl: 'https://shop.example.com/s25-ultra',
        latestRun: null,
        updatedAt: '2030-01-01T10:00:00.000Z'
      }],
      summary: { total: 1, withPhotos: 0, withoutPhotos: 1 },
      total: 1,
      page: 1,
      pageSize: 50,
      pageCount: 1
    });
    vi.spyOn(api.catalog.photoParser, 'activeBatch').mockResolvedValue(null);
    vi.spyOn(api.media, 'folders').mockImplementation(async (parentId?: string) => parentId
      ? { items: [], breadcrumbs: [folder] }
      : { items: [folder], breadcrumbs: [] });
    const start = vi.spyOn(api.catalog.photoParser, 'startBatch').mockResolvedValue({
      id: 'batch-2',
      status: 'queued',
      requestedCount: 1,
      targetFolder: { id: folder.id, name: folder.name },
      counts: { queued: 1, running: 0, success: 0, partial: 0, failed: 0 },
      items: [],
      createdAt: '2030-01-01T10:00:00.000Z',
      startedAt: null,
      completedAt: null
    });
    vi.spyOn(api.catalog.photoParser, 'batch').mockResolvedValue({
      id: 'batch-2',
      status: 'completed',
      requestedCount: 1,
      targetFolder: { id: folder.id, name: folder.name },
      counts: { queued: 0, running: 0, success: 1, partial: 0, failed: 0 },
      items: [],
      createdAt: '2030-01-01T10:00:00.000Z',
      startedAt: '2030-01-01T10:00:01.000Z',
      completedAt: '2030-01-01T10:00:02.000Z'
    });
    const user = userEvent.setup();
    renderPage('/catalog/photo-parser');

    await user.click(await screen.findByRole('button', { name: 'Вибрати' }));
    await user.click(await screen.findByRole('button', { name: /Смартфони/ }));
    await user.click(await screen.findByRole('button', { name: 'Вибрати цю папку' }));
    expect(screen.getByTitle('Смартфони')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Парсити всі посилання' }));
    await waitFor(() => expect(start).toHaveBeenCalled());
    expect(start.mock.calls[0][0]).toEqual({
      search: '',
      photoStatus: 'all',
      targetFolderId: folder.id
    });
  });
});
