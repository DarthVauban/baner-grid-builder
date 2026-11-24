import { devices, expect, test } from '@playwright/test';

const embedPath = '/api/public/site-themes/embed.js';
const dataPath = '/api/public/site-themes/promo-bar';
const panel = 'http://panel.example.test';
const storefront = 'http://shop.example.test';
const backgroundPath = '/media/catalog/library/promo.webp';
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ioAAAAASUVORK5CYII=', 'base64');
const literalOffer = '<strong>Знижки на смартфони цього тижня</strong>\nЛише онлайн';
const desktopMarkup = '<header id="store-header"><nav><a href="/catalog/">Каталог</a></nav></header><main><h1>Смартфони</h1></main>';
const fixtures = [
  {
    name: 'desktop laptop',
    device: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
    markup: desktopMarkup,
    mobile: false
  },
  {
    name: 'desktop wide',
    device: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    markup: desktopMarkup,
    mobile: false
  },
  {
    name: 'mobile',
    device: devices['iPhone 13'],
    markup: '<div id="store-header"><button type="button" onclick="this.textContent = \'Меню відкрите\'">Меню</button></div><main><h1>Мобільний каталог</h1></main>',
    mobile: true
  }
];

for (const fixture of fixtures) {
  const { userAgent, viewport, isMobile, hasTouch, deviceScaleFactor } = fixture.device;

  test.describe(`site theme promo bar on ${fixture.name}`, () => {
    test.use({ userAgent, viewport, isMobile, hasTouch, deviceScaleFactor });

    test('renders both promo modes with their background, styles and device visibility', async ({ page }) => {
      const scriptResponse = await page.request.get(embedPath);
      expect(scriptResponse.ok()).toBe(true);
      const script = await scriptResponse.text();
      const promoBar = {
        mode: 'standard',
        marqueeSpeed: 120,
        text: literalOffer,
        buttonText: 'До акцій',
        buttonUrl: '/sale/',
        backgroundColor: '#101010',
        backgroundImageUrl: backgroundPath,
        textColor: '#FFE086',
        buttonColor: '#F0CD53',
        buttonTextColor: '#161616',
        textFontSize: 23,
        textFontWeight: 700,
        buttonFontSize: 19,
        buttonFontWeight: 800,
        buttonPaddingY: 11,
        buttonPaddingX: 19,
        alignment: 'center',
        paddingY: 12,
        paddingX: 28,
        showDesktop: !fixture.mobile,
        showMobile: fixture.mobile
      };

      await page.route(`${panel}${embedPath}`, (route) => route.fulfill({
        contentType: 'application/javascript', body: script
      }));
      await page.route(`${panel}${dataPath}*`, (route) => route.fulfill({
        json: { data: promoBar }, headers: { 'access-control-allow-origin': '*' }
      }));
      await page.route(`${panel}${backgroundPath}`, (route) => route.fulfill({
        contentType: 'image/png', body: image
      }));
      await page.route(`${storefront}/**`, (route) => route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}#store-header{padding:12px}</style></head><body>${fixture.markup}<script src="${panel}${embedPath}"></script><script src="${panel}${embedPath}"></script></body></html>`
      }));

      await page.goto(storefront);
      const bar = page.locator('[data-mt-site-promo-bar]');
      const inner = bar.locator('[data-mt-site-promo-inner]');
      const message = inner.locator('span');
      const cta = bar.getByRole('link', { name: 'До акцій' });
      const header = page.locator('#store-header');
      await expect(bar).toBeVisible();
      await expect(bar).toHaveCount(1);
      await expect(inner).toContainText(literalOffer);
      await expect(inner.locator('strong')).toHaveCount(0);
      await expect(message).toHaveCSS('white-space', 'pre-wrap');
      await expect(message).toHaveCSS('font-size', '23px');
      await expect(message).toHaveCSS('font-weight', '700');
      await expect(cta).toHaveAttribute('href', /\/sale\/$/u);
      await expect(cta).toHaveCSS('font-size', '19px');
      await expect(cta).toHaveCSS('font-weight', '800');
      await expect(cta).toHaveCSS('padding', '11px 19px');
      await expect(bar).toHaveCSS('background-color', 'rgb(16, 16, 16)');
      await expect(bar).toHaveCSS('background-image', `url("${panel}${backgroundPath}")`);
      expect(await bar.evaluate((node) => node === document.body.firstElementChild)).toBe(true);
      expect(await bar.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      const barBounds = await bar.boundingBox();
      const headerBounds = await header.boundingBox();
      expect(barBounds!.width).toBeLessThanOrEqual(viewport.width);
      expect(headerBounds!.y).toBeGreaterThanOrEqual(barBounds!.y + barBounds!.height);

      if (fixture.mobile) {
        await header.getByRole('button', { name: 'Меню' }).click();
        await expect(header.getByRole('button', { name: 'Меню відкрите' })).toBeVisible();
      } else {
        await expect(header.getByRole('link', { name: 'Каталог' })).toHaveAttribute('href', '/catalog/');
      }

      promoBar.mode = 'marquee';
      await page.reload();
      const marquee = bar.locator('[data-mt-site-promo-marquee]');
      const track = marquee.locator('[data-mt-site-promo-track]');
      await expect(track).toBeVisible();
      await expect(cta).toHaveCount(0);
      await expect(bar).toHaveCSS('background-image', `url("${panel}${backgroundPath}")`);
      await expect(track).toHaveAttribute('aria-hidden', 'true');
      const animation = await track.evaluate((element) => {
        const timing = element.getAnimations()[0].effect!.getTiming();
        return {
          distance: element.firstElementChild!.getBoundingClientRect().width,
          duration: Number(timing.duration),
          infinite: timing.iterations === Infinity,
          width: element.getBoundingClientRect().width,
          viewportWidth: element.parentElement!.clientWidth
        };
      });
      expect(animation.infinite).toBe(true);
      expect(animation.duration).toBeCloseTo(animation.distance / promoBar.marqueeSpeed * 1000, 1);
      expect(animation.width).toBeGreaterThanOrEqual(animation.viewportWidth + animation.distance - 1);
      if (!fixture.mobile) {
        await marquee.hover();
        await expect.poll(() => track.evaluate((element) => element.getAnimations()[0].playState)).toBe('paused');
        await page.mouse.move(10, viewport.height - 5);
      }
      await expect.poll(() => track.evaluate((element) => element.getAnimations()[0].playState)).toBe('running');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(track).toHaveCount(0);
      await expect(marquee).toContainText(literalOffer);

      promoBar.showDesktop = fixture.mobile;
      promoBar.showMobile = !fixture.mobile;
      await Promise.all([page.waitForResponse(`${panel}${dataPath}*`), page.reload()]);
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
      await expect(bar).toBeHidden();
      await expect(header).toBeVisible();
    });
  });
}
