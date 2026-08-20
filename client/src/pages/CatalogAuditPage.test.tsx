import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import type { CatalogAuditHistoryFeed, CatalogImportHistoryDetail, CatalogImportSummary } from '../types/catalog';
import { CatalogAuditPage } from './CatalogAuditPage';

const importSummary: CatalogImportSummary = {
  total: 2,
  create: 1,
  update: 1,
  conflict: 0,
  error: 0,
  skipped: 0,
  pending: 0
};

function renderPage(initialEntry = '/catalog/audit') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes><Route path="/catalog/audit" element={<CatalogAuditPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('CatalogAuditPage', () => {
  it('opens a grouped XLSX import and loads its row details', async () => {
    const feed: CatalogAuditHistoryFeed = {
      items: [{
        id: 'import-1',
        kind: 'import',
        source: 'xlsx',
        category: 'import',
        action: 'import_commit',
        actor: { id: 'user-1', name: 'Дмитро' },
        product: null,
        changes: {},
        summary: importSummary,
        options: { importNew: true, updateExisting: true },
        importId: '11111111-1111-4111-8111-111111111111',
        createdAt: '2026-07-22T12:00:00.000Z'
      }],
      actors: [{ id: 'user-1', name: 'Дмитро' }],
      total: 1,
      page: 1,
      pageSize: 25,
      pageCount: 1
    };
    const detail: CatalogImportHistoryDetail = {
      id: '11111111-1111-4111-8111-111111111111',
      createdBy: { id: 'user-1', name: 'Дмитро' },
      options: { importNew: true, updateExisting: true },
      summary: importSummary,
      createdAt: '2026-07-22T12:00:00.000Z',
      rows: [{
        id: 'row-1',
        rowNumber: 2,
        action: 'create',
        result: 'created',
        reason: '',
        productId: '22222222-2222-4222-8222-222222222222',
        productCode: 'SM-000123',
        name: 'iPhone 13 128GB',
        condition: 'USED',
        conditionLabel: 'Вживаний',
        stockCount: 2,
        incomingCount: 0,
        priceUah: 18999,
        identityKey: 'code:sm-000123',
        brandId: null,
        templateId: null,
        payload: {},
        createdAt: '2026-07-22T12:00:00.000Z'
      }],
      total: 1,
      page: 1,
      pageSize: 50,
      pageCount: 1
    };
    const historySpy = vi.spyOn(api.catalog, 'auditHistory').mockResolvedValue(feed);
    const detailSpy = vi.spyOn(api.catalog, 'importHistoryDetail').mockResolvedValue(detail);
    const user = userEvent.setup();
    renderPage('/catalog/audit?source=xlsx');

    expect(await screen.findByRole('heading', { name: 'Імпортовано XLSX' })).toBeInTheDocument();
    expect(screen.getByLabelText('Джерело')).toHaveTextContent('XLSX');
    expect(historySpy).toHaveBeenCalledWith(expect.objectContaining({ source: 'xlsx' }));
    await user.click(screen.getByRole('button', { name: /Деталі/ }));
    expect(await screen.findByText('iPhone 13 128GB')).toBeInTheDocument();
    expect(screen.getByText('SM-000123')).toBeInTheDocument();
    expect(detailSpy).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', { page: 1, pageSize: 50 });
  });

  it('shows exact before and after values for a manual change', async () => {
    vi.spyOn(api.catalog, 'auditHistory').mockResolvedValue({
      items: [{
        id: 'audit-1',
        kind: 'audit',
        source: 'manual',
        category: 'products',
        action: 'update',
        actor: { id: 'user-1', name: 'Дмитро' },
        product: { id: '22222222-2222-4222-8222-222222222222', productCode: 'SM-000123', name: 'iPhone 13' },
        changes: { fields: ['priceUah'], before: { priceUah: 18000 }, after: { priceUah: 18999 } },
        summary: null,
        options: null,
        importId: null,
        createdAt: '2026-07-22T12:00:00.000Z'
      }],
      actors: [{ id: 'user-1', name: 'Дмитро' }],
      total: 1,
      page: 1,
      pageSize: 25,
      pageCount: 1
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Товар оновлено' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Деталі/ }));
    expect(screen.getByText('Ціна')).toBeInTheDocument();
    expect(screen.getByText('18 000 ₴')).toBeInTheDocument();
    expect(screen.getByText('18 999 ₴')).toBeInTheDocument();
  });

  it('shows readable characteristics and opens changed photos in a gallery', async () => {
    vi.spyOn(api.catalog, 'auditHistory').mockResolvedValue({
      items: [{
        id: 'audit-media-1',
        kind: 'audit',
        source: 'manual',
        category: 'media',
        action: 'media_update',
        actor: { id: 'user-1', name: 'Дмитро' },
        product: { id: '22222222-2222-4222-8222-222222222222', productCode: 'SM-000123', name: 'iPhone 13' },
        changes: {
          fields: ['characteristicValues', 'mainImageUrl', 'gallery'],
          before: {
            characteristicValues: { Колір: { hex: '#111111', name: 'Чорний' }, Памʼять: '128 ГБ' },
            mainImageUrl: '/media/catalog/old-main.webp',
            gallery: [{ url: '/media/catalog/old-main.webp', alt: 'iPhone 13' }]
          },
          after: {
            characteristicValues: { Колір: { hex: '#ffffff', name: 'Білий' }, Памʼять: '256 ГБ' },
            mainImageUrl: '/media/catalog/new-main.webp',
            gallery: [
              { url: '/media/catalog/new-main.webp', alt: 'iPhone 13' },
              { url: '/media/catalog/new-side.webp', alt: 'iPhone 13 збоку' }
            ]
          }
        },
        summary: null,
        options: null,
        importId: null,
        createdAt: '2026-07-24T12:00:00.000Z'
      }],
      actors: [{ id: 'user-1', name: 'Дмитро' }],
      total: 1,
      page: 1,
      pageSize: 25,
      pageCount: 1
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Оновлено фотографії' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Деталі/ }));

    expect(screen.getAllByText('Колір')).toHaveLength(2);
    expect(screen.getByText('Чорний')).toBeInTheDocument();
    expect(screen.getByText('Білий')).toBeInTheDocument();
    expect(screen.queryByText(/"hex"/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Відкрити фото 1 з 2' }));
    expect(screen.getByRole('dialog', { name: 'Перегляд фото' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'iPhone 13' })).toHaveAttribute('src', '/media/catalog/new-main.webp');
    await user.click(screen.getByRole('button', { name: 'Наступне фото' }));
    expect(screen.getByRole('img', { name: 'iPhone 13 збоку' })).toHaveAttribute('src', '/media/catalog/new-side.webp');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Перегляд фото' })).not.toBeInTheDocument();
  });
});
