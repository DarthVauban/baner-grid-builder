import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { ToastProvider } from '../toast/ToastContext';
import type { StickerCatalog, StickerOperation, StickerPreparationProgress } from '../types/horoshop-sticker';
import { HoroshopStickersPage } from './HoroshopStickersPage';

const productIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const operationId = '33333333-3333-4333-8333-333333333333';
const catalog: StickerCatalog = {
  items: [{ id: productIds[0], externalId: '101', sku: '0001', titles: { uk: 'Телефон' }, brand: 'Apple', categoryExternalId: 'phones', price: '100', availability: 'В наявності', visible: true, imageUrl: null, canonicalUrl: null, stickers: [{ id: '1', title: 'Хіт' }], horoshopCreatedAt: '2026-09-01', modifications: [] }],
  total: 2, page: 1, pageSize: 25, pageCount: 2, storeDomain: 'shop.example.com', lastSyncAt: '2026-09-28T10:00:00Z',
  categories: [{ externalId: 'phones', parentExternalId: null, title: 'Телефони' }], brands: ['Apple'], availabilityOptions: ['В наявності'],
  directory: [{ externalId: '1', title: 'Хіт', enabled: true }, { externalId: '11', title: 'Акція', enabled: true }]
};
const preview: StickerOperation = {
  id: operationId, name: 'Зміна стікерів', kind: 'change', parentId: null, actorName: 'Адмін', createdAt: '2026-09-28T10:00:00Z', startedAt: null, completedAt: null,
  status: 'draft', stopRequested: false, counts: { pending: 1 }, total: 1, page: 1, pageCount: 1,
  items: [{ id: 'item', productId: productIds[0], externalId: '101', article: '0001', title: 'Телефон', membership: ['0001'], before: [{ id: '1', title: 'Хіт' }], after: [{ id: '1', title: 'Хіт' }, { id: '11', title: 'Акція' }], addIds: ['11'], removeIds: [], status: 'pending', message: '' }]
};
function renderPage(entry = '/tools/horoshop-stickers') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { ...render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]}><ToastProvider><HoroshopStickersPage /></ToastProvider></MemoryRouter></QueryClientProvider>), queryClient: client };
}
async function openStickers() {
  fireEvent.click(screen.getByRole('tab', { name: 'Стікери' }));
  await waitFor(() => expect(api.horoshopStickers.selectionSummary).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByText('Перевіряємо стікери вибраних товарів…')).not.toBeInTheDocument());
}
beforeEach(() => {
  vi.spyOn(api.horoshopStickers, 'catalog').mockResolvedValue(structuredClone(catalog));
  vi.spyOn(api.horoshopStickers, 'history').mockResolvedValue([]);
  vi.spyOn(api.horoshopStickers, 'selections').mockResolvedValue([]);
  vi.spyOn(api.horoshopStickers, 'select').mockResolvedValue({ productIds });
  vi.spyOn(api.horoshopStickers, 'selectionSummary').mockImplementation(async (ids) => ({ total: ids.length,
    stickers: ids.includes(productIds[0]) ? [{ ...catalog.directory[0], productCount: 1 }] : [] }));
  vi.spyOn(api.horoshopStickers, 'saveSelection').mockResolvedValue([]);
  vi.spyOn(api.horoshopStickers, 'preview').mockResolvedValue(structuredClone(preview));
  vi.spyOn(api.horoshopStickers, 'detail').mockResolvedValue(structuredClone(preview));
  vi.spyOn(api.horoshopStickers, 'action').mockResolvedValue({ ...structuredClone(preview), status: 'queued' });
  vi.spyOn(api.horoshopStickers, 'refreshDirectory').mockResolvedValue({ refreshed: true });
  vi.spyOn(api.horoshopStickers, 'resolve').mockResolvedValue({ productIds: [productIds[0]], duplicates: 1, unmatched: ['missing'], ambiguous: [{ input: 'duplicate', candidates: [{ id: productIds[1], sku: '0002', title: 'Навушники' }] }] });
});
afterEach(() => vi.restoreAllMocks());

describe('HoroshopStickersPage', () => {
  it('shows live preparation progress across tabs and opens review only when preparation finishes', async () => {
    let report: ((progress: StickerPreparationProgress) => void) | undefined;
    let complete: ((operation: StickerOperation) => void) | undefined;
    vi.mocked(api.horoshopStickers.preview).mockImplementation((_input, onProgress) => {
      report = onProgress;
      return new Promise((resolve) => { complete = resolve; });
    });
    renderPage();
    await screen.findByLabelText('Обрати 0001');
    expect(screen.getByText(/Каталог синхронізовано:/u)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Обрати 0001'));
    await openStickers();
    fireEvent.click(screen.getByLabelText('Додати стікери: Акція'));
    fireEvent.click(screen.getByRole('button', { name: 'Переглянути зміни' }));
    await screen.findByRole('heading', { name: 'Готуємо перегляд змін' });
    expect(screen.getByRole('button', { name: 'Зняти вибір' })).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await act(async () => report?.({ stage: 'comparing', total: 1, processed: 0, productsRead: 0, pagesRead: 0 }));
    expect(screen.getByRole('status')).toHaveTextContent('0 / 1 товарних груп');
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '0');
    fireEvent.click(screen.getByRole('tab', { name: 'Товари' }));
    expect(screen.getByLabelText('Обрати 0001')).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'Готуємо перегляд змін' })).toBeInTheDocument();
    await act(async () => report?.({ stage: 'comparing', total: 1, processed: 1, productsRead: 0, pagesRead: 0 }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '1');
    expect(screen.getByRole('status')).toHaveTextContent('1 / 1 товарних груп');
    await act(async () => complete?.(structuredClone(preview)));
    await screen.findByRole('dialog', { name: 'Зміна стікерів' });
    expect(screen.getByText(/Перегляд створено за останнім синхронізованим каталогом/u)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Готуємо перегляд змін' })).not.toBeInTheDocument();
    expect(api.horoshopStickers.action).not.toHaveBeenCalled();
  });

  it('clears preparation after failure and preserves the selected products and sticker actions for retry', async () => {
    vi.mocked(api.horoshopStickers.preview).mockRejectedValueOnce(new Error('Хорошоп тимчасово недоступний.'));
    renderPage();
    await screen.findByLabelText('Обрати 0001');
    fireEvent.click(screen.getByLabelText('Обрати 0001'));
    await openStickers();
    fireEvent.click(screen.getByLabelText('Додати стікери: Акція'));
    fireEvent.click(screen.getByRole('button', { name: 'Переглянути зміни' }));
    await screen.findByText('Хорошоп тимчасово недоступний.');
    expect(screen.queryByRole('heading', { name: 'Готуємо перегляд змін' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Додати стікери: Акція')).toBeChecked();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Переглянути зміни' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Переглянути зміни' }));
    await screen.findByRole('dialog');
    expect(vi.mocked(api.horoshopStickers.preview).mock.calls[1][0]).toMatchObject({ productIds: [productIds[0]], addIds: ['11'] });
  });

  it('shows rollback preparation inside the operation without publishing or losing its review', async () => {
    const finished: StickerOperation = {
      ...structuredClone(preview), status: 'completed', counts: { succeeded: 1 },
      items: preview.items.map((item) => ({ ...structuredClone(item), status: 'succeeded' }))
    };
    const rollback: StickerOperation = {
      ...structuredClone(preview), id: '44444444-4444-4444-8444-444444444444', name: 'Повернення стікерів', kind: 'rollback', parentId: operationId,
      items: preview.items.map((item) => ({ ...structuredClone(item), before: structuredClone(item.after), after: structuredClone(item.before), addIds: [...item.removeIds], removeIds: [...item.addIds] }))
    };
    vi.mocked(api.horoshopStickers.detail).mockImplementation(async (id) => {
      if (id === rollback.id) return structuredClone(rollback);
      if (id === operationId) return structuredClone(finished);
      throw new Error(`Unexpected operation: ${id}`);
    });
    let complete: ((operation: StickerOperation) => void) | undefined;
    vi.mocked(api.horoshopStickers.action).mockImplementation((_id, _action, report) => {
      report?.({ stage: 'catalog', total: 1, processed: 0, productsRead: 200, pagesRead: 1 });
      return new Promise((resolve) => { complete = resolve; });
    });
    const { queryClient } = renderPage(`/tools/horoshop-stickers?operation=${operationId}`);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Повернути зміни' }));
    await within(dialog).findByRole('heading', { name: 'Готуємо повернення стікерів' });
    expect(within(dialog).getByRole('status')).toHaveTextContent('Отримано товарів: 200');
    expect(within(dialog).getByRole('button', { name: 'Закрити операцію' })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(dialog).toBeInTheDocument();
    await act(async () => complete?.(structuredClone(rollback)));
    const review = await screen.findByRole('dialog', { name: rollback.name });
    await within(review).findByRole('button', { name: 'Застосувати зміни (1)' });
    await act(async () => queryClient.refetchQueries({ queryKey: ['horoshop-sticker-operation', rollback.id, 1], exact: true }));
    expect(api.horoshopStickers.detail).toHaveBeenCalledWith(rollback.id, 1);
    expect(queryClient.getQueryData(['horoshop-sticker-operation', rollback.id, 1])).toMatchObject({ id: rollback.id, parentId: operationId, kind: 'rollback', status: 'draft' });
    expect(within(screen.getByRole('dialog', { name: rollback.name })).getByRole('button', { name: 'Застосувати зміни (1)' })).toBeEnabled();
    expect(api.horoshopStickers.action).toHaveBeenCalledTimes(1);
    expect(api.horoshopStickers.action).toHaveBeenCalledWith(operationId, 'rollback', expect.any(Function));
  });

  it('immediately offers manual icons and requires reviewing before applying', async () => {
    renderPage();
    await screen.findByLabelText('Обрати 0001');
    expect(screen.queryByRole('group', { name: 'Додати стікери' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Обрати 0001'));
    await openStickers();
    expect(screen.queryByLabelText('Додати стікери: Автоматичний')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Додати стікери: Акція'));
    expect(screen.queryByLabelText('Зняти стікери: Акція')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Переглянути зміни' }));
    const dialog = await screen.findByRole('dialog', { name: 'Зміна стікерів' });
    expect(api.horoshopStickers.action).not.toHaveBeenCalled();
    expect(vi.mocked(api.horoshopStickers.preview).mock.calls[0][0]).toMatchObject({ productIds: [productIds[0]], addIds: ['11'], removeIds: [] });
    expect(within(dialog).getByText('+ Акція')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Застосувати зміни (1)' }));
    await waitFor(() => expect(api.horoshopStickers.action).toHaveBeenCalledWith(operationId, 'apply'));
  });

  it('freezes all-result selection, permits exclusions and keeps it across pagination and filter changes', async () => {
    renderPage();
    await screen.findByLabelText('Обрати 0001');
    fireEvent.click(screen.getByRole('button', { name: 'Вибрати всі 2 за фільтром' }));
    await screen.findByText('Обрано: 2');
    fireEvent.click(screen.getByRole('button', { name: 'Далі' }));
    await waitFor(() => expect(api.horoshopStickers.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }), expect.anything()));
    expect(await screen.findByLabelText('Обрати 0001')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Обрати 0001'));
    fireEvent.change(screen.getByLabelText('Назва або артикул'), { target: { value: 'новий фільтр' } });
    await screen.findByLabelText('Обрати 0001');
    await openStickers();
    fireEvent.click(screen.getByLabelText('Додати стікери: Акція'));
    fireEvent.click(screen.getByRole('button', { name: 'Переглянути зміни' }));
    await waitFor(() => expect(api.horoshopStickers.preview).toHaveBeenCalledWith(expect.objectContaining({ productIds: [productIds[1]] }), expect.any(Function)));
  });

  it('resolves pasted articles, exposes unmatched entries and lets the user resolve ambiguity', async () => {
    renderPage();
    await screen.findByLabelText('Обрати 0001');
    fireEvent.change(screen.getByLabelText('Список артикулів'), { target: { value: '0001\nmissing\nduplicate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Знайти й додати до вибірки' }));
    expect(await screen.findByText('Не знайдено: missing')).toBeInTheDocument();
    expect(api.horoshopStickers.resolve).toHaveBeenCalledWith(['0001', 'missing', 'duplicate']);
    fireEvent.click(screen.getByRole('button', { name: 'Навушники · 0002' }));
    expect(screen.getByText('Обрано: 2')).toBeInTheDocument();
    expect(screen.queryByText('Уточніть «duplicate»:')).not.toBeInTheDocument();
  });

  it('restores a running operation from its URL without publishing again and lets the user stop the remainder', async () => {
    vi.mocked(api.horoshopStickers.detail).mockResolvedValue({ ...preview, status: 'running' });
    renderPage(`/tools/horoshop-stickers?operation=${operationId}`);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Застосовується')).toBeInTheDocument();
    expect(api.horoshopStickers.action).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Зупинити залишок' }));
    await waitFor(() => expect(api.horoshopStickers.action).toHaveBeenCalledWith(operationId, 'stop'));
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('offers every manual icon without confirmation or configuration', async () => {
    vi.mocked(api.horoshopStickers.catalog).mockResolvedValue({ ...catalog, directory: [...catalog.directory, { externalId: '12', title: 'Вживані товари', enabled: true }] });
    renderPage();
    await screen.findByLabelText('Обрати 0001');
    expect(screen.queryByRole('button', { name: 'Налаштувати ручні стікери' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Обрати 0001'));
    await openStickers();
    expect(screen.getByLabelText('Додати стікери: Вживані товари')).toBeEnabled();
    fireEvent.click(screen.getByLabelText('Додати стікери: Вживані товари'));
    expect(screen.queryByLabelText('Зняти стікери: Вживані товари')).not.toBeInTheDocument();
    expect(screen.queryByText(/Підтверджую, що вибрані стікери/u)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Переглянути зміни' }));
    await waitFor(() => expect(api.horoshopStickers.preview).toHaveBeenCalledWith(expect.objectContaining({ addIds: ['12'] }), expect.any(Function)));
  });

  it('shows a useful empty directory state without a configuration step', async () => {
    vi.mocked(api.horoshopStickers.catalog).mockResolvedValue({ ...catalog, directory: [] });
    renderPage();
    await screen.findByLabelText('Обрати 0001');
    fireEvent.click(screen.getByLabelText('Обрати 0001'));
    await openStickers();
    expect(screen.getByText('Ручних стікерів немає. Натисніть «Оновити», щоб перечитати довідник Хорошоп.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Налаштувати ручні стікери' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Переглянути зміни' })).toBeDisabled();
  });

  it('keeps the manual directory available while the sticker filter awaits a choice', async () => {
    renderPage();
    await screen.findByLabelText('Обрати 0001');
    fireEvent.click(screen.getByRole('button', { name: 'Стікери' }));
    fireEvent.click(screen.getByRole('option', { name: 'Має вибраний стікер' }));
    expect(screen.getByText('Оберіть стікер для фільтра.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вибрати всі 2 за фільтром' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Стікер для фільтра' }));
    fireEvent.click(screen.getByRole('option', { name: 'Акція' }));
    await waitFor(() => expect(api.horoshopStickers.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ stickerMode: 'present', stickerId: '11' }), expect.anything()));
  });

  it.each(['present', 'missing'] as const)('finishes loading products and stickers when the %s filter is opened before the catalog arrives', async (mode) => {
    let complete: ((value: StickerCatalog) => void) | undefined;
    let loadingSignal: AbortSignal | undefined;
    vi.mocked(api.horoshopStickers.catalog).mockImplementationOnce((_filters, signal) => {
      loadingSignal = signal;
      return new Promise((resolve) => { complete = resolve; });
    });
    renderPage();
    await waitFor(() => expect(api.horoshopStickers.catalog).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Стікери' }));
    fireEvent.click(screen.getByRole('option', { name: mode === 'present' ? 'Має вибраний стікер' : 'Не має вибраного стікера' }));
    expect(screen.getByText('Оберіть стікер для фільтра.')).toBeInTheDocument();
    await act(async () => complete?.(structuredClone(catalog)));
    expect(loadingSignal?.aborted).toBe(false);
    await screen.findByLabelText('Обрати 0001');
    expect(screen.getByRole('button', { name: 'Вибрати всі 2 за фільтром' })).toBeDisabled();
    expect(screen.getByLabelText('Обрати 0001')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Стікер для фільтра' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Акція' }));
    await waitFor(() => expect(api.horoshopStickers.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ stickerMode: mode, stickerId: '11' }), expect.anything()));
    await waitFor(() => expect(screen.getByLabelText('Обрати 0001')).toBeEnabled());
  });

  it('refreshes an empty directory while the sticker filter is waiting for a choice', async () => {
    vi.mocked(api.horoshopStickers.catalog).mockResolvedValueOnce({ ...structuredClone(catalog), directory: [], directoryWarning: 'Довідник тимчасово недоступний.' });
    renderPage();
    await screen.findByLabelText('Обрати 0001');
    fireEvent.click(screen.getByRole('button', { name: 'Стікери' }));
    fireEvent.click(screen.getByRole('option', { name: 'Має вибраний стікер' }));
    fireEvent.click(screen.getByRole('button', { name: 'Оновити' }));
    await waitFor(() => expect(api.horoshopStickers.refreshDirectory).toHaveBeenCalledOnce());
    await waitFor(() => expect(api.horoshopStickers.catalog).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Довідник тимчасово недоступний.')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Стікер для фільтра' }));
    expect(await screen.findByRole('option', { name: 'Акція' })).toBeInTheDocument();
    expect(screen.getByLabelText('Обрати 0001')).toBeDisabled();
    expect(api.horoshopStickers.action).not.toHaveBeenCalled();
  });

  it('keeps disabled manual icons available for removal and filtering only', async () => {
    const disabled = { externalId: '19', title: 'Вимкнений', enabled: false };
    vi.mocked(api.horoshopStickers.catalog).mockResolvedValue({ ...catalog, directory: [...catalog.directory, disabled] });
    vi.mocked(api.horoshopStickers.selectionSummary).mockResolvedValue({ total: 1, stickers: [{ ...disabled, productCount: 1 }] });
    renderPage();
    await screen.findByLabelText('Обрати 0001');
    fireEvent.click(screen.getByLabelText('Обрати 0001'));
    await openStickers();
    expect(screen.queryByLabelText('Додати стікери: Вимкнений')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Зняти стікери: Вимкнений')).toBeEnabled();
    fireEvent.click(screen.getByLabelText('Зняти стікери: Вимкнений'));
    fireEvent.click(screen.getByRole('tab', { name: 'Товари' }));
    fireEvent.click(screen.getByRole('button', { name: 'Стікери' }));
    fireEvent.click(screen.getByRole('option', { name: 'Має вибраний стікер' }));
    fireEvent.click(screen.getByRole('button', { name: 'Стікер для фільтра' }));
    expect(screen.getByRole('option', { name: 'Вимкнений' })).toBeInTheDocument();
  });

  it('shows brands and explicitly refreshes the Horoshop directory', async () => {
    renderPage();
    await screen.findByLabelText('Обрати 0001');
    fireEvent.click(screen.getByRole('button', { name: 'Бренд' }));
    fireEvent.click(screen.getByRole('option', { name: 'Apple' }));
    await waitFor(() => expect(api.horoshopStickers.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ brand: 'Apple' }), expect.anything()));
    fireEvent.click(screen.getByRole('button', { name: 'Оновити' }));
    await waitFor(() => expect(api.horoshopStickers.refreshDirectory).toHaveBeenCalledOnce());
  });

  it('offers only stickers present in the entire selection with counts and keeps actions across tabs', async () => {
    vi.mocked(api.horoshopStickers.selectionSummary).mockResolvedValue({ total: 2, stickers: catalog.directory.slice(0, 2).map((item) => ({ ...item, productCount: 1 })) });
    renderPage();
    await screen.findByLabelText('Обрати 0001');
    fireEvent.click(screen.getByRole('button', { name: 'Вибрати всі 2 за фільтром' }));
    await screen.findByText('Обрано: 2');
    await openStickers();
    expect(api.horoshopStickers.selectionSummary).toHaveBeenCalledWith(productIds, expect.anything());
    expect(screen.getByRole('tabpanel', { name: 'Стікери' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const remove = screen.getByRole('group', { name: 'Зняти стікери' });
    expect(within(remove).getAllByText('Є на 1 із 2 груп')).toHaveLength(2);
    expect(screen.queryByLabelText('Зняти стікери: Автоматичний')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Зняти стікери: Акція'));
    expect(screen.getByLabelText('Додати стікери: Акція')).toBeDisabled();
    fireEvent.click(screen.getByRole('tab', { name: 'Збережені вибірки' }));
    fireEvent.change(screen.getByLabelText('Назва вибірки'), { target: { value: 'Обрані товари' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти вибірку' }));
    await waitFor(() => expect(api.horoshopStickers.saveSelection).toHaveBeenCalledWith('Обрані товари', productIds));
    fireEvent.click(screen.getByRole('tab', { name: 'Історія' }));
    expect(screen.getByRole('heading', { name: 'Історія операцій' })).toBeInTheDocument();
    await openStickers();
    expect(screen.getByLabelText('Зняти стікери: Акція')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Переглянути зміни' }));
    await waitFor(() => expect(api.horoshopStickers.preview).toHaveBeenCalledWith(expect.objectContaining({ productIds, removeIds: ['11'] }), expect.any(Function)));
  });

  it('removes stale removal actions after the product selection changes and disables redundant additions', async () => {
    renderPage();
    await screen.findByLabelText('Обрати 0001');
    fireEvent.click(screen.getByLabelText('Обрати 0001'));
    await openStickers();
    expect(screen.getByLabelText('Додати стікери: Хіт')).toBeDisabled();
    expect(screen.getByText('Вже є на всіх товарах')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Зняти стікери: Хіт'));
    fireEvent.click(screen.getByRole('tab', { name: 'Товари' }));
    fireEvent.click(screen.getByRole('button', { name: 'Вибрати всі 2 за фільтром' }));
    await screen.findByText('Обрано: 2');
    fireEvent.click(screen.getByLabelText('Обрати 0001'));
    await openStickers();
    expect(screen.queryByLabelText('Зняти стікери: Хіт')).not.toBeInTheDocument();
    expect(screen.getByText('На вибраних товарах немає ручних стікерів для зняття.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Переглянути зміни' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Додати стікери: Акція'));
    fireEvent.click(screen.getByRole('button', { name: 'Переглянути зміни' }));
    await waitFor(() => expect(api.horoshopStickers.preview).toHaveBeenCalledWith(expect.objectContaining({ productIds: [productIds[1]], removeIds: [] }), expect.any(Function)));
  });

  it('shows an empty state before selection and supports keyboard navigation through the tabs', async () => {
    renderPage();
    await screen.findByLabelText('Обрати 0001');
    const products = screen.getByRole('tab', { name: 'Товари' });
    fireEvent.keyDown(products, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Стікери' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Спочатку оберіть товари' })).toBeInTheDocument();
    expect(api.horoshopStickers.selectionSummary).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Стікери' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Історія' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Історія' }), { key: 'Home' });
    expect(products).toHaveFocus();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('clears sticker actions when the last product is deselected in the table', async () => {
    renderPage();
    await screen.findByLabelText('Обрати 0001');
    fireEvent.click(screen.getByLabelText('Обрати 0001'));
    await openStickers();
    fireEvent.click(screen.getByLabelText('Додати стікери: Акція'));
    fireEvent.click(screen.getByLabelText('Зняти стікери: Хіт'));
    fireEvent.click(screen.getByRole('tab', { name: 'Товари' }));
    fireEvent.click(screen.getByLabelText('Обрати 0001'));
    fireEvent.click(screen.getByLabelText('Обрати 0001'));
    await openStickers();
    expect(screen.getByLabelText('Додати стікери: Акція')).not.toBeChecked();
    expect(screen.getByLabelText('Зняти стікери: Хіт')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Переглянути зміни' })).toBeDisabled();
  });

  it('loads a saved selection into the sticker tab and clears previously configured actions', async () => {
    vi.mocked(api.horoshopStickers.selections).mockResolvedValue([{ id: 'saved', name: 'Навушники', productIds: [productIds[1]] }]);
    renderPage();
    await screen.findByLabelText('Обрати 0001');
    fireEvent.click(screen.getByLabelText('Обрати 0001'));
    await openStickers();
    fireEvent.click(screen.getByLabelText('Додати стікери: Акція'));
    fireEvent.click(screen.getByLabelText('Зняти стікери: Хіт'));
    fireEvent.click(screen.getByRole('tab', { name: 'Збережені вибірки' }));
    fireEvent.click(screen.getByRole('button', { name: 'Збережені вибірки' }));
    fireEvent.click(screen.getByRole('option', { name: 'Навушники · 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Завантажити вибірку' }));
    await waitFor(() => expect(api.horoshopStickers.selectionSummary).toHaveBeenLastCalledWith([productIds[1]], expect.anything()));
    expect(screen.getByRole('tab', { name: 'Стікери' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Назва операції')).toHaveValue('Навушники');
    expect(screen.getByLabelText('Додати стікери: Акція')).not.toBeChecked();
    expect(screen.queryByLabelText('Зняти стікери: Хіт')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Переглянути зміни' })).toBeDisabled();
  });

  it('blocks editing when selection data cannot be loaded instead of offering the full directory', async () => {
    vi.mocked(api.horoshopStickers.selectionSummary).mockRejectedValue(new Error('Вибірка змінилася.'));
    renderPage();
    await screen.findByLabelText('Обрати 0001');
    fireEvent.click(screen.getByLabelText('Обрати 0001'));
    await openStickers();
    expect(screen.getByRole('alert')).toHaveTextContent('Вибірка змінилася.');
    expect(screen.getByLabelText('Додати стікери: Акція')).toBeDisabled();
    expect(screen.queryByLabelText('Зняти стікери: Хіт')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Переглянути зміни' })).toBeDisabled();
  });
});
