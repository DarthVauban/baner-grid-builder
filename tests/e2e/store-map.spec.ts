import { devices, expect, test } from '@playwright/test';

const publicMapData = {
  settings: {
    publicId: '00000000-0000-4000-8000-000000000001',
    title: 'Мапа магазинів',
    markerSvg: '',
    markerWidth: 42,
    markerHeight: 52,
    markerAnchorX: 21,
    markerAnchorY: 51,
    centerLatitude: 49.2,
    centerLongitude: 31.1,
    defaultZoom: 6,
    updatedAt: '2026-09-16T08:00:00.000Z'
  },
  points: [
    {
      id: '00000000-0000-4000-8000-000000000101',
      externalId: 'TT-101',
      name: 'м. Київ, Центр',
      city: 'Київ',
      address: 'вул. Хрещатик, 1',
      hoursText: '09:00 - 20:00',
      schedule: { timezone: 'Europe/Kyiv', days: {} },
      publicationStatus: 'ACTIVE',
      openStatusOverride: 'AUTO',
      latitude: 50.4501,
      longitude: 30.5234,
      createdAt: '2026-09-16T08:00:00.000Z',
      updatedAt: '2026-09-16T08:00:00.000Z'
    },
    {
      id: '00000000-0000-4000-8000-000000000102',
      externalId: 'TT-102',
      name: 'м. Львів, Центр',
      city: 'Львів',
      address: 'просп. Свободи, 1',
      hoursText: '09:00 - 20:00',
      schedule: { timezone: 'Europe/Kyiv', days: {} },
      publicationStatus: 'ACTIVE',
      openStatusOverride: 'AUTO',
      latitude: 49.8397,
      longitude: 24.0297,
      createdAt: '2026-09-16T08:00:00.000Z',
      updatedAt: '2026-09-16T08:00:00.000Z'
    }
  ],
  cities: ['Київ', 'Львів']
};

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
