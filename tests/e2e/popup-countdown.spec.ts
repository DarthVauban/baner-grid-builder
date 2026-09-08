import { devices, expect, test, type Page } from '@playwright/test';
import type { PopupPreviewPayload } from '../../client/src/types/popup-banner';

function payload(): PopupPreviewPayload {
  return {
    campaign: {
      publicId: '6df63f00-e404-4d27-ab0c-39c5e5f5a183', revision: 'v1', type: 'countdown', mode: 'all_pages',
      timerConfig: { mode: 'duration', durationMinutes: 1, deadlineAt: null },
      content: {
        eyebrow: 'Лише сьогодні', title: 'Встигніть скористатися пропозицією',
        body: 'Оберіть товари за вигідною ціною до завершення акції.',
        primaryLabel: 'Перейти до пропозиції', primaryUrl: '', secondaryLabel: 'Закрити', imageUrl: '', acknowledgementLabel: ''
      },
      styles: {
        layout: 'modal', promoFormat: 'notification', desktopPosition: 'bottom_left', mobilePosition: 'bottom',
        accentColor: '#6d5dfc', backgroundColor: '#ffffff', textColor: '#172033', mutedColor: '#667085',
        primaryButtonBackgroundColor: '#6d5dfc', primaryButtonTextColor: '#ffffff',
        secondaryButtonBackgroundColor: '#ffffff', secondaryButtonTextColor: '#172033',
        checkboxAccentColor: '#6d5dfc', checkboxCheckColor: '#ffffff', checkboxTextColor: '#172033',
        timelineColor: '#6d5dfc', timelineTrackColor: '#ede9fe', showPromoTitle: false,
        eyebrowFontSize: 12, titleFontSize: 34, bodyFontSize: 16, acknowledgementFontSize: 14,
        buttonFontSize: 16, buttonBorderRadius: 12, borderRadius: 24, maxWidth: 520
      },
      behavior: {
        trigger: 'delay', delayMs: 0, scrollPercent: 35, inactivitySeconds: 8, frequency: 'always',
        cooldownHours: 24, cooldownDays: 7, maxShowsPerSession: 0, device: 'all', autoCloseSeconds: 0,
        rotationSeconds: 6, activeWeekdays: [1, 2, 3, 4, 5, 6, 7], dailyStartTime: '', dailyEndTime: '',
        scheduleTimezone: 'Europe/Kyiv', dismissible: true, requireAcknowledgement: false, buttonCount: 1
      },
      formConfig: { fields: [], blocks: [], submitLabel: '', successTitle: '', successBody: '' }, promoCode: null
    },
    product: null, products: [], recommendations: []
  };
}

async function storefront(page: Page, data: PopupPreviewPayload, events: string[]) {
  const scriptResponse = await page.request.get('http://localhost:4175/api/public/popup-banners/embed.js', {
    headers: { 'x-forwarded-host': 'panel.example.test', 'x-forwarded-proto': 'http' }
  });
  expect(scriptResponse.ok()).toBe(true);
  const script = await scriptResponse.text();
  await page.route('http://panel.example.test/api/public/popup-banners/embed.js', (route) => route.fulfill({
    contentType: 'application/javascript', body: script
  }));
  await page.clock.install({ time: new Date('2026-09-08T10:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-08T10:00:01Z'));
  await page.route('http://shop.example.test/**', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><button id="store-button">Каталог</button><script src="http://panel.example.test/api/public/popup-banners/embed.js"></script></body></html>'
  }));
  await page.route('**/api/public/popup-banners/resolve?**', (route) => route.fulfill({
    json: { data }, headers: { 'access-control-allow-origin': '*' }
  }));
  await page.route('**/api/public/popup-banners/events', (route) => {
    if (route.request().method() === 'POST') events.push(route.request().postDataJSON().eventType);
    return route.fulfill({ status: 204, headers: {
      'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type'
    } });
  });
}

async function openStore(page: Page, url: string) {
  await Promise.all([page.waitForResponse('**/api/public/popup-banners/resolve?**'), page.goto(url)]);
  await page.clock.runFor(100);
}

for (const surface of [
  { name: 'desktop', device: devices['Desktop Chrome'] },
  { name: 'mobile', device: devices['iPhone 13'] }
]) {
  test.describe(`countdown storefront ${surface.name}`, () => {
    test.use({
      userAgent: surface.device.userAgent, viewport: surface.device.viewport,
      deviceScaleFactor: surface.device.deviceScaleFactor,
      isMobile: surface.device.isMobile, hasTouch: surface.device.hasTouch
    });

    test('personal timer survives navigation, reload and content revisions, then hides permanently', async ({ page }, testInfo) => {
      const data = payload();
      data.campaign.behavior.delayMs = 1000;
      const events: string[] = [];
      await storefront(page, data, events);
      await openStore(page, 'http://shop.example.test/sale/');
      const timer = page.getByRole('timer');
      const key = 'mt-popup-timer:' + data.campaign.publicId + ':duration:1';
      await expect(timer).toHaveCount(0);
      expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
      await page.clock.runFor(1000);
      await expect(timer).toBeVisible();
      await expect(timer.locator('strong')).toHaveText(['00', '00', '01', '00']);
      const deadline = await page.evaluate((key) => localStorage.getItem(key), key);
      expect(Number(deadline)).toBeGreaterThan(0);
      expect(await timer.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      const bounds = await timer.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      await page.screenshot({ path: testInfo.outputPath('countdown.png') });

      await page.clock.fastForward(20000);
      await expect(timer.locator('strong').last()).toHaveText('40');
      data.campaign.revision = 'edited-copy';
      data.campaign.behavior.delayMs = 0;
      const resolved = page.waitForResponse('**/api/public/popup-banners/resolve?**');
      await page.evaluate(() => history.pushState({}, '', '/spa-product/'));
      await page.clock.runFor(1000);
      await resolved;
      await page.clock.runFor(100);
      await expect(timer).toBeVisible();
      expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(deadline);
      await openStore(page, 'http://shop.example.test/another-product/');
      await expect(timer).toBeVisible();
      expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(deadline);
      await Promise.all([page.waitForResponse('**/api/public/popup-banners/resolve?**'), page.reload()]);
      await page.clock.runFor(100);
      await expect(timer).toBeVisible();
      expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(deadline);
      await page.clock.fastForward(40000);
      await expect(page.locator('#mt-popup-banner-root')).toHaveCount(0);
      await openStore(page, 'http://shop.example.test/sale/');
      await expect(page.locator('#mt-popup-banner-root')).toHaveCount(0);
      expect(events.filter((event) => event === 'impression')).toHaveLength(4);
      expect(events).not.toContain('dismiss');
    });

    test('fixed deadline hides an open banner and prevents showing a timer that expired during its trigger delay', async ({ page }) => {
      const data = payload();
      data.campaign.timerConfig = { mode: 'deadline', durationMinutes: 15, deadlineAt: '2026-09-08T10:00:04Z' };
      const events: string[] = [];
      await storefront(page, data, events);
      await openStore(page, 'http://shop.example.test/sale/');
      await expect(page.getByRole('timer')).toBeVisible();
      await page.clock.fastForward(4000);
      await expect(page.locator('#mt-popup-banner-root')).toHaveCount(0);
      const time = await page.evaluate(() => Date.now());
      data.campaign.timerConfig.deadlineAt = new Date(time + 1000).toISOString();
      data.campaign.behavior.delayMs = 2000;
      await openStore(page, 'http://shop.example.test/next/');
      await page.clock.fastForward(3000);
      await expect(page.locator('#mt-popup-banner-root')).toHaveCount(0);
      expect(events.filter((event) => event === 'impression')).toHaveLength(1);
      expect(events).not.toContain('dismiss');
    });
  });
}
