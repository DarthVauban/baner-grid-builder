import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import { ToastProvider } from '../toast/ToastContext';
import type { ApplicationForm } from '../types/application';
import type { HoroshopCatalogFeed } from '../types/horoshop-catalog';
import { ApplicationFormPlacementEditor } from './ApplicationFormPlacementEditor';

const timestamp = '2026-09-14T09:00:00.000Z';

const form: ApplicationForm = {
  id: 'form-1',
  publicId: 'preorder-form',
  formType: 'simple',
  name: 'Передзамовлення',
  title: 'Передзамовлення',
  description: '',
  buttonText: 'Надіслати',
  successMessage: 'Дякуємо',
  status: 'published',
  settings: {},
  styles: {},
  workflow: null,
  fields: [],
  archivedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp
};

const catalog: HoroshopCatalogFeed = {
  integration: {
    configured: true,
    status: 'connected',
    storeDomain: 'shop.example',
    pollingIntervalMinutes: 15,
    lastSyncAt: timestamp,
    lastError: null,
    counts: { categories: 1, stickers: 0, products: 2, modifications: 1 },
    latestRun: null
  },
  items: [{
    id: 'product-with-modifications',
    externalId: 'phone',
    parentExternalId: null,
    sku: 'PHONE',
    titles: { uk: 'Смартфон із модифікаціями' },
    brand: 'Example',
    categoryExternalId: 'phones',
    price: '20000',
    oldPrice: null,
    currency: 'UAH',
    availability: 'В наявності',
    visible: true,
    active: true,
    primaryImageUrl: null,
    canonicalUrl: null,
    popularity: null,
    horoshopCreatedAt: timestamp,
    hasPhotos: false,
    updatedAt: timestamp,
    modifications: [{
      id: 'modification-black',
      externalId: 'phone-black',
      sku: 'PHONE-BLACK',
      titles: { uk: 'Смартфон Black' },
      price: '21000',
      oldPrice: null,
      currency: 'UAH',
      availability: 'Немає в наявності',
      visible: true,
      active: true,
      imageUrl: null,
      pageUrl: null,
      attributes: {},
      horoshopCreatedAt: timestamp,
      hasPhotos: false,
      updatedAt: timestamp
    }]
  }, {
    id: 'product-without-modifications',
    externalId: 'cable',
    parentExternalId: null,
    sku: 'CABLE',
    titles: { uk: 'Кабель без модифікацій' },
    brand: null,
    categoryExternalId: 'accessories',
    price: '499',
    oldPrice: null,
    currency: 'UAH',
    availability: 'В наявності',
    visible: true,
    active: true,
    primaryImageUrl: null,
    canonicalUrl: null,
    popularity: null,
    horoshopCreatedAt: timestamp,
    hasPhotos: false,
    updatedAt: timestamp,
    modifications: []
  }],
  categories: [],
  availabilityOptions: [],
  total: 2,
  page: 1,
  pageSize: 20,
  pageCount: 1
};

function renderEditor() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmDialogProvider>
          <ApplicationFormPlacementEditor form={form} />
        </ConfirmDialogProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.spyOn(api.formCampaigns, 'list').mockResolvedValue([]);
  vi.spyOn(api.formCampaigns, 'catalog').mockResolvedValue(catalog);
  vi.spyOn(api.formCampaigns, 'embedCode').mockResolvedValue({ code: '<script></script>' });
});

afterEach(() => vi.restoreAllMocks());

describe('ApplicationFormPlacementEditor product tree', () => {
  it('keeps modifications collapsed and omits accordion controls for products without modifications', async () => {
    const view = renderEditor();

    const tree = screen.getByRole('tree', { name: 'Товари з модифікаціями' });
    expect(screen.queryByText('Смартфон Black')).not.toBeInTheDocument();

    const expandableProduct = (await screen.findByText('Смартфон із модифікаціями')).closest('article');
    const standaloneProduct = screen.getByText('Кабель без модифікацій').closest('article');
    expect(expandableProduct).not.toBeNull();
    expect(standaloneProduct).not.toBeNull();
    expect(within(expandableProduct as HTMLElement).getByRole('button', { name: 'Модифікації 1' })).toBeInTheDocument();
    expect(standaloneProduct?.querySelector('.form-placement-product-toggle')).not.toBeInTheDocument();
    expect(standaloneProduct?.querySelector('.form-placement-modifications-button')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Розгорнути модифікації Смартфон із модифікаціями' }));

    expect(await screen.findByText('Смартфон Black')).toBeInTheDocument();
    expect(within(tree).getByRole('group')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Обрати модифікацію Смартфон Black' })).not.toBeChecked();

    const top = view.container.querySelector<HTMLElement>('.form-placement-editor__top');
    const libraryPanel = view.container.querySelector<HTMLElement>('.form-placement-editor__library');
    const catalogPanel = view.container.querySelector<HTMLElement>('.form-placement-editor__catalog');
    expect(top).not.toBeNull();
    expect(top).toContainElement(libraryPanel);
    expect(top).not.toContainElement(catalogPanel);
  });
});
