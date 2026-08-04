import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import type { CatalogBrand, CatalogBrandDirectory } from '../types/catalog';
import { CatalogBrandsPage } from './CatalogBrandsPage';

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

const directory: CatalogBrandDirectory = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Бренди смартфонів',
  description: '',
  active: true,
  sortOrder: 0,
  brandCount: 1,
  createdAt: '2030-01-01T10:00:00.000Z',
  updatedAt: '2030-01-01T10:00:00.000Z'
};

const brand: CatalogBrand = {
  id: '22222222-2222-4222-8222-222222222222',
  directoryId: directory.id,
  directoryLabel: directory.label,
  label: 'Test Brand',
  logoUrl: '',
  active: true,
  sortOrder: 0,
  createdAt: '2030-01-01T10:00:00.000Z',
  updatedAt: '2030-01-01T10:00:00.000Z'
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(<QueryClientProvider client={queryClient}><CatalogBrandsPage /></QueryClientProvider>);
}

beforeEach(() => {
  mocks.confirm.mockReset().mockResolvedValue(true);
  mocks.showToast.mockReset();
  vi.spyOn(api.catalog, 'brandDirectories').mockResolvedValue([directory]);
  vi.spyOn(api.catalog, 'brands').mockResolvedValue([brand]);
  vi.spyOn(api.catalog, 'removeBrand').mockResolvedValue({ detachedProductCount: 2 });
});

afterEach(() => vi.restoreAllMocks());

describe('CatalogBrandsPage', () => {
  it('deletes a brand after warning about linked products', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Видалити бренд Test Brand' }));

    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Видалити бренд?',
      confirmLabel: 'Видалити бренд',
      tone: 'danger'
    }));
    await waitFor(() => expect(api.catalog.removeBrand).toHaveBeenCalledWith(brand.id));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      'Бренд «Test Brand» видалено. Відв’язано товарів: 2.',
      'success'
    ));
  });

  it('keeps a brand when confirmation is cancelled', async () => {
    mocks.confirm.mockResolvedValue(false);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Видалити бренд Test Brand' }));

    expect(api.catalog.removeBrand).not.toHaveBeenCalled();
  });
});
