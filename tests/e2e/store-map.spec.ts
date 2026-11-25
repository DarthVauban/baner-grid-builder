import { devices, expect, test } from '@playwright/test';
import type { PublicStoreMapData } from '../../client/src/types/store-map';

const publicMapData = {
  settings: {
    title: 'Мапа магазинів',
    markerSvg: '',
    markerWidth: 42,
    markerHeight: 52,
    markerAnchorX: 21,
    markerAnchorY: 51,
    centerLatitude: 49.2,
    centerLongitude: 31.1,
    defaultZoom: 6
  },
  points: [
    {
      id: '00000000-0000-4000-8000-000000000101',
      name: 'м. Київ, Центр',
      city: 'Київ',
      address: 'вул. Хрещатик, 1',
      hoursText: '09:00 - 20:00',
      schedule: { timezone: 'Europe/Kyiv', days: {} },
      openStatusOverride: 'AUTO',
      latitude: 50.4501,
      longitude: 30.5234
    },
    {
      id: '00000000-0000-4000-8000-000000000102',
      name: 'м. Львів, Центр',
      city: 'Львів',
      address: 'просп. Свободи, 1',
      hoursText: '09:00 - 20:00',
      schedule: { timezone: 'Europe/Kyiv', days: {} },
      openStatusOverride: 'AUTO',
      latitude: 49.8397,
      longitude: 24.0297
    }
  ],
  cities: ['Київ', 'Львів']
} satisfies PublicStoreMapData;

const emptyMapStyle = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eaf0e5' } }]
};

const surfaces = [
  { name: 'desktop', device: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
  { name: 'mobile', device: devices['iPhone 13'] }
] as const;

test('store map loads OpenFreeMap on independent desktop and mobile surfaces', async ({ browser }) => {
  for (const surface of surfaces) {
    const context = await browser.newContext({
      viewport: surface.device.viewport,
      userAgent: surface.device.userAgent,
      deviceScaleFactor: surface.device.deviceScaleFactor,
      hasTouch: surface.device.hasTouch,
      isMobile: surface.device.isMobile
    });
    const page = await context.newPage();
    const openFreeMapRequests: string[] = [];
    const legacyTileRequests: string[] = [];
    const workerPolicies: string[] = [];

    page.on('request', (request) => {
      if (request.url().startsWith('https://tiles.openfreemap.org/')) openFreeMapRequests.push(request.url());
      if (request.url().includes('tile.openstreetmap.org')) legacyTileRequests.push(request.url());
    });
    page.on('response', (response) => {
      if (!response.url().includes('/web-assets/maplibre-gl-worker-')) return;
      workerPolicies.push(response.headers()['content-security-policy'] || '');
    });
    await page.route('**/api/public/store-map**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: publicMapData })
    }));
    await page.route('https://tiles.openfreemap.org/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(emptyMapStyle)
    }));

    await page.goto('/store-map/widget');
    await expect(page.locator('.maplibregl-canvas')).toBeVisible();
    await expect(page.locator('.store-map-marker')).toHaveCount(2);
    await expect(page.locator('.store-map-widget-card')).toHaveCount(2);
    const kyivMarker = page.getByRole('button', { name: 'м. Київ, Центр' });
    const kyivCard = page.locator('.store-map-widget-card').filter({ hasText: 'м. Київ, Центр' });
    const lvivCard = page.locator('.store-map-widget-card').filter({ hasText: 'м. Львів, Центр' });
    await kyivMarker.click();
    await expect(page.locator('.store-map-popup')).toContainText('вул. Хрещатик, 1');
    const popupIsAboveMarker = await page.locator('.store-map-popup-shell .maplibregl-popup-content').evaluate((content) => {
      const popup = content.closest('.store-map-popup-shell');
      const markerLayer = document.querySelector('.maplibregl-canvas-container');
      if (!popup || !markerLayer) return false;
      const popupBounds = content.getBoundingClientRect();
      const layerBounds = markerLayer.getBoundingClientRect();
      const centerX = popupBounds.left + popupBounds.width / 2;
      const centerY = popupBounds.top + popupBounds.height / 2;
      const overlappingMarker = document.createElement('button');
      overlappingMarker.className = 'store-map-marker maplibregl-marker';
      overlappingMarker.style.left = `${centerX - layerBounds.left - 21}px`;
      overlappingMarker.style.top = `${centerY - layerBounds.top - 26}px`;
      overlappingMarker.style.width = '42px';
      overlappingMarker.style.height = '52px';
      overlappingMarker.style.zIndex = '2';
      markerLayer.appendChild(overlappingMarker);
      const topmost = document.elementFromPoint(centerX, centerY);
      overlappingMarker.remove();
      return topmost?.closest('.store-map-popup-shell') === popup;
    });
    expect(popupIsAboveMarker).toBe(true);
    await expect(kyivCard).toHaveClass(/store-map-widget-card--selected/u);
    await expect(kyivCard.locator('.store-map-widget-card__selected-label')).toHaveText('Обрано');
    const selectedBackground = await kyivCard.evaluate((node) => getComputedStyle(node).backgroundColor);
    const otherBackground = await lvivCard.evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(selectedBackground).not.toBe(otherBackground);
    await kyivMarker.click();
    await expect(page.locator('.store-map-popup')).toBeVisible();
    await lvivCard.click();
    await expect(page.locator('.store-map-popup')).toContainText('просп. Свободи, 1');
    await expect(lvivCard).toHaveClass(/store-map-widget-card--selected/u);
    await expect(kyivCard).not.toHaveClass(/store-map-widget-card--selected/u);
    expect(openFreeMapRequests.some((url) => url.includes('/styles/positron'))).toBe(true);
    expect(legacyTileRequests).toEqual([]);
    expect(workerPolicies).not.toEqual([]);
    expect(workerPolicies.every((policy) => policy.includes('https://tiles.openfreemap.org'))).toBe(true);

    const mapBounds = await page.locator('.store-map-widget__map').boundingBox();
    const directoryBounds = await page.locator('.store-map-widget__directory').boundingBox();
    expect(mapBounds).not.toBeNull();
    expect(directoryBounds).not.toBeNull();
    if (surface.name === 'mobile') {
      expect(await page.evaluate(() => navigator.userAgent)).toMatch(/Mobile|iPhone/u);
      expect(directoryBounds!.y).toBeGreaterThanOrEqual(mapBounds!.y + mapBounds!.height);
    } else {
      expect(await page.evaluate(() => navigator.userAgent)).not.toMatch(/Mobile|iPhone/u);
      expect(directoryBounds!.x).toBeGreaterThan(mapBounds!.x + mapBounds!.width);
    }

    await context.close();
  }
});

for (const surface of surfaces) {
  test(`store map frame allows the storefront and blocks other parents on ${surface.name}`, async ({ browser, baseURL }) => {
    const context = await browser.newContext(surface.device);
    try {
      const page = await context.newPage();
      const panel = 'https://mt-panel.sbs';
      const storefront = 'https://mobiletrend.com.ua';
      const other = 'https://untrusted.example';
      await page.route(`${panel}/**`, async (route) => {
        const url = new URL(route.request().url());
        const response = await route.fetch({ url: new URL(url.pathname + url.search, baseURL).href });
        await route.fulfill({ response });
      });
      await page.route(`${panel}/api/public/store-map`, (route) => route.fulfill({ json: { data: publicMapData } }));
      await page.route('https://tiles.openfreemap.org/**', (route) => route.fulfill({ json: emptyMapStyle }));

      for (const origin of [storefront, other]) {
        await page.route(`${origin}/map-embed-test`, (route) => route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><title>Map parent</title><iframe title="Store map" src="${panel}/store-map/widget"></iframe>`
        }));
      }

      await page.goto(`${storefront}/map-embed-test`);
      const frame = page.frameLocator('iframe[title="Store map"]');
      await expect(frame.locator('.store-map-widget')).toBeVisible();

      const cspViolation = page.waitForEvent('console', {
        predicate: (message) => /frame-ancestors/u.test(message.text())
      });
      await page.goto(`${other}/map-embed-test`);
      await cspViolation;
      await expect(frame.locator('.store-map-widget')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}
