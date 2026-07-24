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
  mocks.confirm.mockResolvedValue(true);
  vi.spyOn(api.catalog.photoParser, 'errors').mockResolvedValue(errorFeed);
  vi.spyOn(api.catalog.photoParser, 'clearErrors').mockResolvedValue({ clearedCount: 1 });
});

afterEach(() => vi.restoreAllMocks());

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <MemoryRouter initialEntries={['/catalog/photo-parser?tab=errors']}>
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
