import { devices, expect, test, type Locator, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import type { PopupPreviewPayload } from '../../client/src/types/popup-banner';

const panelOrigin = 'http://panel.example.test';
const serverOrigin = 'http://localhost:4175';

test.afterEach(async ({ page }) => {
  // Module preloads can outlive the assertions; finish their proxies before page/context disposal.
  await page.unrouteAll({ behavior: 'wait' });
});

function promoPayload(position: 'top' | 'bottom' = 'bottom'): PopupPreviewPayload {
  return {
    campaign: {
      publicId: '6df63f00-e404-4d27-ab0c-39c5e5f5a183', revision: 'floating-v1', type: 'product_promo', mode: 'all_pages',
      content: {
        eyebrow: '', title: 'Вигідна пропозиція', body: 'Товари, які можуть вас зацікавити.',
        primaryLabel: '', primaryUrl: '', secondaryLabel: '', imageUrl: '', acknowledgementLabel: ''
      },
      styles: {
        layout: 'corner', promoFormat: 'notification', desktopPosition: 'bottom_left', mobilePosition: position,
        accentColor: '#ffe101', backgroundColor: '#ffffff', textColor: '#172033', mutedColor: '#667085',
        primaryButtonBackgroundColor: '#ffe101', primaryButtonTextColor: '#111111',
        secondaryButtonBackgroundColor: '#ffffff', secondaryButtonTextColor: '#172033',
        checkboxAccentColor: '#ffe101', checkboxCheckColor: '#ffffff', checkboxTextColor: '#172033',
        timelineColor: '#ffe101', timelineTrackColor: '#111111', showPromoTitle: false,
        eyebrowFontSize: 12, titleFontSize: 20, bodyFontSize: 14, acknowledgementFontSize: 14,
        buttonFontSize: 14, buttonBorderRadius: 12, borderRadius: 20, maxWidth: 380
      },
      behavior: {
        trigger: 'delay', delayMs: 0, scrollPercent: 35, inactivitySeconds: 8, frequency: 'always',
        cooldownHours: 24, cooldownDays: 7, maxShowsPerSession: 0, device: 'all', autoCloseSeconds: 0,
        rotationSeconds: 60, activeWeekdays: [1, 2, 3, 4, 5, 6, 7], dailyStartTime: '', dailyEndTime: '',
        scheduleTimezone: 'Europe/Kyiv', dismissible: true, requireAcknowledgement: false, buttonCount: 1
      }
    },
    product: null, recommendations: [],
    products: [1, 2].map((number) => ({
      productId: `product-${number}`, modificationId: null, article: `PROMO-${number}`,
      title: number === 1 ? 'DC UPS 830P 20000mAh Black' : 'Повербанк 20000mAh',
      price: '2549', oldPrice: '', currency: 'UAH', buyId: `${number}`,
      imageUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="54" height="54"%3E%3Crect width="54" height="54" fill="black"/%3E%3C/svg%3E',
      pageUrl: `http://shop.example.test/product-${number}/`
    }))
  };
}

async function storefront(page: Page, mobile: boolean, position: 'top' | 'bottom' = 'bottom') {
  const events: string[] = [];
  for (const kind of ['popup-banners', 'support-chat']) {
    const response = await page.request.get(`${serverOrigin}/api/public/${kind}/embed.js`, {
      headers: { 'x-forwarded-host': 'panel.example.test', 'x-forwarded-proto': 'http' }
    });
    expect(response.ok()).toBe(true);
    const script = await response.text();
    await page.route(`${panelOrigin}/api/public/${kind}/embed.js`, (route) => route.fulfill({
      contentType: 'application/javascript; charset=utf-8', body: script
    }));
  }
  // Serve the actual compiled chat app on a separate origin, as on Horoshop.
  await page.route(`${panelOrigin}/support-chat/widget?**`, async (route) => route.fulfill({
    response: await route.fetch({ url: route.request().url().replace(panelOrigin, serverOrigin) })
  }));
  await page.route(`${panelOrigin}/web-assets/**`, async (route) => route.fulfill({
    response: await route.fetch({ url: route.request().url().replace(panelOrigin, serverOrigin) })
  }));
  await page.route('**/api/public/support-chat/session', (route) => route.fulfill({ json: { data: {
    token: 'floating-widget-test-session-token', conversation: null,
    visitor: { id: 'visitor', name: '', email: '', phone: '' },
    settings: { name: 'Онлайн-підтримка', accentColor: '#ffe101', welcomeText: 'Вітаємо!', workingHoursEnabled: false, contactFormEnabled: false }
  } } }));
  await page.route('**/api/public/popup-banners/resolve?**', (route) => route.fulfill({
    json: { data: promoPayload(position) }, headers: { 'access-control-allow-origin': '*' }
  }));
  await page.route('**/api/public/popup-banners/events', (route) => {
    if (route.request().method() === 'POST') events.push(route.request().postDataJSON().eventType);
    return route.fulfill({ status: 204, headers: {
      'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type'
    } });
  });
  await page.route('http://shop.example.test/**', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head>
      <body><h1>Магазин</h1><button>Каталог</button>${mobile
        ? '<div id="cart-drawer" class="cart" hidden></div>'
        : '<section id="cart" class="popup __cart" hidden></section>'}</body></html>`
  }));
  await page.goto('http://shop.example.test/sale/');
  return {
    events,
    load: (kind: 'popup-banners' | 'support-chat') => page.addScriptTag({ url: `${panelOrigin}/api/public/${kind}/embed.js` })
  };
}

async function expectAbove(frame: Locator, promo: Locator) {
  await expect.poll(async () => {
    const [chat, banner] = await Promise.all([frame.boundingBox(), promo.boundingBox()]);
    if (!chat || !banner) return false;
    const gap = banner.y - chat.y - chat.height;
    // The runtime rounds the inset up to avoid subpixel overlap.
    return gap >= 11.99 && gap <= 13.01;
  }, { message: 'The chat launcher should remain at least 12px above the promo.' }).toBe(true);
}

test('finishes pending chat asset proxies before disposing the page', async ({ page }) => {
  const fixture = await storefront(page, false);
  await fixture.load('support-chat');
  const chat = page.frameLocator('iframe[title="Онлайн-підтримка"]');
  await expect(chat.getByRole('button', { name: 'Відкрити онлайн-підтримку' })).toBeVisible();
  let received!: () => void;
  const requestReceived = new Promise<void>((resolve) => { received = resolve; });
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/javascript' });
    response.write('// streaming preload\n');
    received();
    setTimeout(() => response.end('// complete\n'), 250);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test asset server address');
    const assetUrl = `${panelOrigin}/slow-chat-preload.js`;
    await page.route(assetUrl, async (route) => route.fulfill({
      response: await route.fetch({ url: `http://127.0.0.1:${address.port}/slow-chat-preload.js` })
    }));
    await chat.locator('body').evaluate((body, url) => {
      const preload = body.ownerDocument.createElement('link');
      preload.rel = 'modulepreload';
      preload.href = url;
      body.ownerDocument.head.append(preload);
    }, assetUrl);
    // End while route.fetch is reading the streamed body, as happened in CI.
    await requestReceived;
  } finally {
    server.close();
  }
});

for (const surface of [
  { name: 'desktop', device: devices['Desktop Chrome'] },
  { name: 'mobile', device: devices['iPhone 13'] }
]) {
  test.describe(`floating widgets ${surface.name}`, () => {
    test.use({
      userAgent: surface.device.userAgent, viewport: surface.device.viewport,
      isMobile: surface.device.isMobile, hasTouch: surface.device.hasTouch,
      deviceScaleFactor: surface.device.deviceScaleFactor
    });

    for (const first of ['popup-banners', 'support-chat'] as const) {
      test(`coordinates promo and chat when ${first} loads first`, async ({ page }, testInfo) => {
        const mobile = surface.name === 'mobile';
        const fixture = await storefront(page, mobile);
        await fixture.load(first);
        if (first === 'popup-banners') await expect(page.locator('#mt-popup-banner-root')).toBeVisible();
        await fixture.load(first === 'popup-banners' ? 'support-chat' : 'popup-banners');
        const promo = page.locator('#mt-popup-banner-root');
        const frame = page.locator('iframe[title="Онлайн-підтримка"]');
        const chat = page.frameLocator('iframe[title="Онлайн-підтримка"]');
        await expect(promo).toBeVisible();
        await expect(chat.getByRole('button', { name: 'Відкрити онлайн-підтримку' })).toBeVisible();
        if (mobile) await expectAbove(frame, promo);
        else await expect(frame).toHaveCSS('bottom', '16px');
        await promo.getByRole('button', { name: 'Наступний товар' }).click();
        await expect(promo.locator('.promo-navigation-status')).toHaveText('2 / 2');
        await page.screenshot({ path: testInfo.outputPath('promo-with-chat.png') });

        if (mobile) {
          const before = (await promo.boundingBox())!.height;
          await promo.locator('.body').evaluate((node) => { node.textContent += '\nДодаткова інформація\nпро поточну пропозицію'; });
          await expect.poll(async () => (await promo.boundingBox())!.height).toBeGreaterThan(before);
          await expectAbove(frame, promo);
          await page.setViewportSize({ width: 360, height: 740 });
          await expectAbove(frame, promo);
        }

        await chat.getByRole('button', { name: 'Відкрити онлайн-підтримку' }).click();
        await expect(chat.getByRole('button', { name: 'Згорнути чат' })).toBeVisible();
        if (mobile) {
          await expect(promo).toBeHidden();
          await expect(promo).toHaveJSProperty('inert', true);
          await expect.poll(() => frame.boundingBox()).toEqual({ x: 0, y: 0, ...page.viewportSize()! });
        } else {
          await expect(promo).toBeVisible();
          await expect(frame).toHaveCSS('width', '420px');
        }
        await chat.getByRole('button', { name: 'Згорнути чат' }).click();
        await expect(promo).toBeVisible();
        await expect(promo.locator('.promo-navigation-status')).toHaveText('2 / 2');
        if (mobile) await expectAbove(frame, promo);
        await promo.getByRole('button', { name: 'Закрити', exact: true }).click();
        await expect(promo).toHaveCount(0);
        await expect(frame).toHaveCSS('bottom', '16px');
        await chat.getByRole('button', { name: 'Відкрити онлайн-підтримку' }).click();
        await chat.getByRole('button', { name: 'Згорнути чат' }).click();
        await expect(promo).toHaveCount(0);
        await expect.poll(() => fixture.events.filter((event) => event === 'impression').length).toBe(1);
        expect(fixture.events.filter((event) => event === 'dismiss')).toHaveLength(1);
      });
    }

    test('a top-positioned mobile promo does not displace the launcher', async ({ page }) => {
      const fixture = await storefront(page, surface.name === 'mobile', 'top');
      await fixture.load('popup-banners');
      await fixture.load('support-chat');
      await expect(page.locator('#mt-popup-banner-root')).toBeVisible();
      await expect(page.locator('iframe[title="Онлайн-підтримка"]')).toHaveCSS('bottom', '16px');
    });
  });
}

test.describe('mobile chat already open', () => {
  test.use({
    userAgent: devices['iPhone 13'].userAgent, viewport: devices['iPhone 13'].viewport,
    isMobile: true, hasTouch: true, deviceScaleFactor: devices['iPhone 13'].deviceScaleFactor
  });
  test('suspends a late promo and restores it after closing chat', async ({ page }) => {
    const fixture = await storefront(page, true);
    await fixture.load('support-chat');
    const chat = page.frameLocator('iframe[title="Онлайн-підтримка"]');
    await chat.getByRole('button', { name: 'Відкрити онлайн-підтримку' }).click();
    await fixture.load('popup-banners');
    const promo = page.locator('#mt-popup-banner-root');
    await expect(promo).toHaveCount(1);
    await expect(promo).toBeHidden();
    await chat.getByRole('button', { name: 'Згорнути чат' }).click();
    await expect(promo).toBeVisible();
    await expectAbove(page.locator('iframe[title="Онлайн-підтримка"]'), promo);
  });
});
