import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { defaultProductCardTheme, defaultProductPageTheme, defaultStorefrontTheme } from '../lib/storefront-theme';
import { CatalogHeaderFooterSettingsPage } from './CatalogHeaderFooterSettingsPage';

vi.mock('../toast/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() })
}));

afterEach(() => vi.restoreAllMocks());

describe('CatalogHeaderFooterSettingsPage', () => {
  it('loads the shared theme and adds a header navigation link', async () => {
    vi.spyOn(api.catalog, 'storefrontSettings').mockResolvedValue({
      selectedFormPublicId: null,
      publicOrigin: 'https://shop.mt-panel.test',
      storefrontTheme: structuredClone(defaultStorefrontTheme),
      productCardTheme: structuredClone(defaultProductCardTheme),
      productPageTheme: structuredClone(defaultProductPageTheme),
      updatedAt: '2026-07-24T10:00:00.000Z'
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter><CatalogHeaderFooterSettingsPage /></MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByRole('heading', { name: 'Хедер і футер' })).toBeInTheDocument();
    expect(await screen.findByText('Типографіка хедера')).toBeInTheDocument();
    expect(screen.getByText('Типографіка футера')).toBeInTheDocument();
    expect(screen.getByText('Розмір навігації')).toBeInTheDocument();
    expect(screen.getByText('Вага заголовків колонок')).toBeInTheDocument();
    const navigationSection = (await screen.findByRole('heading', { name: 'Навігація хедера' })).closest('section');
    expect(navigationSection).not.toBeNull();
    const addButtons = within(navigationSection as HTMLElement).getAllByRole('button', { name: 'Додати' });
    fireEvent.click(addButtons[0]);

    expect(within(navigationSection as HTMLElement).getByDisplayValue('Нове посилання')).toBeInTheDocument();
  });
});
