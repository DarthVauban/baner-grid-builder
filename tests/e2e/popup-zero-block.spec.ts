import { devices, expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { createElement } from '../../src/modules/popup-banners/zero-block/document.mjs';
import { enableFormFlow } from '../../src/modules/popup-banners/zero-block/form-flow.mjs';
import type { PopupDocument, Widget } from '../../client/src/popup-banners/zero-block/types';

const tool = '/tools/popup-banners';
const api = '/api/popup-banners/zero-block';
type Fixture = { token: string; store: string };
const editor = (page: Page) => page.getByRole('region', { name: 'Конструктор Zero Block' });

async function reset(request: APIRequestContext): Promise<Fixture> {
  const response = await request.post('/__e2e/zero-block/reset');
  expect(response.ok()).toBe(true);
  return response.json();
}

async function openWorkspace(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('e2e-admin@test.local');
  await page.locator('input[name="password"]').fill('E2E-admin-password-2026');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page.getByRole('heading', { name: 'Вітаємо, E2E' })).toBeVisible();
  await page.goto(tool);
  await page.getByRole('button', { name: 'Нова кампанія' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Zero Block/ }).click();
  await page.getByRole('textbox', { name: 'Назва кампанії' }).fill('Весняна пропозиція');
  await page.getByRole('button', { name: 'Створити чернетку' }).click();
  await expect(editor(page)).toBeVisible();
}

test('the workspace editor keeps canvas nodes, saves independent designs and restores the draft', async ({ page, request }, info) => {
  await reset(request);
  await openWorkspace(page);
  const shell = editor(page);
  await shell.getByRole('button', { name: 'Текст', exact: true }).click();
  const text = page.locator('[data-element-id]').filter({ hasText: 'Новий текст' }).first();
  await expect(text).toBeVisible();
  await text.evaluate((node) => { (node as HTMLElement).dataset.testIdentity = 'same-node'; });
  await shell.getByRole('button', { name: 'Фігура', exact: true }).click();
  await expect(page.locator('[data-test-identity="same-node"]')).toBeVisible();
  await shell.getByRole('button', { name: 'Скасувати', exact: true }).click();
  await shell.getByRole('button', { name: 'Форма', exact: true }).click();
  await expect(page.locator('[data-element-id][data-type="form"]')).toHaveCount(1);
  await shell.getByRole('button', { name: 'Скасувати', exact: true }).click();
  const resize = page.getByRole('button', { name: 'Змінити ширину полотна' });
  await resize.press('ArrowRight');
  await expect(resize).toHaveAttribute('title', /970 px/u);
  await shell.getByRole('button', { name: 'Телефон', exact: true }).click();
  await expect(resize).toHaveAttribute('title', /360 px/u);
  await shell.getByRole('button', { name: 'Комп’ютер', exact: true }).click();
  await shell.getByRole('button', { name: 'Правила показу' }).click();
  await shell.getByRole('switch', { name: 'Дата й час' }).check();
  const date = shell.getByRole('button', { name: 'Початок: дата' });
  const time = shell.getByRole('button', { name: 'Початок: час' });
  await date.click();
  await expect(page.getByRole('grid')).toBeVisible();
  await time.click();
  const hours = page.getByRole('listbox', { name: 'Години' });
  await hours.getByRole('option', { name: '00', exact: true }).press('ArrowDown');
  await expect(hours.getByRole('option', { name: '01', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(time).toBeFocused();
  await page.screenshot({ path: info.outputPath('zero-block-rules-desktop.png') });
  await shell.getByRole('button', { name: 'До дизайну' }).click();
  await expect(page.locator('[data-test-identity="same-node"]')).toBeVisible();
  await shell.getByRole('button', { name: 'Зберегти', exact: true }).click();
  await expect(shell.getByRole('status').filter({ hasText: 'Чернетку збережено.' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('zero-block-editor-desktop.png') });
  await shell.getByRole('button', { name: 'Перегляд', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Закрити перегляд' })).toBeVisible();
  await page.reload();
  await expect(editor(page).getByText('Весняна пропозиція')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Змінити ширину полотна' })).toHaveAttribute('title', /970 px/u);
  await expect(page.locator('.popup-toggle').first()).toHaveCSS('display', 'flex');
});

test.describe('the workspace at phone width', () => {
  const phone = devices['iPhone 13'];
  test.use({ viewport: phone.viewport, userAgent: phone.userAgent, hasTouch: phone.hasTouch,
    isMobile: phone.isMobile, deviceScaleFactor: phone.deviceScaleFactor });
  test('touch opens the palette and its menu remains within the viewport', async ({ page, request }, info) => {
    await reset(request);
    await openWorkspace(page);
    const shell = editor(page);
    await shell.getByRole('button', { name: 'Телефон', exact: true }).tap();
    await page.screenshot({ path: info.outputPath('zero-block-editor-mobile.png'), fullPage: true });
    const paletteTrigger = shell.getByRole('button', { name: 'Відкрити палітру: Фон полотна' });
    await paletteTrigger.tap();
    const palette = page.locator('[data-color-picker]').first();
    await expect(palette).toBeVisible();
    const box = await palette.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    const type = palette.getByRole('button', { name: 'Тип кольору' });
    await type.tap();
    await expect(page.getByRole('listbox', { name: 'Тип кольору' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette).toBeVisible();
    await expect(type).toBeFocused();
    await type.tap();
    await page.getByRole('option', { name: /лінійн/iu }).tap();
    await expect(palette.getByRole('slider', { name: 'Позиція кольору 1' })).toBeVisible();
    await page.screenshot({ path: info.outputPath('zero-block-palette-mobile.png') });
  });
});

async function createCampaign(request: APIRequestContext, fixture: Fixture, name: string, priority: number, rules: PopupDocument['rules']['rules'], reward = false) {
  const headers = { Authorization: 'Bearer ' + fixture.token };
  const initial = await request.post(api, { headers, data: { name } });
  expect(initial.status()).toBe(201);
  const { data: draft }: { data: Widget } = await initial.json();
  const text = createElement('text');
  text.content.text = name;
  text.desktop = { x: 30, y: 40, width: 460, height: 80 };
  text.mobile = { x: 20, y: 30, width: 280, height: 100 };
  const document = { ...draft.document, priority, desktop: { ...draft.document.desktop, width: 580 },
    mobile: { ...draft.document.mobile, width: 360 }, rules: { schemaVersion: 1, rules }, elements: [text] };
  if (reward) {
    const form = createElement('form');
    const content = enableFormFlow(form.content, true);
    for (const field of content.fields) field.required = true;
    content.flow.reward.promo.value = 'ZERO-QA-REWARD';
    form.content = content;
    form.desktop = { x: 44, y: 120, width: 350, height: 300 };
    form.mobile = { x: 20, y: 140, width: 320, height: 360 };
    document.forms.push({ id: content.formId, name: 'Форма з винагородою' });
    document.elements.push(form);
  }
  const path = api + '/' + draft.widgetId;
  const saved = await request.patch(path, { headers, data: { revision: draft.revision, document } });
  expect(saved.ok(), await saved.text()).toBe(true);
  const { data: widget }: { data: Widget } = await saved.json();
  const published = await request.post(path + '/publish', { headers, data: {
    draftRevision: widget.revision, campaignRevision: widget.campaignRevision, operationId: crypto.randomUUID()
  } });
  expect(published.ok(), await published.text()).toBe(true);
}

for (const surface of [{ name: 'desktop', device: devices['Desktop Chrome'] }, { name: 'mobile', device: devices['iPhone 13'] }]) {
  test.describe('actual Horoshop release on ' + surface.name, () => {
    test.use({ userAgent: surface.device.userAgent, viewport: surface.device.viewport,
      deviceScaleFactor: surface.device.deviceScaleFactor, isMobile: surface.device.isMobile, hasTouch: surface.device.hasTouch });
    test('checks SRI, priority, legacy coexistence and query-only navigation', async ({ page, request }, info) => {
      test.setTimeout(50_000);
      const fixture = await reset(request);
      const urlRule = (path: string) => ({ type: 'url', include: [path], exclude: [] });
      await createCampaign(request, fixture, 'Швидкий банер', 10, [urlRule('/priority')]);
      await createCampaign(request, fixture, 'Пріоритетний банер', 20, [urlRule('/priority'), { type: 'delay', seconds: 1 }]);
      await createCampaign(request, fixture, 'Zero Block перед чинним попапом', 30, [urlRule('/mixed')]);
      await createCampaign(request, fixture, 'Вища кампанія зі сховищем', 100, [
        urlRule('/mixed'), { type: 'delay', seconds: 2 }, { type: 'daily_frequency', max: 1 }
      ]);
      await createCampaign(request, fixture, 'Банер для UTM', 40, [urlRule('/utm'), { type: 'utm', params: { utm_source: 'new' } }]);
      await createCampaign(request, fixture, 'Лише мобільна ширина', 40, [urlRule('/narrow'), { type: 'device', value: 'mobile' }]);
      await createCampaign(request, fixture, 'Банер із винагородою', 40, [urlRule('/reward')], true);
      const release = await request.post('/api/horoshop-widgets/releases', { headers: { Authorization: 'Bearer ' + fixture.token } });
      expect(release.status()).toBe(201);
      await page.clock.install();
      const embed: string = (await release.json()).data.embedCode;
      const auditedRequests: URL[] = [];
      let runtimeAsset: { path: string; integrity: string } | undefined;
      let tamper = false;
      let rejectResolve = false;
      await page.route('http://localhost:4175/api/public/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/resolve')) {
          auditedRequests.push(url);
          if (rejectResolve) {
            await route.fulfill({ status: 503, headers: { 'Access-Control-Allow-Origin': '*' } });
            return;
          }
        }
        const real = await request.fetch(route.request().url(), { method: route.request().method(),
          headers: route.request().headers(), data: route.request().postDataBuffer() || undefined });
        if (url.pathname.endsWith('.js')) {
          const body = await real.text();
          const match = /const zeroBlockRuntimeAsset = (\{[^\n]+\});/u.exec(body);
          if (match) runtimeAsset = JSON.parse(match[1]);
          if (tamper && url.pathname === runtimeAsset?.path) {
            await route.fulfill({ response: real, body: body + '\nwindow.__zeroBlockTampered = true;' });
            return;
          }
        }
        await route.fulfill({ response: real });
      });
      await page.route('https://**' + fixture.store + '/**', (route) => route.fulfill({ contentType: 'text/html',
        body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
          + '<body><h1>Тестова вітрина Хорошопа</h1><button>Каталог</button>' + embed + '</body>'
      }));
      const visit = (path: string, www = false) => page.goto('https://' + (www ? 'www.' : '') + fixture.store + path);
      const legacy = page.locator('#mt-popup-banner-root');
      const zero = page.locator('[data-mt-zero-block]');
      await visit('/priority/');
      await expect(zero.getByText('Швидкий банер', { exact: true })).toBeVisible();
      await expect(zero.getByText('Пріоритетний банер', { exact: true })).toBeVisible();
      await expect(zero).toHaveCount(1);
      await expect(zero.locator('[data-kk-artboard]')).toHaveAttribute('data-device', surface.name);
      const frame = await zero.locator('.kk-frame').boundingBox();
      expect(frame!.width).toBeGreaterThan(surface.name === 'mobile' ? 300 : 500);
      expect(frame!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      expect(runtimeAsset?.integrity).toMatch(/^sha384-/u);
      await expect(page.locator('script[src$="' + runtimeAsset!.path + '"]')).toHaveAttribute('integrity', runtimeAsset!.integrity);
      await page.screenshot({ path: info.outputPath('zero-block-storefront-' + surface.name + '.png') });

      await page.addInitScript(() => {
        const set = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key.startsWith('kk:v1:')) throw new DOMException('Fixture quota', 'QuotaExceededError');
          return set.call(this, key, value);
        };
      });
      await visit('/mixed/');
      await expect(zero.getByText('Zero Block перед чинним попапом')).toBeVisible();
      await expect(legacy.getByRole('heading', { name: 'Чинний попап Хорошопа' })).toBeVisible();
      await expect(zero).toHaveCount(0);
      await page.waitForTimeout(1000);
      await expect(legacy).toBeVisible();
      await visit('/utm/?utm_source=old', true);
      await expect(zero).toHaveCount(0);
      const count = auditedRequests.length;
      await page.evaluate(() => history.pushState({}, '', '?utm_source=new'));
      await expect(zero.getByText('Банер для UTM')).toBeVisible({ timeout: 3000 });
      expect(auditedRequests.length).toBe(count);
      expect(auditedRequests.every((url) => !url.searchParams.get('pageUrl')?.includes('?'))).toBe(true);

      rejectResolve = true;
      await page.clock.fastForward(31_000);
      await expect(zero).toHaveCount(0);
      rejectResolve = false;
      await page.clock.fastForward(31_000);
      await expect(zero.getByText('Банер для UTM')).toBeVisible();

      await visit('/reward/');
      await expect(zero.getByText('ZERO-QA-REWARD')).toHaveCount(0);
      await zero.getByPlaceholder('mail@example.com').fill('buyer@example.test');
      await zero.getByRole('button', { name: 'Далі' }).click();
      await zero.getByPlaceholder('Іван Іваненко').fill('Олена');
      const confirmation = page.waitForResponse((response) => response.url().endsWith('/submit') && response.request().method() === 'POST');
      await zero.getByRole('button', { name: 'Надіслати' }).click();
      expect((await confirmation).status()).toBe(201);
      await expect(zero.getByText('ZERO-QA-REWARD')).toBeVisible();

      if (surface.name === 'desktop') {
        await visit('/narrow/');
        await expect(zero).toHaveCount(0);
        await page.setViewportSize({ width: 600, height: 720 });
        await expect(zero.getByText('Лише мобільна ширина')).toBeVisible();
        tamper = true;
        await visit('/mixed/');
        await expect(legacy).toBeVisible();
        await expect(zero).toHaveCount(0);
        expect(await page.evaluate(() => Object.hasOwn(window, '__zeroBlockTampered'))).toBe(false);
      }
    });
  });
}
