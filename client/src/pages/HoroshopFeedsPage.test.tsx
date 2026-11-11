import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { ToastProvider } from '../toast/ToastContext';
import type { FeedCatalog, FeedOperation } from '../types/horoshop-feeds';
import { HoroshopFeedsPage } from './HoroshopFeedsPage';

const catalog: FeedCatalog = {
  integration: { configured: true, status: 'connected', storeDomain: 'shop.example.com', pollingIntervalMinutes: 15,
    lastSyncAt: '2026-11-11T10:00:00Z', lastError: null, counts: { categories: 1, stickers: 0, products: 2, modifications: 2 }, latestRun: null },
  categories: [{ externalId: 'phones', title: 'Телефони' }], brands: ['Apple', 'Samsung'], availabilityOptions: ['В наявності'],
  total: 2, page: 1, pageSize: 25, pageCount: 1,
  items: ['PHONE', 'HEADSET'].map((sku, index) => ({
    id: `parent-${index}`, externalId: String(index + 1), sku, title: index ? 'Навушники' : 'Телефон', titles: {},
    brand: index ? 'Samsung' : 'Apple', categoryExternalId: 'phones', availability: 'В наявності',
    imageUrl: null, pageUrl: null, marketplaces: [], google: 'disabled', facebook: 'disabled', modifications: []
  }))
};
const preview: FeedOperation = {
  id: 'operation-a', action: { google: 'enable', facebook: 'keep' }, status: 'draft', errorMessage: '', actorUserId: null,
  createdAt: '2026-11-11T10:00:00Z', startedAt: null, completedAt: null, counts: { pending: 1 }, total: 1,
  items: [{ id: 'item-a', productId: 'parent-0', externalId: '1', article: 'PHONE', title: 'Телефон', articles: ['PHONE'],
    before: [{ article: 'PHONE', marketplaces: ['Rozetka Feed'] }],
    target: [{ article: 'PHONE', marketplaces: ['Google Feed for Merchant Center', 'Rozetka Feed'] }],
    resolvedBefore: null, resolvedTarget: null, observed: null, status: 'pending', message: '' }]
};
afterEach(() => vi.restoreAllMocks());
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><ToastProvider><HoroshopFeedsPage /></ToastProvider></MemoryRouter></QueryClientProvider>);
}
async function chooseGoogle(user: ReturnType<typeof userEvent.setup>) {
  if (!screen.queryByRole('dialog', { name: 'Масова дія' })) await user.click(screen.getByRole('button', { name: 'Масова дія' }));
  await user.click(screen.getByRole('button', { name: 'Дія: Google Merchant Center' }));
  await user.click(screen.getByRole('option', { name: 'Додати до фіда' }));
}

describe('HoroshopFeedsPage', () => {
  it('opens a visible preparation screen immediately while preview is pending', async () => {
    const user = userEvent.setup();
    vi.spyOn(api.horoshopFeeds, 'catalog').mockResolvedValue(catalog);
    let complete!: (value: FeedOperation) => void;
    vi.spyOn(api.horoshopFeeds, 'preview').mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    renderPage(); await screen.findByText('Телефон');
    await user.click(screen.getByRole('checkbox', { name: 'Вибрати PHONE' }));
    await chooseGoogle(user);
    await user.click(screen.getByRole('button', { name: 'Перевірити зміни' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Перевірте зміни' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Готуємо перегляд змін');
    complete(preview);
    expect(await screen.findByRole('button', { name: 'Застосувати зміни' })).toBeEnabled();
  });
  it('requires a selection and action, previews independent channel choices, and applies only after confirmation', async () => {
    const user = userEvent.setup();
    vi.spyOn(api.horoshopFeeds, 'catalog').mockResolvedValue(catalog);
    const previewSpy = vi.spyOn(api.horoshopFeeds, 'preview').mockResolvedValue(preview);
    const completed: FeedOperation = { ...preview, status: 'completed', counts: { succeeded: 1 }, items: preview.items.map((item) => ({ ...item, status: 'succeeded' })) };
    const applySpy = vi.spyOn(api.horoshopFeeds, 'apply').mockResolvedValue(completed);
    vi.spyOn(api.horoshopFeeds, 'operation').mockResolvedValue(completed);
    vi.spyOn(api.horoshopFeeds, 'history').mockResolvedValueOnce([]).mockResolvedValue([{ ...completed, confirmed: 1, problems: 0 }]);
    renderPage();
    await screen.findByText('Телефон');
    await user.click(screen.getByRole('button', { name: 'Історія операцій' }));
    await screen.findByText('Підтверджених операцій ще немає.');
    await user.click(screen.getByRole('button', { name: 'Каталог' }));
    expect(screen.getByRole('button', { name: 'Масова дія' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Перевірити зміни' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Вибрати PHONE' }));
    await user.click(screen.getByRole('button', { name: 'Масова дія' }));
    expect(screen.getByRole('button', { name: 'Перевірити зміни' })).toBeDisabled();
    await chooseGoogle(user);
    await user.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(screen.queryByRole('dialog', { name: 'Масова дія' })).not.toBeInTheDocument();
    expect(previewSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'Вибрати PHONE' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Масова дія' }));
    expect(screen.getByRole('button', { name: 'Перевірити зміни' })).toBeDisabled();
    await chooseGoogle(user);
    await user.click(screen.getByRole('button', { name: 'Перевірити зміни' }));
    expect(previewSpy).toHaveBeenCalledWith({ productIds: ['parent-0'] }, { google: 'enable', facebook: 'keep' });
    const dialog = await screen.findByRole('region', { name: 'Перегляд майбутніх змін' });
    expect(screen.queryByRole('dialog', { name: 'Масова дія' })).not.toBeInTheDocument();
    expect(within(dialog).getByText('Буде: Увімкнено')).toBeInTheDocument();
    expect(applySpy).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Застосувати зміни' }));
    expect(applySpy).toHaveBeenCalledWith('operation-a');
    expect(await screen.findByRole('heading', { name: 'Результат операції' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'До історії' }));
    expect(await screen.findByText('1 із 1')).toBeInTheDocument();
  });

  it('keeps select-all within the pasted list and resets selection when filters change', async () => {
    const user = userEvent.setup();
    vi.spyOn(api.horoshopFeeds, 'catalog').mockResolvedValue(catalog);
    vi.spyOn(api.horoshopFeeds, 'resolve').mockResolvedValue({
      matched: [{ input: 'PHONE-BLACK', productId: 'parent-0', sku: 'PHONE', title: 'Телефон' }], ambiguous: [], unmatched: ['UNKNOWN']
    });
    vi.spyOn(api.horoshopFeeds, 'catalogSelection').mockResolvedValue({ ...catalog, items: [catalog.items[0]], total: 1, matchingProductIds: ['parent-0'] });
    const selectSpy = vi.spyOn(api.horoshopFeeds, 'select').mockResolvedValue({ productIds: ['parent-0'] });
    const previewSpy = vi.spyOn(api.horoshopFeeds, 'preview').mockResolvedValue(preview);
    renderPage(); await screen.findByText('Телефон');
    await user.click(screen.getByRole('button', { name: 'Назва або артикул' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Назви або артикули' }), { target: { value: 'PHONE-BLACK\nUNKNOWN' } });
    await user.click(screen.getByRole('button', { name: 'Створити вибірку зі списку' }));
    expect(await screen.findByText('Не знайдено: UNKNOWN')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Вибрати всі 1 за фільтром' }));
    expect(selectSpy).toHaveBeenCalledWith(expect.anything(), ['parent-0']);
    await chooseGoogle(user);
    await user.click(screen.getByRole('button', { name: 'Перевірити зміни' }));
    expect(previewSpy).toHaveBeenCalledWith({ productIds: ['parent-0'] }, expect.anything());
    await user.click(within(await screen.findByRole('region', { name: 'Перегляд майбутніх змін' })).getByRole('button', { name: 'Повернутися' }));
    await user.click(screen.getByText('Усі бренди'));
    await user.click(screen.getByRole('checkbox', { name: 'Apple' }));
    expect(await screen.findByText('Виберіть товари для масової дії')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Масова дія' })).toBeDisabled();
  });

  it('selects a page and all matching products, preserves the remaining rows on deselection, and shows preview errors on screen', async () => {
    const user = userEvent.setup();
    vi.spyOn(api.horoshopFeeds, 'catalog').mockResolvedValue(catalog);
    const selectSpy = vi.spyOn(api.horoshopFeeds, 'select').mockResolvedValue({ productIds: ['parent-0', 'parent-1'] });
    const previewSpy = vi.spyOn(api.horoshopFeeds, 'preview').mockRejectedValue(new Error('API не повертає поточні фіди.'));
    const applySpy = vi.spyOn(api.horoshopFeeds, 'apply');
    renderPage(); await screen.findByText('Телефон');
    await user.click(screen.getByRole('checkbox', { name: 'Вибрати товари на сторінці' }));
    expect(screen.getByRole('checkbox', { name: 'Вибрати PHONE' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Вибрати HEADSET' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Вибрати PHONE' }));
    expect(screen.getByRole('checkbox', { name: 'Вибрати HEADSET' })).toBeChecked();
    expect((screen.getByRole('checkbox', { name: 'Вибрати товари на сторінці' }) as HTMLInputElement).indeterminate).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Вибрати всі 2 за фільтром' }));
    expect(selectSpy).toHaveBeenCalledWith({ search: '', category: '', brands: [], availability: '' }, undefined);
    await chooseGoogle(user);
    await user.click(screen.getByRole('button', { name: 'Перевірити зміни' }));
    expect(previewSpy).toHaveBeenCalledWith({ productIds: ['parent-0', 'parent-1'] }, { google: 'enable', facebook: 'keep' });
    expect(await screen.findByText('API не повертає поточні фіди.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Перегляд майбутніх змін' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('API не повертає поточні фіди.');
    expect(screen.getByRole('button', { name: 'Повторити підготовку' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Застосувати зміни' })).not.toBeInTheDocument();
    expect(applySpy).not.toHaveBeenCalled();
  });

  it('shows configuration and synchronization states without allowing writes', async () => {
    vi.spyOn(api.horoshopFeeds, 'catalog').mockResolvedValue({ ...catalog, items: [], integration: { ...catalog.integration, configured: false, status: 'disconnected' } });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Підключіть магазин Хорошоп' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Перевірити зміни' })).not.toBeInTheDocument();
  });
});
