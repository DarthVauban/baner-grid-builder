import { devices, expect, test, type Locator, type Page } from '@playwright/test';

const emptyStyle = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eaf0e5' } }] };
const surfaces = [
  { name: 'desktop', device: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
  { name: 'mobile', device: devices['iPhone 13'] }
] as const;

async function panUnderFixedPin(page: Page, canvas: Locator, touch: boolean, virtualClock: boolean, whileMoving: () => Promise<void>) {
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toHaveAttribute('aria-busy', 'false');
  const pin = canvas.locator('..').getByRole('img', { name: 'Маркер магазину в центрі карти' });
  const bounds = await canvas.boundingBox();
  const before = await pin.boundingBox();
  expect(bounds).not.toBeNull();
  expect(before).not.toBeNull();
  const x = bounds!.x + bounds!.width * 0.78;
  const y = bounds!.y + bounds!.height * 0.72;
  const session = touch ? await page.context().newCDPSession(page) : null;
  const frame = () => virtualClock ? page.clock.runFor(40) : page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  try {
    if (session) await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    else { await page.mouse.move(x, y); await page.mouse.down(); }
    for (let step = 1; step <= 6; step += 1) {
      const next = { x: x - step * 12, y: y - step * 8 };
      if (session) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...next, id: 1 }] });
      else await page.mouse.move(next.x, next.y);
      await frame();
    }
    await expect(canvas).toHaveAttribute('aria-busy', 'true');
    await whileMoving();
    const during = await pin.boundingBox();
    expect(during!.x).toBeCloseTo(before!.x, 1);
    expect(during!.y).toBeCloseTo(before!.y, 1);
  } finally {
    if (session) { await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach(); }
    else await page.mouse.up();
  }
  if (virtualClock) await page.clock.runFor(1200);
  await expect(canvas).toHaveAttribute('aria-busy', 'false');
  const after = await pin.boundingBox();
  expect(after!.x + after!.width / 2).toBeCloseTo(bounds!.x + bounds!.width / 2, 0);
  expect(after!.y + after!.height / 2).toBeCloseTo(bounds!.y + bounds!.height / 2, 0);
}

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
    const linkUrl = await workspace.getByLabel('Посилання на форму').inputValue();
    expect(new URL(linkUrl).pathname).toBe('/store-map/register');
    expect(new URL(linkUrl).hash).toBe('');
    await expect(workspace.getByRole('button', { name: 'Копіювати посилання' })).toBeVisible();
    await expect(workspace.getByRole('button', { name: 'Створити посилання' })).toHaveCount(0);
    await workspace.reload();
    await workspace.getByRole('tab', { name: /Заявки/ }).click();
    await expect(workspace.getByLabel('Посилання на форму')).toHaveValue(linkUrl);
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
    await seller.setGeolocation({ latitude: 50.4501, longitude: 30.5234, accuracy: 7 });
    await expect(page.getByText('Орієнтовний радіус похибки: 7 м', { exact: true })).toBeVisible();
    await expect(page.locator('.maplibregl-canvas')).toBeVisible();
    await page.clock.fastForward(60_000);
    await expect(page.getByRole('button', { name: 'Повторити замір' })).toBeEnabled();
    const sellerCanvas = page.locator('.store-map-coordinate-canvas');
    const initialCoordinates = await page.locator('.store-registration-coordinates').textContent();
    if (surface.name === 'mobile') await sellerCanvas.tap({ position: { x: 100, y: 100 } });
    else await sellerCanvas.click({ position: { x: 100, y: 100 } });
    await expect(page.locator('.store-registration-coordinates')).toHaveText(initialCoordinates!);
    await page.getByRole('checkbox').check();
    const panSeller = () => panUnderFixedPin(page, sellerCanvas, surface.name === 'mobile', true, async () => {
      await expect(page.getByRole('checkbox')).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Надіслати заявку', exact: true })).toBeDisabled();
    });
    await panSeller();
    await expect(page.getByRole('checkbox')).not.toBeChecked();
    await page.getByRole('button', { name: 'Повернути карту до заміру телефону' }).click();
    await expect(page.locator('.store-registration-coordinates')).toHaveText(initialCoordinates!);
    await panSeller();
    await expect(page.locator('.store-registration-coordinates')).toContainText('уточнено вручну');
    await page.getByRole('checkbox').check();
    await page.screenshot({ path: testInfo.outputPath(`store-map-seller-${surface.name}.png`), fullPage: true });
    await expect(page.getByRole('checkbox')).toBeChecked();
    await expect(page.getByRole('button', { name: 'Надіслати заявку', exact: true })).toBeEnabled();
    const submitted = page.waitForResponse((response) => response.url().endsWith('/api/public/store-map/registration') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Надіслати заявку', exact: true }).click();
    const response = await submitted;
    expect(response.ok()).toBe(true);
    const payload = response.request().postDataJSON();
    expect(payload.submissionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.request().headers()['authorization']).toBeUndefined();
    expect(payload).not.toHaveProperty('externalId');
    expect(payload.measurement.accuracy).toBe(7);
    expect(payload.measurement.latitude).toBe(50.4501);
    expect(payload.latitude === payload.measurement.latitude && payload.longitude === payload.measurement.longitude).toBe(false);
    await expect(page.getByRole('heading', { name: 'Заявку отримано' })).toBeVisible();
    await page.getByRole('button', { name: 'Зареєструвати ще один магазин' }).click();
    await expect(page.getByLabel('Назва магазину', { exact: true })).toHaveValue('');
    await expect(page.getByRole('checkbox')).toBeDisabled();
    await expect(page.locator('.store-registration-coordinates')).toHaveCount(0);
    const secondName = `Інший магазин ${surface.name} ${Date.now()}`;
    await page.getByLabel('Назва магазину', { exact: true }).fill(secondName);
    await page.getByLabel('Місто', { exact: true }).fill('Київ');
    await page.getByLabel('Адреса', { exact: true }).fill('Хрещатик, 2');
    await page.clock.setSystemTime(new Date());
    await page.getByRole('button', { name: 'Визначити місцезнаходження' }).click();
    await seller.setGeolocation({ latitude: 50.451, longitude: 30.524, accuracy: 6 });
    await expect(page.getByText('Орієнтовний радіус похибки: 6 м', { exact: true })).toBeVisible();
    await page.clock.fastForward(15_000);
    await page.getByRole('button', { name: 'Завершити замір' }).click();
    await page.getByRole('checkbox').check();
    const secondSubmitted = page.waitForResponse((result) => result.url().endsWith('/api/public/store-map/registration') && result.request().method() === 'POST');
    await page.getByRole('button', { name: 'Надіслати заявку', exact: true }).click();
    const secondResponse = await secondSubmitted;
    expect(secondResponse.ok()).toBe(true);
    expect(secondResponse.request().postDataJSON().submissionId).not.toBe(payload.submissionId);
    await expect(page.getByRole('heading', { name: 'Заявку отримано' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Додайте свій магазин' })).toBeVisible();
    await expect(page.getByLabel('Назва магазину', { exact: true })).toHaveValue('');
    const before = (await (await request.get('/api/public/store-map')).json()).data.points;
    expect(before.some((point: { name: string }) => point.name === name)).toBe(false);

    await workspace.getByRole('button', { name: 'Оновити', exact: true }).click();
    await expect(workspace.locator('.store-map-request-card').filter({ hasText: secondName })).toHaveCount(1);
    await workspace.locator('.store-map-request-card').filter({ hasText: name }).click();
    const dialog = workspace.getByRole('dialog');
    await expect(dialog.getByText('Орієнтовний радіус похибки: 7 м', { exact: true })).toBeVisible();
    await expect(workspace.frameLocator('iframe[title="Карта координат заявки"]').locator('.maplibregl-canvas')).toBeVisible();
    await dialog.getByLabel('Назва магазину', { exact: true }).fill(`${name} — перевірено`);
    const reviewCanvas = workspace.frameLocator('iframe[title="Карта координат заявки"]').locator('.store-map-coordinate-canvas');
    await panUnderFixedPin(workspace, reviewCanvas, false, false, async () => {
      await expect(dialog.getByRole('button', { name: 'Схвалити й додати магазин' })).toBeDisabled();
    });
    const selectedLatitude = Number(await dialog.getByLabel('Широта магазину', { exact: true }).inputValue());
    const selectedLongitude = Number(await dialog.getByLabel('Довгота магазину', { exact: true }).inputValue());
    await workspace.screenshot({ path: testInfo.outputPath(`store-map-review-${surface.name}.png`), fullPage: true });
    const approvedResponse = workspace.waitForResponse((result) => result.url().endsWith('/approve') && result.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Схвалити й додати магазин' }).click();
    const approved = await approvedResponse;
    expect(approved.ok()).toBe(true);
    const item = (await approved.json()).data;
    expect(item.status).toBe('APPROVED');
    expect(item.latitude).toBe(selectedLatitude);
    expect(item.longitude).toBe(selectedLongitude);
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
