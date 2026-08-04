import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import type { CatalogFeed, CatalogProduct } from '../types/catalog';
import { CatalogArchivePage } from './CatalogArchivePage';

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

const archivedProduct = {
  id: '11111111-1111-4111-8111-111111111111',
  productCode: 'SM-000101',
  name: 'iPhone 15 Pro 256 GB',
  condition: 'USED',
  conditionLabel: 'Вживаний',
  stockCount: 0,
  incomingCount: 0,
  availability: { status: 'unavailable', label: 'Немає' },
  priceUah: 34999,
  priceLabel: '34 999 ₴',
  popularityPosition: 0,
  publicationStatus: 'ARCHIVED',
  publicationStatusLabel: 'Архів',
  slug: 'iphone-15-pro-256',
  publicPath: '/storefront/smartphones/iphone-15-pro-256',
  brand: { id: 'brand-id', label: 'Apple' },
  mainImageUrl: '',
  gallery: [],
  shortDescription: '',
  description: '',
  seoTitle: '',
  seoDescription: '',
  socialDescription: '',
  bodyCondition: '',
  displayCondition: '',
  batteryHealth: '',
  warranty: '',
  includedAccessories: '',
  diagnostics: {},
  version: 4,
  createdAt: '2030-01-01T10:00:00.000Z',
  updatedAt: '2030-02-01T12:30:00.000Z'
} satisfies CatalogProduct;

const feed: CatalogFeed = {
  items: [archivedProduct],
  total: 1,
  page: 1,
  pageSize: 25,
  pageCount: 1
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(<QueryClientProvider client={client}><CatalogArchivePage /></QueryClientProvider>);
}

beforeEach(() => {
  mocks.confirm.mockResolvedValue(true);
  vi.spyOn(api.catalog, 'list').mockResolvedValue(feed);
  vi.spyOn(api.catalog, 'permanentlyRemove').mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

describe('CatalogArchivePage', () => {
  it('loads only archived products and permanently deletes after confirmation', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Архів товарів' })).toBeInTheDocument();
    expect(await screen.findByText('iPhone 15 Pro 256 GB')).toBeInTheDocument();
    expect(api.catalog.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'ARCHIVED' }));

    await user.click(screen.getByRole('button', { name: 'Видалити назавжди iPhone 15 Pro 256 GB' }));

    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Видалити товар назавжди?',
      confirmLabel: 'Видалити назавжди',
      tone: 'danger'
    }));
    await waitFor(() => expect(api.catalog.permanentlyRemove).toHaveBeenCalledWith(archivedProduct.id, archivedProduct.version));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      'Товар «iPhone 15 Pro 256 GB» повністю видалено з бази даних.',
      'success'
    ));
  });

  it('does not delete when confirmation is cancelled', async () => {
    mocks.confirm.mockResolvedValue(false);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Видалити назавжди iPhone 15 Pro 256 GB' }));

    expect(api.catalog.permanentlyRemove).not.toHaveBeenCalled();
  });
});
