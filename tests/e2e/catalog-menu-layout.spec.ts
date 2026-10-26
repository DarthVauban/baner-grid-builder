import { devices, expect, test, type Page } from '@playwright/test';
import { catalogMenuEmbedScript } from '../../src/modules/horoshop-catalog-menu/catalog-menu.embed.js';

// Exercise real scrollbar gutters, including Windows' non-overlay scrollbars.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

async function storefront(page: Page, tall: boolean, mobile = false, theme = 'compact-columns') {
  const desktopMenu = `<div class="j-products-menu">
    <div class="productsMenu-submenu __hasTabs">
      <div class="productsMenu-tabs"><div class="productsMenu-tabs-switch"><ul class="productsMenu-tabs-list">
        ${Array.from({ length: 24 }, (_, index) => `<li class="productsMenu-tabs-list__tab"><a class="productsMenu-tabs-list__link" data-target="menu-tab-${index % 2}" href="/category-${index}/">Категорія ${index}</a></li>`).join('')}
      </ul></div><div class="productsMenu-tabs-content">
        ${[0, 1].map((index) => `<ul class="productsMenu-submenu-w" id="menu-tab-${index}"><li class="productsMenu-submenu-i"><a class="productsMenu-submenu-a" href="/phones/">Смартфони</a><ul class="productsMenu-list"><li class="productsMenu-list-i"><a href="/apple/">Apple</a></li></ul></li></ul>`).join('')}
      </div></div>
    </div>
  </div>`;
  await page.route('https://shop.example.test/**', (route) => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        html,body{margin:0;padding:0} body{font-family:Arial,sans-serif}
        header{height:100px;background:#ffe101} .header-content{width:80%;margin:auto}
        main{height:${tall ? '2500px' : '200px'};background:#f5f6f8}
        .j-products-menu{position:relative;margin-left:120px}
        .productsMenu-submenu{position:absolute;top:0;left:0;display:none}
        .productsMenu-submenu.__visible{display:block}
        .productsMenu-submenu-w{display:none}
      </style></head><body><header><div class="header-content"><button class="j-productsMenu-toggleButton">Каталог</button></div></header>
      ${mobile ? '<div id="catalog-drawer" class="catalog-menu" hidden>Мобільний каталог</div>' : desktopMenu}
      <main>Вітрина</main><script>
        document.querySelector('button').addEventListener('click', () => {
          const menu = document.querySelector('.productsMenu-submenu');
          if (menu) menu.classList.toggle('__visible');
          else document.querySelector('#catalog-drawer').toggleAttribute('hidden');
        });
      </script></body></html>`
  }));
  await page.goto('https://shop.example.test/');
  await page.addScriptTag({ content: catalogMenuEmbedScript(theme, '', '0') });
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const body = document.body.getBoundingClientRect();
    const header = document.querySelector('header')!.getBoundingClientRect();
    const button = document.querySelector('button')!.getBoundingClientRect();
    return { bodyWidth: body.width, headerWidth: header.width, buttonX: button.x };
  });
}

for (const theme of ['compact-columns', 'flat-directory', 'grouped-sections']) {
  for (const tall of [true, false]) {
    test(`${theme} preserves page width on a ${tall ? 'scrollable' : 'short'} desktop page`, async ({ page }, testInfo) => {
      await storefront(page, tall, false, theme);
      const before = await geometry(page);
      if (tall) expect(await page.evaluate(() => innerWidth - document.documentElement.clientWidth)).toBeGreaterThan(0);
      const toggle = page.getByRole('button', { name: 'Каталог', exact: true });
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await toggle.click();
        await expect(page.locator('html')).toHaveClass(/mt-catalog-menu-open/u);
        await expect.poll(() => geometry(page)).toEqual(before);
        const list = page.locator('.productsMenu-tabs-list');
        await list.hover();
        await page.mouse.wheel(0, 400);
        await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
        expect(await page.evaluate(() => scrollY)).toBe(0);
        await toggle.click();
        await expect(page.locator('html')).not.toHaveClass(/mt-catalog-menu-open/u);
        await expect.poll(() => geometry(page)).toEqual(before);
      }
      await toggle.click();
      await expect(page.locator('html')).toHaveClass(/mt-catalog-menu-open/u);
      await page.screenshot({ path: testInfo.outputPath('catalog-open.png') });
    });
  }
}

test.describe('native mobile catalog', () => {
  const device = devices['iPhone 13'];
  test.use({
    userAgent: device.userAgent, viewport: device.viewport,
    isMobile: device.isMobile, hasTouch: device.hasTouch, deviceScaleFactor: device.deviceScaleFactor
  });
  test('retains native menu and page geometry', async ({ page }) => {
    await storefront(page, true, true);
    const before = await geometry(page);
    await page.getByRole('button', { name: 'Каталог', exact: true }).click();
    await expect(page.locator('#catalog-drawer')).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/mt-catalog-menu-open/u);
    expect(await geometry(page)).toEqual(before);
    await expect(page.locator('[data-mt-catalog-menu]')).toHaveCount(0);
    await expect(page.locator('#mt-horoshop-catalog-menu-v1')).toHaveCount(0);
  });
});
