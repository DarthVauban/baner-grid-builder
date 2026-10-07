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
  categories: [{ externalId: 'phones', title: 'Телефони' }, { externalId: 'audio', title: 'Аудіо' }],
  brands: ['Apple', 'Samsung'], availabilityOptions: ['В наявності'],
  maximumPopularity: 5,
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
  it('shows catalog synchronization progress after refresh starts', async () => {
    const user = userEvent.setup();
    const syncingCatalog: PopularityCatalog = {
      ...catalog,
      integration: { ...catalog.integration, status: 'syncing', latestRun: {
        id: 'sync-a', mode: 'manual', status: 'running', categoriesReceived: 12,
        stickersReceived: 0, productsReceived: 300, modificationsReceived: 450,
        pagesReceived: 2, exportItemsReceived: 300, exportItemsTotal: 600,
        progressPercentage: 50, errorMessage: null,
        startedAt: '2026-10-07T10:01:00Z', completedAt: null
      } }
    };
    vi.spyOn(api.horoshopPopularity, 'catalog').mockResolvedValueOnce(catalog).mockResolvedValue(syncingCatalog);
    vi.spyOn(api.horoshopPopularity, 'sync').mockResolvedValue({ started: true, integration: syncingCatalog.integration });
    renderPage();
    await screen.findByText('Телефон');

    await user.click(screen.getByRole('button', { name: 'Оновити каталог' }));
    const progress = await screen.findByRole('region', { name: 'Синхронізація каталогу Хорошоп' });
    expect(within(progress).getByText('Синхронізуємо каталог з Хорошопом')).toBeInTheDocument();
    expect(within(progress).getByText('50%')).toBeInTheDocument();
    expect(within(progress).getByText('Отримано: 300 із 600')).toBeInTheDocument();
    expect(within(progress).getByText('Модифікацій: 450')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Синхронізуємо…' })).toBeDisabled();
  });

  it('filters by multiple brands and selects all products matching the filter', async () => {
    const user = userEvent.setup();
    let finishPendingRequest = () => {};
    const catalogSpy = vi.spyOn(api.horoshopPopularity, 'catalog').mockImplementation((filters) =>
      filters.brands.length === 1 ? new Promise<PopularityCatalog>((resolve) => { finishPendingRequest = () => resolve(catalog); }) : Promise.resolve(catalog));
    renderPage();
    await screen.findByText('Телефон');

    await user.click(screen.getByText('Усі бренди'));
    expect(screen.getByText('Бренди').closest('details')).toHaveAttribute('open');
    await user.click(screen.getByRole('button', { name: 'Категорія' }));
    expect(screen.getByText('Бренди').closest('details')).not.toHaveAttribute('open');
    await user.click(screen.getByText('Усі бренди'));
    await user.type(screen.getByRole('searchbox', { name: 'Пошук бренду' }), 'Sam');
    expect(screen.queryByRole('checkbox', { name: 'Apple' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Samsung' })).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Пошук бренду' }));
    await user.click(screen.getByRole('checkbox', { name: 'Apple' }));
    expect(screen.getByRole('checkbox', { name: 'Samsung' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Samsung' }));
    finishPendingRequest();
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
    const scopedSpy = vi.spyOn(api.horoshopPopularity, 'catalogSelection').mockResolvedValue({
      ...catalog, items: [catalog.items[0]], total: 1, matchingProductIds: ['parent-a']
    });
    const previewSpy = vi.spyOn(api.horoshopPopularity, 'preview').mockResolvedValue(preview);
    vi.spyOn(api.horoshopPopularity, 'operation').mockResolvedValue(preview);
    renderPage();
    await screen.findByText('Телефон');

    await user.click(screen.getByRole('button', { name: 'Назва або артикул' }));
    const searchDialog = screen.getByRole('dialog', { name: 'Пошук за назвою або артикулом' });
    fireEvent.change(within(searchDialog).getByRole('textbox', { name: 'Назви або артикули' }), { target: { value: 'PHONE-BLACK\nUNKNOWN' } });
    await user.click(within(searchDialog).getByRole('button', { name: 'Створити вибірку зі списку' }));
    expect(resolveSpy).toHaveBeenCalledWith(['PHONE-BLACK', 'UNKNOWN']);
    expect(screen.queryByRole('dialog', { name: 'Пошук за назвою або артикулом' })).not.toBeInTheDocument();
    expect(await screen.findByText('Не знайдено: UNKNOWN')).toBeInTheDocument();
    expect(await screen.findByText('Товари · 1')).toBeInTheDocument();
    expect(scopedSpy).toHaveBeenCalledWith(['parent-a'], expect.anything(), 1, 25, expect.anything());
    expect(screen.queryByText('Навушники')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Вибрати всі 1 за фільтром' }));
    await user.click(screen.getByRole('button', { name: 'Масова дія' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByRole('spinbutton', { name: 'Нове значення' }), '20');
    await user.click(within(dialog).getByRole('button', { name: 'Перевірити зміни' }));
    expect(previewSpy).toHaveBeenCalledWith({ productIds: ['parent-a'] }, 'set', 20);
    expect(await screen.findByText('Перевірте зміни')).toBeInTheDocument();
  });

  it('applies one search term from the popup and keeps edits unapplied when cancelled', async () => {
    const user = userEvent.setup();
    const catalogSpy = vi.spyOn(api.horoshopPopularity, 'catalog').mockResolvedValue(catalog);
    renderPage();
    await screen.findByText('Телефон');

    await user.click(screen.getByRole('button', { name: 'Назва або артикул' }));
    const dialog = screen.getByRole('dialog', { name: 'Пошук за назвою або артикулом' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Назви або артикули' }), 'PHONE');
    await user.click(within(dialog).getByRole('button', { name: 'Скасувати' }));
    expect(catalogSpy).toHaveBeenLastCalledWith(expect.objectContaining({ search: '' }), 1, 25, expect.anything());

    await user.click(screen.getByRole('button', { name: 'Назва або артикул' }));
    await user.type(within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Назви або артикули' }), 'PHONE');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Застосувати пошук' }));
    expect(catalogSpy).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'PHONE' }), 1, 25, expect.anything());
    expect(screen.getByRole('button', { name: 'Назва або артикул' })).toHaveTextContent('PHONE');
  });

  it('searches category options and applies a popularity range up to the catalog maximum', async () => {
    const user = userEvent.setup();
    const catalogSpy = vi.spyOn(api.horoshopPopularity, 'catalog').mockResolvedValue(catalog);
    renderPage();
    await screen.findByText('Телефон');

    await user.click(screen.getByRole('button', { name: 'Категорія' }));
    await user.type(screen.getByPlaceholderText('Пошук'), 'Тел');
    expect(screen.getByRole('option', { name: 'Телефони' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Аудіо' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Телефони' }));
    expect(catalogSpy).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'phones' }), 1, 25, expect.anything());

    await user.click(screen.getByText('Популярність', { selector: '.hp-popularity-filter summary span' }).closest('summary')!);
    await user.click(screen.getByRole('radio', { name: 'Діапазон' }));
    expect(screen.getByText('Від 0 до 5 у каталозі')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider', { name: 'Мінімальна популярність' }), { target: { value: '1' } });
    await user.click(screen.getByRole('button', { name: 'Застосувати' }));
    expect(catalogSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      category: 'phones', popularity: 'range', popularityMin: 1, popularityMax: 5
    }), 1, 25, expect.anything());
  });
});
