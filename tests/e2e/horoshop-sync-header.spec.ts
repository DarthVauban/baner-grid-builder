import { devices, expect, test } from '@playwright/test';
import type { HoroshopCatalogSyncStatus } from '../../client/src/types/integration';

for (const surface of [
  { name: 'desktop', device: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  { name: 'tablet', device: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
  { name: 'mobile', device: devices['iPhone 13'] }
]) {
  test(`catalog header keeps separate counters stable on ${surface.name}`, async ({ browser }, testInfo) => {
    const context = await browser.newContext(surface.device);
    const page = await context.newPage();
    const now = new Date();
    await page.clock.install({ time: now });
    let elapsed = 0;
    let payload: HoroshopCatalogSyncStatus = {
      configured: true, status: 'connected', serverNow: now.toISOString(),
      nextScheduledSyncAt: new Date(now.getTime() + 300_000).toISOString(),
      counts: { products: 1586, modifications: 5042 }, latestRun: null
    };
    await page.route('**/api/search/horoshop/sync-status', (route) => route.fulfill({
      contentType: 'application/json', body: JSON.stringify({ data: payload })
    }));
    const tick = async (milliseconds: number) => {
      elapsed += milliseconds;
      payload.serverNow = new Date(now.getTime() + elapsed).toISOString();
      await page.clock.fastForward(milliseconds);
    };
    await page.goto('/login');
    await page.getByLabel('Email').fill('e2e-admin@test.local');
    await page.locator('input[name="password"]').fill('E2E-admin-password-2026');
    await page.getByRole('button', { name: 'Увійти' }).click();
    await expect(page.getByRole('heading', { name: 'Вітаємо, E2E' })).toBeVisible();
    await page.goto('/tools');
    const counts = page.locator('.topbar-catalog-counts');
    await expect(counts.getByLabel('Товари: 1 586', { exact: true })).toBeVisible();
    await expect(counts.locator('.topbar-catalog-counts__item')).toHaveCount(2);
    await expect(page.locator('.topbar-catalog-sync__countdown')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const measure = () => page.locator('.topbar-catalog-counts, .topbar-catalog-counts__item--products, .topbar-catalog-counts__item--modifications, .topbar-catalog-sync')
      .evaluateAll((elements) => elements.map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }));
    const initial = await measure();
    payload.counts = { products: 9_999_999, modifications: 9_999_999 };
    await tick(16_000);
    await expect(counts.getByLabel('Товари: 9 999 999', { exact: true })).toBeVisible();
    expect(await measure()).toEqual(initial);
    payload = { ...payload, status: 'syncing', nextScheduledSyncAt: null, latestRun: {
      status: 'running', progressPercentage: null, exportItemsReceived: 0, exportItemsTotal: null,
      stickersReceived: 0, productsReceived: 0, modificationsReceived: 0
    } };
    await tick(16_000);
    await expect(counts.getByLabel('Стікери: 0', { exact: true })).toBeVisible();
    expect(await measure()).toEqual(initial);
    payload.latestRun = { ...payload.latestRun!, stickersReceived: 15, productsReceived: 431, modificationsReceived: 500 };
    await tick(2100);
    await expect(counts.getByLabel('Товари: 431', { exact: true })).toBeVisible();
    await expect(counts).toHaveText('Стікери15Товари431Модифікації500');
    await expect(counts).not.toContainText('пакет');
    const stickerSize = await counts.locator('.topbar-catalog-counts__item--stickers').boundingBox();
    await page.screenshot({ path: testInfo.outputPath(`catalog-sync-header-${surface.name}.png`) });
    payload.latestRun = { ...payload.latestRun!, stickersReceived: 9_999_999, productsReceived: 9_999_999, modificationsReceived: 9_999_999 };
    await tick(2100);
    await expect(counts.getByLabel('Стікери: 9 999 999', { exact: true })).toBeVisible();
    expect(await measure()).toEqual(initial);
    expect(await counts.locator('.topbar-catalog-counts__item--stickers').boundingBox()).toEqual(stickerSize);
    payload = { ...payload, status: 'connected', counts: { products: 1732, modifications: 4129 },
      nextScheduledSyncAt: new Date(now.getTime() + 600_000).toISOString(), latestRun: { ...payload.latestRun!, status: 'succeeded' } };
    await tick(2100);
    await expect(counts.getByLabel('Товари: 1 732', { exact: true })).toBeVisible();
    await expect(counts.locator('.topbar-catalog-counts__item')).toHaveCount(2);
    expect(await measure()).toEqual(initial);
    expect(await page.locator('.topbar').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await counts.locator('strong').first().evaluate((element) => getComputedStyle(element).fontVariantNumeric)).toContain('tabular-nums');
    if (surface.name === 'tablet') {
      await page.goto('/tools/online-support');
      await expect(page.locator('.online-support-page')).toBeVisible();
      const pane = await page.locator('.page-container').boundingBox();
      expect(pane!.y + pane!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
    }
    await page.goto('/catalog/products');
    await expect(counts.getByLabel('Товари: 1 732', { exact: true })).toBeVisible();
    const standalone = await measure();
    payload.counts = { products: 1, modifications: 2 };
    await tick(16_000);
    await expect(counts.getByLabel('Товари: 1', { exact: true })).toBeVisible();
    expect(await measure()).toEqual(standalone);
    expect(await page.locator('.standalone-tool-topbar').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await context.close();
  });
}
