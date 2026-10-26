import { devices, expect, test, type Page } from '@playwright/test';
import { catalogMenuCss, catalogMenuEmbedScript } from '../../src/modules/horoshop-catalog-menu/catalog-menu.embed.js';

// Explicit opt-in: real storefront markup/runtime, with only the local catalog assets substituted.
const storefrontUrl = process.env.HOROSHOP_LAYOUT_TEST_URL || '';
test.skip(!storefrontUrl, 'Set HOROSHOP_LAYOUT_TEST_URL to an authorized test store.');
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

async function useLocalCatalogAssets(page: Page, theme: string) {
  await page.route('**/api/public/horoshop-catalog-menu/embed.js*', (route) => {
    const stylesheet = new URL(route.request().url());
    stylesheet.pathname = stylesheet.pathname.replace('embed.js', 'theme.css');
    return route.fulfill({
      contentType: 'application/javascript; charset=utf-8',
      body: catalogMenuEmbedScript(theme, stylesheet.href)
    });
  });
  await page.route('**/api/public/horoshop-catalog-menu/theme.css*', (route) => route.fulfill({
    contentType: 'text/css; charset=utf-8', body: catalogMenuCss(theme)
  }));
}

for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  test.describe(`live Horoshop ${viewport.width}`, () => {
    test.use({ viewport });
    for (const theme of ['compact-columns', 'flat-directory', 'grouped-sections']) {
      test(`${theme} retains scrollbar, page width and catalog navigation`, async ({ page }, testInfo) => {
        test.setTimeout(60_000);
        await useLocalCatalogAssets(page, theme);
        await page.goto(storefrontUrl, { waitUntil: 'domcontentloaded' });
        const root = page.locator('.j-products-menu[data-mt-catalog-menu="v1"]');
        await expect(root).toHaveAttribute('data-mt-catalog-theme', theme);
        const measure = () => page.evaluate(() => ({
          pageWidth: document.documentElement.clientWidth,
          bodyWidth: document.body.getBoundingClientRect().width,
          headerWidth: document.querySelector('header')!.getBoundingClientRect().width,
          toggleX: document.querySelector('.j-productsMenu-toggleButton')!.getBoundingClientRect().x
        }));
        const before = await measure();
        expect(before.pageWidth).toBeLessThan(viewport.width);
        const toggle = page.locator('.j-productsMenu-toggleButton');
        for (let attempt = 0; attempt < 2; attempt += 1) {
          await toggle.click();
          await expect(page.locator('html')).toHaveClass(/mt-catalog-menu-open/u);
          await expect.poll(measure).toEqual(before);
          await expect(page.locator('html')).toHaveCSS('overflow-y', 'scroll');
          await expect(page.locator('html')).toHaveCSS('scrollbar-gutter', 'auto');
          await expect(root.locator('.productsMenu-submenu-w.__visible a[href]').first()).toBeVisible();
          const mainTop = await page.locator('main').evaluate((node) => node.getBoundingClientRect().top);
          const list = root.locator('.productsMenu-tabs-list');
          if (await list.evaluate((node) => node.scrollHeight > node.clientHeight)) {
            await list.hover();
            await page.mouse.wheel(0, 400);
            await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
          }
          // Horoshop closes this menu when the pointer leaves it; stay inside the native hover surface.
          const menu = (await root.locator('.productsMenu-submenu.__hasTabs').boundingBox())!;
          await page.mouse.move(menu.x + menu.width - 30, menu.y + menu.height / 2);
          await page.mouse.wheel(0, 500);
          await expect.poll(() => page.locator('main').evaluate((node) => node.getBoundingClientRect().top)).toBe(mainTop);
          if (attempt === 0) await page.screenshot({ path: testInfo.outputPath('live-catalog-open.png') });
          await toggle.click();
          await expect(page.locator('html')).not.toHaveClass(/mt-catalog-menu-open/u);
          await expect.poll(measure).toEqual(before);
        }
      });
    }
  });
}

test.describe('live native mobile Horoshop', () => {
  const device = devices['iPhone 13'];
  test.use({
    userAgent: device.userAgent, viewport: device.viewport,
    isMobile: device.isMobile, hasTouch: device.hasTouch, deviceScaleFactor: device.deviceScaleFactor
  });
  test('keeps the mobile surface outside the desktop adapter', async ({ page }, testInfo) => {
    await useLocalCatalogAssets(page, 'compact-columns');
    await page.goto(storefrontUrl, { waitUntil: 'domcontentloaded' });
    await page.getByText('Погодитися', { exact: true }).click();
    await page.waitForFunction('window.__mtHoroshopCatalogMenuV1 === true');
    await expect(page.locator('[data-mt-catalog-menu]')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveClass(/mt-catalog-menu-open/u);
    await expect(page.locator('#mt-horoshop-catalog-menu-v1')).toHaveCount(0);
    const width = await page.evaluate(() => document.documentElement.clientWidth);
    // Independently observed mobile DOM: this panel is separate from the desktop productsMenu.
    await page.locator('button[data-panel="catalog-navigation"]').click();
    const panel = page.locator('#catalog-navigation');
    await expect(panel).toBeInViewport();
    await expect(panel.getByRole('link').first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('live-mobile.png') });
    await panel.getByRole('button', { name: 'Закрити', exact: true }).click();
    await expect(panel).not.toBeInViewport();
    await expect.poll(() => page.evaluate(() => document.documentElement.clientWidth)).toBe(width);
    await expect(page.locator('html')).not.toHaveClass(/mt-catalog-menu-open/u);
  });
});
