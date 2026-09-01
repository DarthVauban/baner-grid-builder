import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { AnalyticsPage } from './AnalyticsPage';

afterEach(() => vi.restoreAllMocks());

function renderPage(path = '/analytics/product-selections') {
  vi.spyOn(api.users, 'toolAccess').mockResolvedValue(['product_selection', 'popup_banners']);
  vi.spyOn(api.productSelections, 'analytics').mockResolvedValue({
    periodDays: 30,
    totals: {
      impressions: 1200, productImpressions: 3100, productClicks: 310, buyClicks: 94,
      addToCart: 72, alreadyInCart: 5, errors: 3, uniqueVisitors: 840,
      clickThroughRate: 0.1, cartRate: 0.819
    },
    series: [{ date: '2026-09-01', impression: 1200, product_click: 310, add_to_cart: 72, add_to_cart_error: 3 }],
    selections: [{ id: 'selection-1', publicId: 'public-1', name: 'Перерва на знижки', itemCount: 8, impression: 1200 }],
    products: [{ productExternalId: 'phone-1', modificationExternalId: null, sku: 'PHONE-1', title: 'Смартфон', imageUrl: '', product_impression: 100, product_click: 18, add_to_cart: 7 }],
    surfaces: [{ surface: 'desktop', count: 500 }, { surface: 'mobile', count: 700 }],
    pages: [{ pageUrl: 'https://shop.example.com/news/', impression: 1200, product_click: 310, add_to_cart: 72 }]
  });
  vi.spyOn(api.popupBanners, 'analytics').mockResolvedValue({
    periodDays: 30,
    totals: { impressions: 600, clicks: 45, dismissals: 80, acknowledgements: 20, uniqueVisitors: 420, engagementRate: 0.108, dismissRate: 0.133 },
    series: [], campaigns: [], pages: []
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="analytics" element={<AnalyticsPage />} />
    <Route path="analytics/:tool" element={<AnalyticsPage />} />
  </Routes></MemoryRouter></QueryClientProvider>);
}

describe('AnalyticsPage', () => {
  it('keeps tool selection compact and renders a detailed selection dashboard separately', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Аналітика' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Вибірки товарів/ })).toHaveAttribute('href', '/analytics/product-selections');
    expect(await screen.findByRole('link', { name: /Попап-банери/ })).toHaveAttribute('href', '/analytics/popup-banners');
    expect((await screen.findAllByText('1 200')).length).toBeGreaterThan(0);
    expect(screen.getByText('Воронка взаємодії')).toBeInTheDocument();
    expect(screen.getByText('Динаміка вибірок')).toBeInTheDocument();
    expect(screen.getByText('Товари')).toBeInTheDocument();
    expect(screen.getByText('Сторінки розміщення')).toBeInTheDocument();
  });

  it('shows only the tool chooser on the analytics landing page', async () => {
    renderPage('/analytics');

    expect(await screen.findByText('Дані зібрані в окремих дашбордах')).toBeInTheDocument();
    expect(screen.queryByText('Воронка взаємодії')).not.toBeInTheDocument();
  });
});
