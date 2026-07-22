import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { defaultProductCardTheme, defaultProductPageTheme, defaultStorefrontTheme } from '../lib/storefront-theme';
import { CatalogStorefrontSettingsPage } from './CatalogStorefrontSettingsPage';

vi.mock('../toast/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() })
}));

afterEach(() => vi.restoreAllMocks());

describe('CatalogStorefrontSettingsPage', () => {
  it('opens the saved public storefront from the connection settings', async () => {
    vi.spyOn(api.catalog, 'storefrontSettings').mockResolvedValue({
      selectedFormPublicId: null,
      publicOrigin: 'https://shop.mt-panel.test',
      storefrontTheme: structuredClone(defaultStorefrontTheme),
      productCardTheme: structuredClone(defaultProductCardTheme),
      productPageTheme: structuredClone(defaultProductPageTheme),
      updatedAt: '2026-07-22T12:00:00.000Z'
    });
    vi.spyOn(api.forms, 'list').mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter><CatalogStorefrontSettingsPage /></MemoryRouter>
      </QueryClientProvider>
    );

    const link = await screen.findByRole('link', { name: 'Відкрити вітрину' });
    expect(link).toHaveAttribute('href', 'https://shop.mt-panel.test');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('aria-disabled', 'false');
  });
});
