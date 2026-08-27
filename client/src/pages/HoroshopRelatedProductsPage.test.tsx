import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import type { HoroshopCatalogFeed } from '../types/horoshop-catalog';
import type { HoroshopAccessoryBulkPublishResult, HoroshopAccessoryDetail } from '../types/horoshop-accessory';
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
    horoshopCreatedAt: '2026-08-13T09:00:00.000Z',
    hasPhotos: true,
    updatedAt: '2026-08-13T09:00:00.000Z',
    modifications: [{
      id: 'modification-black', externalId: 'black', sku: '34208-B',
      titles: { uk: 'Xiaomi Redmi Buds 6 Active Black' }, price: '1299', oldPrice: null,
      currency: 'UAH', availability: 'В наявності', visible: true, active: true,
      imageUrl: 'https://cdn.example/black.jpg', pageUrl: null, attributes: {},
      horoshopCreatedAt: '2026-08-13T09:00:00.000Z', hasPhotos: true,
      updatedAt: '2026-08-13T09:00:00.000Z'
    }, {
      id: 'modification-pink', externalId: 'pink', sku: '34209-P',
      titles: { uk: 'Xiaomi Redmi Buds 6 Active Pink' }, price: '1099', oldPrice: null,
      currency: 'UAH', availability: 'Немає в наявності', visible: false, active: true,
      imageUrl: 'https://cdn.example/pink.jpg', pageUrl: null, attributes: {},
      horoshopCreatedAt: '2026-08-13T09:00:00.000Z', hasPhotos: true,
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

const accessoryDetail: HoroshopAccessoryDetail = {
  product: {
    id: 'product-1', sku: '34208', titles: { uk: 'Xiaomi Redmi Buds 6 Active' },
    brand: 'Xiaomi', categoryExternalId: 'earphones', price: '1099', currency: 'UAH',
    availability: 'В наявності', visible: true, active: true,
    primaryImageUrl: 'https://cdn.example/black.jpg', canonicalUrl: null
  },
  draft: {
    catalogStateKnown: true, initializedAt: '2026-08-13T09:00:00.000Z', publishedAt: null,
    isDirty: false, selected: [], suggestions: [{
      id: 'suggestion-1', key: 'product:case-1', source: 'codex', selected: false,
      published: false, position: 101,
      scores: { compatibility: 0.93, utility: 0.88, availability: 1, popularity: 0.72, total: 0.9 },
      reason: 'Модель явно збігається; аксесуар є в наявності.',
      target: {
        type: 'product', id: 'case-1', sku: 'CASE-BUDS-6',
        titles: { uk: 'Чохол для Redmi Buds 6 Active' }, brand: 'Example', price: '399',
        currency: 'UAH', availability: 'В наявності', visible: true, active: true, imageUrl: null
      }
    }]
  },
  latestPublication: null
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

beforeEach(() => {
  vi.spyOn(api.horoshopAccessories, 'publicationSummary').mockResolvedValue({
    pendingProducts: 0,
    productAccessories: 0,
    categoryAccessories: 0
  });
});

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

  it('supports a reviewed draft and requires overwrite confirmation before publishing', async () => {
    vi.spyOn(api.horoshopCatalog, 'list').mockResolvedValue(feed);
    vi.spyOn(api.horoshopAccessories, 'detail').mockResolvedValue(accessoryDetail);
    const savedDetail: HoroshopAccessoryDetail = {
      ...accessoryDetail,
      draft: {
        ...accessoryDetail.draft,
        isDirty: true,
        selected: [{ ...accessoryDetail.draft.suggestions[0], selected: true }],
        suggestions: []
      }
    };
    const save = vi.spyOn(api.horoshopAccessories, 'saveDraft').mockResolvedValue(savedDetail);
    const publish = vi.spyOn(api.horoshopAccessories, 'publish').mockResolvedValue({
      ...savedDetail,
      draft: { ...savedDetail.draft, isDirty: false },
      latestPublication: {
        id: 'publication-1', status: 'succeeded', productAccessoryCount: 1,
        categoryAccessoryCount: 0, errorMessage: null,
        startedAt: '2026-08-13T10:00:00.000Z', completedAt: '2026-08-13T10:00:01.000Z'
      }
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Керування аксесуарами' }));

    expect(await screen.findByText('Чохол для Redmi Buds 6 Active')).toBeInTheDocument();
    expect(screen.getByText('Модель явно збігається; аксесуар є в наявності.')).toBeInTheDocument();
    expect(screen.getByText('Сумісність')).toBeInTheDocument();
    expect(screen.getByText('Оцінка Codex')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Передати в Хорошоп' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Додати' }));
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти чернетку' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('product-1', [{ type: 'product', id: 'case-1' }]));

    fireEvent.click(screen.getByRole('checkbox', {
      name: /цей список перезапише поточні аксесуари товару/i
    }));
    const publishButton = screen.getByRole('button', { name: 'Передати в Хорошоп' });
    expect(publishButton).toBeEnabled();
    fireEvent.click(publishButton);
    await waitFor(() => expect(publish).toHaveBeenCalledWith('product-1'));
  });

  it('imports a Codex review without publishing and shows the summary', async () => {
    vi.spyOn(api.horoshopCatalog, 'list').mockResolvedValue(feed);
    vi.spyOn(api.horoshopAccessories, 'detail').mockResolvedValue(accessoryDetail);
    const importReview = vi.spyOn(api.horoshopAccessories, 'importReview').mockResolvedValue({
      reviewedProducts: 1586,
      productsWithRecommendations: 940,
      productsWithoutRecommendations: 646,
      recommendationsSaved: 4210
    });
    const publish = vi.spyOn(api.horoshopAccessories, 'publish');
    const reviewDocument = {
      format: 'horoshop-codex-accessory-review/v1' as const,
      connectionGeneration: '5fd15cbb-8ef3-457f-83be-e8e1f1688d39',
      catalogRevision: '0'.repeat(64),
      products: [{ productId: 'product-1', recommendations: [] }]
    };
    const file = new File([JSON.stringify(reviewDocument)], 'codex-review.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(JSON.stringify(reviewDocument)) });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Керування аксесуарами' }));
    fireEvent.change(await screen.findByLabelText('Імпортувати пропозиції Codex'), {
      target: { files: [file] }
    });

    await waitFor(() => expect(importReview).toHaveBeenCalledWith(reviewDocument));
    expect(await screen.findByText('4210')).toBeInTheDocument();
    expect(screen.getByText('646')).toBeInTheDocument();
    expect(publish).not.toHaveBeenCalled();
  });

  it('adds Codex proposals to the current draft or every draft without publishing', async () => {
    vi.spyOn(api.horoshopCatalog, 'list').mockResolvedValue(feed);
    vi.spyOn(api.horoshopAccessories, 'detail').mockResolvedValue(accessoryDetail);
    const acceptedDetail: HoroshopAccessoryDetail = {
      ...accessoryDetail,
      draft: {
        ...accessoryDetail.draft,
        isDirty: true,
        selected: [{ ...accessoryDetail.draft.suggestions[0], selected: true }],
        suggestions: []
      }
    };
    const acceptCurrent = vi.spyOn(api.horoshopAccessories, 'acceptReviewProposals').mockResolvedValue({
      productsUpdated: 1,
      recommendationsAdded: 1,
      recommendationsSkipped: 0,
      detail: acceptedDetail
    });
    const acceptAll = vi.spyOn(api.horoshopAccessories, 'acceptAllReviewProposals').mockResolvedValue({
      productsUpdated: 12,
      recommendationsAdded: 34,
      recommendationsSkipped: 0,
      detail: null
    });
    const publish = vi.spyOn(api.horoshopAccessories, 'publish');

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Керування аксесуарами' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Додати всі для цього товару' }));
    await waitFor(() => expect(acceptCurrent).toHaveBeenCalledWith('product-1'));
    expect(await screen.findByText('До поточної чернетки додано 1 пропозицію Codex. У Хорошоп нічого не передано.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Додати всі пропозиції для всіх товарів' }));
    await waitFor(() => expect(acceptAll).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Оновлено чернеток: 12. Додано 34 пропозиції Codex. У Хорошоп нічого не передано.')).toBeInTheDocument();
    expect(publish).not.toHaveBeenCalled();
  });

  it('publishes every saved dirty draft only after explicit bulk confirmation', async () => {
    vi.spyOn(api.horoshopCatalog, 'list').mockResolvedValue(feed);
    vi.spyOn(api.horoshopAccessories, 'detail').mockResolvedValue(accessoryDetail);
    vi.mocked(api.horoshopAccessories.publicationSummary).mockResolvedValue({
      pendingProducts: 12,
      productAccessories: 34,
      categoryAccessories: 2
    });
    let finishPublish: (value: HoroshopAccessoryBulkPublishResult) => void = () => {};
    const publication = new Promise<HoroshopAccessoryBulkPublishResult>((resolve) => {
      finishPublish = resolve;
    });
    const publishAll = vi.spyOn(api.horoshopAccessories, 'publishAll').mockImplementation(async (onProgress) => {
      onProgress({
        stage: 'publishing',
        totalProducts: 12,
        processedProducts: 6,
        productAccessories: 17,
        categoryAccessories: 1,
        currentBatch: 2,
        totalBatches: 4,
        percentage: 50
      });
      return publication;
    });
    const publish = vi.spyOn(api.horoshopAccessories, 'publish');

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Керування аксесуарами' }));

    expect(await screen.findByText('Готово до публікації: 12 товарів, 34 супутніх товарів і 2 розділів.')).toBeInTheDocument();
    const publishAllButton = screen.getByRole('button', {
      name: 'Передати всі застосовані рекомендації в Хорошоп'
    });
    expect(publishAllButton).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', {
      name: /масова публікація перезапише поле «Аксесуари»/i
    }));
    expect(publishAllButton).toBeEnabled();
    fireEvent.click(publishAllButton);

    await waitFor(() => expect(publishAll).toHaveBeenCalledWith(expect.any(Function)));
    const progress = await screen.findByRole('progressbar', { name: 'Прогрес масової публікації в Хорошоп' });
    expect(progress).toHaveAttribute('aria-valuenow', '6');
    expect(screen.getByText('Опубліковано 6 із 12 товарів')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();

    await act(async () => finishPublish({
      publishedProducts: 12,
      productAccessories: 34,
      categoryAccessories: 2
    }));
    expect(await screen.findByText('Масову публікацію завершено: у Хорошоп передано 12 товарів, 34 супутніх товарів і 2 розділів.')).toBeInTheDocument();
    expect(screen.getByText('Опубліковано товарів')).toBeInTheDocument();
    expect(publish).not.toHaveBeenCalled();
  });
});
