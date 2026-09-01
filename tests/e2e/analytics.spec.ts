import { expect, test, type Page } from '@playwright/test';

const admin = { email: 'e2e-admin@test.local', password: 'E2E-admin-password-2026' };

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(admin.email);
  await page.locator('input[name="password"]').fill(admin.password);
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page.getByRole('heading', { name: 'Вітаємо, E2E' })).toBeVisible();
}

async function mockAnalytics(page: Page) {
  await page.route('**/api/product-selections/analytics/overview**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ data: {
      periodDays: 30,
      totals: { impressions: 1280, productImpressions: 3480, productClicks: 376, buyClicks: 124, addToCart: 91, alreadyInCart: 8, errors: 4, uniqueVisitors: 906, clickThroughRate: .108, cartRate: .798 },
      series: Array.from({ length: 30 }, (_, index) => ({ date: `2026-08-${String(index + 2).padStart(2, '0')}`, impression: 22 + index * 2, product_click: 7 + index % 8, add_to_cart: 2 + index % 4, add_to_cart_error: index % 7 === 0 ? 1 : 0 })),
      selections: [{ id: 'selection-1', publicId: 'public-1', name: 'Перерва на знижки', itemCount: 8, impression: 1280 }],
      products: Array.from({ length: 6 }, (_, index) => ({ productExternalId: `phone-${index}`, modificationExternalId: null, sku: `PHONE-${index + 1}`, title: `Смартфон тестовий ${index + 1}`, imageUrl: '', product_impression: 350 - index * 20, product_click: 48 - index * 4, add_to_cart: 15 - index })),
      surfaces: [{ surface: 'desktop', count: 1450 }, { surface: 'mobile', count: 2180 }],
      pages: [{ pageUrl: 'https://shop.example.com/pererva-na-znyzhky/', impression: 1280, product_click: 376, add_to_cart: 91 }]
    } })
  }));
  await page.route('**/api/popup-banners/analytics/overview**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ data: { periodDays: 30, totals: { impressions: 630, clicks: 48, dismissals: 82, acknowledgements: 26, uniqueVisitors: 440, engagementRate: .117, dismissRate: .13 }, series: [], campaigns: [], pages: [] } })
  }));
}

test('analytics keeps the tool chooser separate and the detailed dashboard readable', async ({ page }) => {
  await login(page);
  await mockAnalytics(page);
  await page.goto('/analytics/product-selections');

  await expect(page.getByRole('heading', { name: 'Аналітика' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Вибірки товарів/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Попап-банери/ })).toBeVisible();
  await expect(page.getByText('Динаміка вибірок')).toBeVisible();
  await expect(page.getByText('Воронка взаємодії')).toBeVisible();
  await expect(page.getByText('Сторінки розміщення')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Аналітика' })).toBeVisible();
  await expect(page.getByText('Динаміка вибірок')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
