import { devices, expect, test } from '@playwright/test';
import type { FeedCatalog, FeedOperation } from '../../client/src/types/horoshop-feeds';

const productId = '11111111-1111-4111-8111-111111111111';
const operationId = '33333333-3333-4333-8333-333333333333';
const catalog: FeedCatalog = {
  integration: { configured: true, status: 'connected', storeDomain: 'shop.example.com', pollingIntervalMinutes: 15,
    lastSyncAt: '2026-11-11T10:00:00Z', lastError: null, counts: { categories: 1, stickers: 0, products: 1, modifications: 1 }, latestRun: null },
  items: [{ id: productId, externalId: '101', sku: 'PHONE', titles: { uk: 'Телефон' }, title: 'Телефон', brand: 'Apple',
    categoryExternalId: 'phones', availability: 'В наявності', imageUrl: null, pageUrl: null, marketplaces: ['Rozetka Feed'],
    google: 'disabled', facebook: 'disabled', modifications: [] }],
  categories: [{ externalId: 'phones', title: 'Телефони' }], brands: ['Apple'], availabilityOptions: ['В наявності'],
  total: 1, page: 1, pageSize: 25, pageCount: 1
};
const preview: FeedOperation = {
  id: operationId, action: { google: 'enable', facebook: 'disable' }, status: 'draft', errorMessage: '', actorUserId: null,
  createdAt: '2026-11-11T10:00:00Z', startedAt: null, completedAt: null, total: 1, counts: { pending: 1 },
  items: [{ id: 'item', productId, externalId: '101', article: 'PHONE', title: 'Телефон', articles: ['PHONE'],
    before: [{ article: 'PHONE', marketplaces: ['Rozetka Feed', 'Facebook Feed'] }],
    target: [{ article: 'PHONE', marketplaces: ['Google Feed for Merchant Center', 'Rozetka Feed'] }],
    observed: null, status: 'pending', message: '' }]
};

for (const surface of [
  { name: 'desktop', device: devices['Desktop Chrome'] },
  { name: 'mobile', device: devices['iPhone 13'] }
]) {
  test.describe(`feed tool ${surface.name}`, () => {
    test.use({ userAgent: surface.device.userAgent, viewport: surface.device.viewport,
      isMobile: surface.device.isMobile, hasTouch: surface.device.hasTouch, deviceScaleFactor: surface.device.deviceScaleFactor });
    test('previews two independent feed changes before applying and shows the verified result', async ({ page }, testInfo) => {
      await page.goto('/login');
      await page.getByLabel('Email').fill('e2e-admin@test.local');
      await page.locator('input[name="password"]').fill('E2E-admin-password-2026');
      await page.getByRole('button', { name: 'Увійти' }).click();
      await expect(page.getByRole('heading', { name: 'Вітаємо, E2E' })).toBeVisible();
      let writes = 0;
      let previewInput: unknown;
      const completed: FeedOperation = { ...preview, status: 'completed', counts: { succeeded: 1 }, items: preview.items.map((item) => ({ ...item, status: 'succeeded', observed: item.target })) };
      await page.route('**/api/users/tool-access', (route) => route.fulfill({ json: { data: ['horoshop_feeds'] } }));
      await page.route('**/api/search/horoshop/feeds/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/operations/preview')) {
          previewInput = route.request().postDataJSON();
          return route.fulfill({ json: { data: preview } });
        }
        if (path.endsWith('/apply')) { writes += 1; return route.fulfill({ json: { data: completed } }); }
        if (path.endsWith(`/operations/${operationId}`)) return route.fulfill({ json: { data: completed } });
        if (path.endsWith('/operations')) return route.fulfill({ json: { data: [] } });
        return route.fulfill({ json: { data: catalog } });
      });
      await page.goto('/tools/horoshop-feeds');
      await expect(page.getByRole('heading', { name: 'Товарні фіди' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Перевірити зміни' })).toBeDisabled();
      await page.getByRole('button', { name: 'Вибрати всі 1 за фільтром' }).click();
      await page.getByRole('button', { name: 'Дія: Google Merchant Center' }).click();
      await page.getByRole('option', { name: 'Додати до фіда' }).click();
      await page.getByRole('button', { name: 'Дія: Facebook' }).click();
      await page.getByRole('option', { name: 'Прибрати з фіда' }).click();
      await page.screenshot({ path: testInfo.outputPath(`feeds-${surface.name}-catalog.png`), fullPage: true });
      await page.getByRole('button', { name: 'Перевірити зміни' }).click();
      const dialog = page.getByRole('dialog', { name: 'Перевірте зміни' });
      await expect(dialog.getByText('Google Feed for Merchant Center; Rozetka Feed', { exact: true })).toBeVisible();
      expect(writes).toBe(0);
      expect(previewInput).toEqual({ selection: { filters: { search: '', category: '', brands: [], availability: '' } }, action: { google: 'enable', facebook: 'disable' } });
      await page.screenshot({ path: testInfo.outputPath(`feeds-${surface.name}-preview.png`), fullPage: true });
      await dialog.getByRole('button', { name: 'Застосувати зміни' }).click();
      await expect(page.getByRole('dialog').getByText('Завершено', { exact: true })).toBeVisible();
      expect(writes).toBe(1);
      await page.getByRole('dialog').getByRole('button', { name: 'Закрити', exact: true }).last().click();
      await expect(page.getByRole('heading', { name: 'Товарні фіди' })).toBeVisible();
    });
  });
}
