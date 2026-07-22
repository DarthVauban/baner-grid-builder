import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { defaultProductCardTheme, defaultProductPageTheme, defaultStorefrontTheme } from '../lib/storefront-theme';
import appStyles from '../styles/app.css?raw';
import { CatalogProductCardSettingsPage } from './CatalogProductCardSettingsPage';

vi.mock('../toast/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() })
}));

afterEach(() => vi.restoreAllMocks());

function renderPage() {
  vi.spyOn(api.catalog, 'storefrontSettings').mockResolvedValue({
    selectedFormPublicId: null,
    publicOrigin: 'https://shop.mt-panel.test',
    storefrontTheme: structuredClone(defaultStorefrontTheme),
    productCardTheme: structuredClone(defaultProductCardTheme),
    productPageTheme: structuredClone(defaultProductPageTheme),
    updatedAt: '2026-07-22T12:00:00.000Z'
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><CatalogProductCardSettingsPage /></MemoryRouter>
    </QueryClientProvider>
  );
}

function createDataTransfer() {
  const values = new Map<string, string>();
  return {
    effectAllowed: 'none',
    dropEffect: 'none',
    setData: vi.fn((type: string, value: string) => values.set(type, value)),
    getData: vi.fn((type: string) => values.get(type) || '')
  };
}

describe('CatalogProductCardSettingsPage', () => {
  it('reorders card content by drag and drop and shows the insertion marker', async () => {
    const { container } = renderPage();
    const photoHandle = await screen.findByLabelText('Перетягнути Фото');
    const titleHandle = screen.getByLabelText('Перетягнути Назва товару');
    const photoItem = photoHandle.closest('.catalog-theme-order__item');
    const titleItem = titleHandle.closest('.catalog-theme-order__item');
    const dataTransfer = createDataTransfer();

    expect(photoItem).not.toBeNull();
    expect(titleItem).not.toBeNull();
    fireEvent.dragStart(photoHandle, { dataTransfer });
    expect(photoItem).toHaveClass('catalog-theme-order__item--dragging');

    fireEvent.dragOver(titleItem as Element, { dataTransfer });
    expect(titleItem).toHaveClass('catalog-theme-order__item--drop-after');

    fireEvent.drop(titleItem as Element, { dataTransfer });
    const labels = [...container.querySelectorAll('.catalog-theme-order__item strong')].map((element) => element.textContent);
    expect(labels).toEqual(['Бейдж стану', 'Бренд', 'Назва товару', 'Фото', 'Код і наявність']);
    expect(container.querySelector('.catalog-theme-order__item--drop-after')).not.toBeInTheDocument();
    expect(appStyles).toMatch(/\.catalog-theme-order__item--drop-before::before,[\s\S]*\.catalog-theme-order__item--drop-after::after\s*\{[^}]*background:\s*var\(--brand\)/);
  });
});
