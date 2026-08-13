import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import type { HoroshopCatalogFeed } from '../types/horoshop-catalog';
import { HoroshopRelatedProductsPage } from './HoroshopRelatedProductsPage';

const feed: HoroshopCatalogFeed = {
  integration: {
    configured: true,
    status: 'connected',
    storeDomain: 'test-shop.example',
    pollingIntervalMinutes: 15,
    lastSyncAt: '2026-08-13T09:00:00.000Z',
    lastError: null,
    counts: { categories: 1, products: 1, modifications: 2 },
    latestRun: null
  },
  items: [{
    id: 'product-1',
    externalId: 'redmi-buds-6',
    parentExternalId: null,
    sku: '34208',
    titles: { uk: 'Xiaomi Redmi Buds 6 Active' },
    brand: 'Xiaomi',
    categoryExternalId: 'earphones',
    price: '1099',
    oldPrice: null,
    currency: 'UAH',
    availability: 'В наявності',
    visible: true,
    active: true,
    primaryImageUrl: 'https://cdn.example/black.jpg',
    canonicalUrl: 'https://test-shop.example/redmi-buds-6',
    popularity: null,
    updatedAt: '2026-08-13T09:00:00.000Z',
    modifications: [{
      id: 'modification-black', externalId: 'black', sku: '34208-B',
      titles: { uk: 'Xiaomi Redmi Buds 6 Active Black' }, price: '1299', oldPrice: null,
      currency: 'UAH', availability: 'В наявності', visible: true, active: true,
      imageUrl: 'https://cdn.example/black.jpg', pageUrl: null, attributes: {},
      updatedAt: '2026-08-13T09:00:00.000Z'
    }, {
      id: 'modification-pink', externalId: 'pink', sku: '34209-P',
      titles: { uk: 'Xiaomi Redmi Buds 6 Active Pink' }, price: '1099', oldPrice: null,
      currency: 'UAH', availability: 'Немає в наявності', visible: false, active: true,
      imageUrl: 'https://cdn.example/pink.jpg', pageUrl: null, attributes: {},
      updatedAt: '2026-08-13T09:00:00.000Z'
    }]
  }],
  categories: [{
    externalId: 'earphones', parentExternalId: null, titles: { uk: 'Навушники' }, productCount: 1
  }],
  availabilityOptions: ['В наявності', 'Немає в наявності'],
  total: 1,
  page: 1,
  pageSize: 25,
  pageCount: 1
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><HoroshopRelatedProductsPage /></MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('HoroshopRelatedProductsPage', () => {
  it('renders modifications as expandable child nodes in a product tree', async () => {
    vi.spyOn(api.horoshopCatalog, 'list').mockResolvedValue(feed);

    const view = renderPage();

    expect(await screen.findByText('Xiaomi Redmi Buds 6 Active')).toBeInTheDocument();
    expect(screen.getByRole('tree', { name: 'Каталог товарів з модифікаціями' })).toBeInTheDocument();
    expect(screen.queryByText('Xiaomi Redmi Buds 6 Active Pink')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Розгорнути модифікації Xiaomi Redmi Buds 6 Active' }));

    expect(await screen.findByText('Xiaomi Redmi Buds 6 Active Pink')).toBeInTheDocument();
    expect(screen.getByText('34209-P')).toBeInTheDocument();
    expect(view.container.querySelector('.horoshop-tree-branches[role="group"]')).toBeInTheDocument();
    expect(view.container.querySelectorAll('.horoshop-product-row--modification')).toHaveLength(2);
  });
});
