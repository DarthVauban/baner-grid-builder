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
    expect(screen.getByLabelText('Джерело')).toHaveValue('xlsx');
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
});
