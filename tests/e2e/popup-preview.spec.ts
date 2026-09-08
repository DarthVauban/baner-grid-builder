import { devices, expect, test, type Locator, type Page } from '@playwright/test';

async function setupPreview(page: Page) {
  await page.route('**/popup-preview-product.svg', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect x="16" y="4" width="32" height="56" rx="6" fill="#172033"/><rect x="19" y="10" width="26" height="42" rx="2" fill="#6d5dfc"/></svg>'
  }));
  await page.route('**/api/popup-banners', (route) => route.fulfill({ json: { data: [] } }));
  await page.route('**/api/popup-banners/options', (route) => route.fulfill({ json: { data: {
    integration: { id: 'connection', generation: 'generation', storeDomain: 'shop.example.com', status: 'connected', lastSyncAt: null },
    stickers: [], brands: [], conditions: [], categories: []
  } } }));
  await page.route('**/api/popup-banners/catalog?**', (route) => route.fulfill({ json: { data: {
    items: [], categories: [], integration: null, page: 1, pageSize: 60, total: 0
  } } }));
  await page.route('**/api/popup-banners/preview', (route) => {
    const input = route.request().postDataJSON();
    return route.fulfill({ json: { data: {
      campaign: {
        publicId: 'preview', revision: 'preview-layout', type: input.campaignType, mode: input.targeting.mode,
        content: input.content, styles: input.styles, behavior: input.behavior,
        timerConfig: input.timerConfig, formConfig: input.formConfig, promoCode: null
      },
      product: null, recommendations: [], products: [{
        productId: 'product', modificationId: null, article: 'TEST-PHONE', title: 'Тестовий смартфон',
        imageUrl: '/popup-preview-product.svg', pageUrl: 'https://shop.example.com/phone/', price: '19999', oldPrice: '', currency: 'UAH', buyId: '123'
      }]
    } } });
  });
  await page.goto('/login');
  await page.getByLabel('Email').fill('e2e-admin@test.local');
  await page.locator('input[name="password"]').fill('E2E-admin-password-2026');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page.getByRole('heading', { name: 'Вітаємо, E2E' })).toBeVisible();
  await page.goto('/tools/popup-banners/legacy');
  await page.getByRole('button', { name: /Товарний промобанер/u }).click();
  await expect(page.frameLocator('iframe[title="Живий перегляд банера"]').locator('.card')).toBeVisible();
}

async function expectUncovered(control: Locator) {
  await expect(control).toBeVisible();
  expect(await control.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  })).toBe(true);
}

for (const surface of [
  { name: 'desktop', device: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
  { name: 'mobile', device: devices['iPhone 13'] }
]) {
  test.describe(`popup fullscreen preview ${surface.name}`, () => {
    test.use({
      viewport: surface.device.viewport, userAgent: surface.device.userAgent,
      isMobile: surface.device.isMobile, hasTouch: surface.device.hasTouch, deviceScaleFactor: surface.device.deviceScaleFactor
    });

    test('keeps the toolbar above the workspace and switches formats without leaving fullscreen', async ({ page }, testInfo) => {
      await setupPreview(page);
      const open = page.getByRole('button', { name: 'Відкрити прев’ю на весь екран' });
      if (surface.name === 'desktop') {
        const panel = page.locator('.popup-editor__preview');
        const panelTop = await panel.evaluate((node) => node.getBoundingClientRect().top + window.scrollY);
        await page.evaluate((top) => window.scrollTo(0, top + 200), panelTop);
        const topbarBottom = (await page.locator('.topbar').boundingBox())!.height;
        await expect.poll(async () => (await panel.boundingBox())!.y).toBeGreaterThan(topbarBottom);
        const pinnedTop = (await panel.boundingBox())!.y;
        await page.evaluate(() => window.scrollBy(0, 350));
        await expect.poll(async () => (await panel.boundingBox())!.y).toBeCloseTo(pinnedTop, 0);
        await expectUncovered(open);
      }
      await open.click();
      const preview = page.locator('.popup-live-preview.is-fullscreen');
      const close = page.getByRole('button', { name: 'Закрити повноекранний перегляд' });
      const mobile = page.getByRole('button', { name: 'Телефон', exact: true });
      const desktop = page.getByRole('button', { name: 'Комп’ютер', exact: true });
      await expectUncovered(close);
      await expectUncovered(mobile);
      await expectUncovered(desktop);
      const bounds = await preview.boundingBox();
      expect(bounds).toEqual({ x: 0, y: 0, ...page.viewportSize()! });
      const frame = preview.locator('iframe');
      const toolbarBounds = (await preview.locator('header').boundingBox())!;
      const frameBounds = (await frame.boundingBox())!;
      expect(frameBounds.y).toBeGreaterThanOrEqual(toolbarBounds.y + toolbarBounds.height);
      const card = page.frameLocator('iframe[title="Живий перегляд банера"]').locator('.card');
      const cardBounds = (await card.boundingBox())!;
      expect(cardBounds.x).toBeGreaterThanOrEqual(0);
      expect(cardBounds.y + cardBounds.height).toBeLessThanOrEqual(page.viewportSize()!.height);
      await page.screenshot({ path: testInfo.outputPath('fullscreen-desktop.png'), animations: 'disabled' });

      await mobile.click();
      await expect(mobile).toHaveAttribute('aria-pressed', 'true');
      await expect(card).toBeVisible();
      expect((await frame.boundingBox())!.width).toBeLessThanOrEqual(430);
      await expectUncovered(close);
      await page.screenshot({ path: testInfo.outputPath('fullscreen-mobile.png'), animations: 'disabled' });
      await desktop.click();
      await expect(desktop).toHaveAttribute('aria-pressed', 'true');
      expect((await frame.boundingBox())!.width).toBe(page.viewportSize()!.width);
      await close.click();
      await expect(preview).toHaveCount(0);
      await expect(open).toBeFocused();
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');

      await open.click();
      await expect(card).toBeVisible();
      await page.frameLocator('iframe[title="Живий перегляд банера"]').getByRole('button', { name: 'Закрити', exact: true }).focus();
      await page.keyboard.press('Escape');
      await expect(preview).toHaveCount(0);
      await expect(open).toBeFocused();
    });
  });
}
