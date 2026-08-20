import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import { ToastProvider } from '../toast/ToastContext';
import type { HoroshopCatalogFeed } from '../types/horoshop-catalog';
import type { HoroshopPhotoSelection, HoroshopPhotoSelectionSummary } from '../types/horoshop-photo';
import { HoroshopPhotoParserPage } from './HoroshopPhotoParserPage';

const summary: HoroshopPhotoSelectionSummary = {
  id: 'selection-1',
  name: 'Нові смартфони',
  matchedCount: 2,
  ambiguousCount: 0,
  unmatchedCount: 1,
  createdAt: '2026-08-20T08:00:00.000Z',
  updatedAt: '2026-08-20T08:00:00.000Z'
};

const selection: HoroshopPhotoSelection = {
  id: summary.id,
  name: summary.name,
  inputLines: ['PHONE-1', 'PHONE-1-BLACK', 'UNKNOWN'],
  resolution: { ambiguous: [], unmatched: ['UNKNOWN'] },
  products: [{
    itemIds: ['item-1', 'item-2'],
    inputs: ['PHONE-1', 'PHONE-1-BLACK'],
    includeAllModifications: true,
    id: 'product-1',
    sku: 'PHONE-1',
    title: 'Смартфон Example One',
    imageUrl: 'https://cdn.example/phone.webp',
    canonicalUrl: 'https://photo-shop.example/phone-one/',
    commonDraft: {
      id: null,
      productId: 'product-1',
      modificationId: null,
      targetType: 'gallery_common',
      sourceUrl: '',
      parseStatus: 'idle',
      publishStatus: 'draft',
      foundCount: 0,
      errorMessage: '',
      errors: [],
      publishedAt: null,
      currentImages: ['https://cdn.example/current.webp'],
      assets: []
    },
    modifications: [{
      id: 'modification-black',
      sku: 'PHONE-1-BLACK',
      title: 'Example One Black',
      imageUrl: 'https://cdn.example/black.webp',
      draft: {
        id: 'draft-black',
        productId: 'product-1',
        modificationId: 'modification-black',
        targetType: 'images',
        sourceUrl: 'https://supplier.example/phone-one-black',
        parseStatus: 'ready',
        publishStatus: 'draft',
        foundCount: 1,
        errorMessage: '',
        errors: [],
        publishedAt: null,
        currentImages: [],
        assets: [{
          id: 'asset-1',
          mediaAssetId: 'media-1',
          sourceUrl: 'https://supplier.example/black.jpg',
          url: '/media/catalog/library/black.webp',
          width: 1200,
          height: 1200,
          size: 100_000,
          selected: true,
          sortOrder: 0
        }]
      }
    }]
  }],
  createdAt: summary.createdAt,
  updatedAt: summary.updatedAt
};

const filterFeed: HoroshopCatalogFeed = {
  integration: {
    configured: true,
    status: 'connected',
    storeDomain: 'photo-shop.example',
    pollingIntervalMinutes: 15,
    lastSyncAt: '2026-08-20T08:00:00.000Z',
    lastError: null,
    counts: { categories: 1, products: 7, modifications: 12 },
    latestRun: null
  },
  items: [],
  categories: [{
    externalId: 'phones', parentExternalId: null, titles: { uk: 'Смартфони' }, productCount: 7
  }],
  availabilityOptions: ['В наявності', 'Немає в наявності'],
  total: 7,
  page: 1,
  pageSize: 10,
  pageCount: 1
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmDialogProvider>
          <MemoryRouter><HoroshopPhotoParserPage /></MemoryRouter>
        </ConfirmDialogProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('HoroshopPhotoParserPage', () => {
  it('renders selected products and modifications as separate photo targets', async () => {
    vi.spyOn(api.horoshopPhotos, 'selections').mockResolvedValue([summary]);
    vi.spyOn(api.horoshopPhotos, 'selection').mockResolvedValue(selection);
    vi.spyOn(api.horoshopPhotos, 'activeBatch').mockResolvedValue(null);

    renderPage();

    expect(await screen.findByText('Смартфон Example One')).toBeInTheDocument();
    expect(screen.getByText('Спільна галерея всіх модифікацій')).toBeInTheDocument();
    expect(screen.getByText('Example One Black')).toBeInTheDocument();
    expect(screen.getByText('Не знайдено')).toBeInTheDocument();
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Передати в Хорошоп' })).toBeInTheDocument();
  });

  it('creates an exact selection from newline-separated names and articles', async () => {
    vi.spyOn(api.horoshopPhotos, 'selections').mockResolvedValue([]);
    vi.spyOn(api.horoshopPhotos, 'activeBatch').mockResolvedValue(null);
    const createSelection = vi.spyOn(api.horoshopPhotos, 'createSelection').mockResolvedValue(selection);

    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Наприклад, Нові iPhone'), {
      target: { value: 'Точкова вибірка' }
    });
    fireEvent.change(screen.getByPlaceholderText(/IPHONE-15-128-BLK/u), {
      target: { value: 'PHONE-1\n\nСмартфон Example One\nPHONE-1-BLACK' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Створити вибірку' }));

    await waitFor(() => expect(createSelection.mock.calls[0]?.[0]).toEqual({
      name: 'Точкова вибірка',
      entries: ['PHONE-1', 'Смартфон Example One', 'PHONE-1-BLACK']
    }));
    expect(await screen.findByText('Смартфон Example One')).toBeInTheDocument();
  });

  it('also creates a selection from catalog filters', async () => {
    vi.spyOn(api.horoshopPhotos, 'selections').mockResolvedValue([]);
    vi.spyOn(api.horoshopPhotos, 'activeBatch').mockResolvedValue(null);
    vi.spyOn(api.horoshopCatalog, 'list').mockResolvedValue(filterFeed);
    const createFiltered = vi.spyOn(api.horoshopPhotos, 'createFilteredSelection').mockResolvedValue(selection);

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Фільтри каталогу' }));
    fireEvent.change(await screen.findByLabelText('Пошук у каталозі'), { target: { value: 'iPhone' } });
    await screen.findByRole('option', { name: 'Смартфони · 7' });
    fireEvent.change(screen.getByLabelText('Розділ'), { target: { value: 'phones' } });
    await screen.findByRole('option', { name: 'В наявності' });
    fireEvent.change(screen.getByLabelText('Наявність'), { target: { value: 'В наявності' } });
    fireEvent.change(screen.getByLabelText('Видимість'), { target: { value: 'hidden' } });
    fireEvent.click(screen.getByRole('button', { name: 'Створити вибірку' }));

    await waitFor(() => expect(createFiltered.mock.calls[0]?.[0]).toEqual({
      name: '',
      filters: {
        search: 'iPhone',
        category: 'phones',
        availability: 'В наявності',
        visibility: 'hidden'
      }
    }));
  });
});
