import { devices, expect, test } from '@playwright/test';

const emptyStyle = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eaf0e5' } }] };
const surfaces = [
  { name: 'desktop', device: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
  { name: 'mobile', device: devices['iPhone 13'] }
] as const;

for (const surface of surfaces) {
  test(`seller registration, location review and approval work on ${surface.name}`, async ({ browser, request }, testInfo) => {
    test.setTimeout(90_000);
    await request.post('/api/auth/login', { data: { email: 'e2e-admin@test.local', password: 'E2E-admin-password-2026' } });
    const errors: string[] = [];
    const admin = await browser.newContext({ storageState: await request.storageState(), viewport: { width: 1440, height: 1000 } });
    await admin.route('https://tiles.openfreemap.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emptyStyle) }));
    const workspace = await admin.newPage();
    workspace.on('pageerror', (error) => errors.push(error.message));
    await workspace.goto('/tools/store-map');
    await workspace.getByRole('tab', { name: /Заявки/ }).click();
    await workspace.getByRole('button', { name: 'Посилання для продавця' }).click();
    const linkDialog = workspace.getByRole('dialog');
    await linkDialog.getByLabel('Примітка для вас (необов’язково)').fill(surface.name);
    await linkDialog.getByRole('button', { name: 'Створити посилання' }).click();
    const linkUrl = await linkDialog.getByLabel('Посилання на форму').inputValue();
    const token = new URL(linkUrl).hash.slice(1);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await linkDialog.getByRole('button', { name: 'Готово', exact: true }).click();
    const seller = await browser.newContext({ ...surface.device, permissions: ['geolocation'], geolocation: { latitude: 50.4501, longitude: 30.5234, accuracy: 7 } });
    await seller.route('https://tiles.openfreemap.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emptyStyle) }));
    const page = await seller.newPage();
    const name = `Тестова ТТ ${surface.name} ${Date.now()}`;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(linkUrl);
    await expect(page.getByRole('heading', { name: 'Додайте свій магазин' })).toBeVisible();
    await expect(page.getByLabel(/Код магазину|ID із зовнішньої системи/)).toHaveCount(0);
    expect(await page.evaluate(() => navigator.userAgent)).toMatch(surface.name === 'mobile' ? /Mobile|iPhone/u : /Chrome/u);
    await page.getByLabel('Назва магазину', { exact: true }).fill(name);
    await page.getByLabel('Місто', { exact: true }).fill('Київ');
    await page.getByLabel('Адреса', { exact: true }).fill('Хрещатик, 1');
    await page.getByLabel('Коментар (необов’язково)', { exact: true }).fill('Вхід з вулиці');
    await page.clock.install();
    await page.getByRole('button', { name: 'Визначити місцезнаходження' }).click();
    await expect(page.getByText('Орієнтовний радіус похибки: 7 м', { exact: true })).toBeVisible();
    await expect(page.locator('.maplibregl-canvas')).toBeVisible();
    await page.clock.fastForward(60_000);
    await expect(page.getByRole('button', { name: 'Повторити замір' })).toBeEnabled();
    await page.locator('.store-map-coordinate-canvas').click({ position: { x: 140, y: 110 } });
    await expect(page.locator('.store-registration-coordinates')).toContainText('уточнено вручну');
    await page.getByRole('checkbox').check();
    await page.screenshot({ path: testInfo.outputPath(`store-map-seller-${surface.name}.png`), fullPage: true });
    const submitted = page.waitForResponse((response) => response.url().endsWith('/api/public/store-map/registration') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Надіслати заявку', exact: true }).click();
    const response = await submitted;
    expect(response.ok()).toBe(true);
    const payload = response.request().postDataJSON();
    expect(payload).not.toHaveProperty('externalId');
    expect(payload.measurement.accuracy).toBe(7);
    expect(payload.measurement.latitude).toBe(50.4501);
    expect(payload.latitude === payload.measurement.latitude && payload.longitude === payload.measurement.longitude).toBe(false);
    await expect(page.getByRole('heading', { name: 'Заявку отримано' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Заявку отримано' })).toBeVisible();
    const before = (await (await request.get('/api/public/store-map')).json()).data.points;
    expect(before.some((point: { name: string }) => point.name === name)).toBe(false);

    await workspace.getByRole('button', { name: 'Оновити', exact: true }).click();
    await workspace.locator('.store-map-request-card').filter({ hasText: name }).click();
    const dialog = workspace.getByRole('dialog');
    await expect(dialog.getByText('Орієнтовний радіус похибки: 7 м', { exact: true })).toBeVisible();
    await expect(workspace.frameLocator('iframe[title="Карта координат заявки"]').locator('.maplibregl-canvas')).toBeVisible();
    await dialog.getByLabel('Назва магазину', { exact: true }).fill(`${name} — перевірено`);
    await workspace.frameLocator('iframe[title="Карта координат заявки"]').locator('.store-map-coordinate-canvas').click({ position: { x: 260, y: 140 } });
    await workspace.screenshot({ path: testInfo.outputPath(`store-map-review-${surface.name}.png`), fullPage: true });
    const approvedResponse = workspace.waitForResponse((result) => result.url().endsWith('/approve') && result.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Схвалити й додати магазин' }).click();
    const approved = await approvedResponse;
    expect(approved.ok()).toBe(true);
    const item = (await approved.json()).data;
    expect(item.status).toBe('APPROVED');
    expect(item.measurement.latitude).toBe(50.4501);
    expect(item.submittedData.name).toBe(name);
    await expect(workspace.getByRole('dialog')).toHaveCount(0);
    const points = (await (await request.get('/api/public/store-map')).json()).data.points;
    expect(points.find((point: { id: string }) => point.id === item.pointId)).toMatchObject({ name: `${name} — перевірено`, latitude: item.latitude, longitude: item.longitude, externalId: '' });
    expect(errors).toEqual([]);
    await workspace.screenshot({ path: testInfo.outputPath(`store-map-requests-${surface.name}.png`), fullPage: true });
    await seller.close();
    await admin.close();
  });
}
