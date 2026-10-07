import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { ToastProvider } from '../toast/ToastContext';
import type { PopularityCatalog, PopularityOperation } from '../types/horoshop-popularity';
import { HoroshopPopularityPage } from './HoroshopPopularityPage';

const catalog: PopularityCatalog = {
  integration: {
    configured: true, status: 'connected', storeDomain: 'shop.example.com',
    pollingIntervalMinutes: 15, lastSyncAt: '2026-10-07T10:00:00Z', lastError: null,
    counts: { categories: 1, stickers: 0, products: 2, modifications: 2 }, latestRun: null
  },
  categories: [{ externalId: 'phones', title: 'Телефони' }],
  brands: ['Apple', 'Samsung'], availabilityOptions: ['В наявності'],
  total: 2, page: 1, pageSize: 25, pageCount: 1,
  items: [
    { id: 'parent-a', externalId: '101', sku: 'PHONE', titles: { uk: 'Телефон' }, title: 'Телефон',
      brand: 'Apple', categoryExternalId: 'phones', availability: 'В наявності', popularity: '5',
      imageUrl: null, pageUrl: null, modifications: [{ id: 'variant-a', sku: 'PHONE-BLACK', titles: { uk: 'Телефон чорний' } }] },
    { id: 'parent-b', externalId: '102', sku: 'HEADSET', titles: { uk: 'Навушники' }, title: 'Навушники',
      brand: 'Samsung', categoryExternalId: 'phones', availability: 'В наявності', popularity: '0',
      imageUrl: null, pageUrl: null, modifications: [{ id: 'variant-b', sku: 'HEADSET-1', titles: { uk: 'Навушники білі' } }] }
  ]
};

const preview: PopularityOperation = {
  id: 'operation-a', action: 'set', value: 20, status: 'draft', errorMessage: '', actorUserId: null,
  createdAt: '2026-10-07T10:00:00Z', startedAt: null, completedAt: null,
  counts: { pending: 1 }, total: 1,
  items: [{ id: 'item-a', productId: 'parent-a', externalId: '101', article: 'PHONE',
    title: 'Телефон', articles: ['PHONE-BLACK'], before: 5, target: 20,
    observed: null, status: 'pending', message: '' }]
};

afterEach(() => vi.restoreAllMocks());

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><ToastProvider>
    <HoroshopPopularityPage />
  </ToastProvider></MemoryRouter></QueryClientProvider>);
}

describe('HoroshopPopularityPage', () => {
  it('filters by multiple brands and selects all products matching the filter', async () => {
    const user = userEvent.setup();
    const catalogSpy = vi.spyOn(api.horoshopPopularity, 'catalog').mockResolvedValue(catalog);
    renderPage();
    await screen.findByText('Телефон');

    await user.click(screen.getByText('Усі бренди'));
    await user.click(screen.getByRole('checkbox', { name: 'Apple' }));
    await user.click(screen.getByRole('checkbox', { name: 'Samsung' }));
    expect(catalogSpy).toHaveBeenLastCalledWith(expect.objectContaining({ brands: ['Apple', 'Samsung'] }), 1, 25, expect.anything());

    await user.click(screen.getByRole('button', { name: 'Вибрати всі 2 за фільтром' }));
    expect(screen.getByText('2 товарів вибрано')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Масова дія' })).toBeEnabled();
  });

  it('turns a pasted variant article into a parent selection and previews one product', async () => {
    const user = userEvent.setup();
    vi.spyOn(api.horoshopPopularity, 'catalog').mockResolvedValue(catalog);
    const resolveSpy = vi.spyOn(api.horoshopPopularity, 'resolve').mockResolvedValue({
      matched: [{ input: 'PHONE-BLACK', productId: 'parent-a', sku: 'PHONE', title: 'Телефон' }],
      ambiguous: [], unmatched: ['UNKNOWN']
    });
    const previewSpy = vi.spyOn(api.horoshopPopularity, 'preview').mockResolvedValue(preview);
    vi.spyOn(api.horoshopPopularity, 'operation').mockResolvedValue(preview);
    renderPage();
    await screen.findByText('Телефон');

    fireEvent.change(screen.getByRole('textbox', { name: 'Назва або артикул' }), { target: { value: 'PHONE-BLACK\nUNKNOWN' } });
    await user.click(screen.getByRole('button', { name: 'Створити вибірку зі списку' }));
    expect(resolveSpy).toHaveBeenCalledWith(['PHONE-BLACK', 'UNKNOWN']);
    expect(await screen.findByText('Не знайдено: UNKNOWN')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Масова дія' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByRole('spinbutton', { name: 'Нове значення' }), '20');
    await user.click(within(dialog).getByRole('button', { name: 'Перевірити зміни' }));
    expect(previewSpy).toHaveBeenCalledWith({ productIds: ['parent-a'] }, 'set', 20);
    expect(await screen.findByText('Перевірте зміни')).toBeInTheDocument();
  });
});
