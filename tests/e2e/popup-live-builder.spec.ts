import { devices, expect, test, type Page } from '@playwright/test';
import { emptyCampaign } from '../../client/src/lib/popup-campaign';
import { createTemplate } from '../../client/src/components/popup-builder/templates';
import { flatten, makeBlock } from '../../client/src/components/popup-builder/block-model';
import { popupBase, startPopupServer } from './support/popup-block-server';

let stop: () => Promise<void>;
test.beforeAll(async () => { stop = await startPopupServer(); });
test.afterAll(async () => { await stop?.(); });
async function login(page: Page) {
  const response = await page.request.post(popupBase + '/api/auth/login', { data: { email: 'popup-live@test.local', password: 'Popup-live-password-2026' } }); expect(response.ok()).toBe(true);
}
async function choose(page: Page, name: string) { await page.getByRole('button', { name: /Шаблони/ }).click(); await page.getByRole('group', { name: 'Шаблони банерів' }).getByRole('button', { name, exact: true }).click(); }

test.describe('live campaign editor', () => {
  test.use({ viewport: { width: 1680, height: 1050 } });
  test('creates, reopens, binds a catalog product, tests and publishes through the real API', async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await login(page); await page.goto(popupBase + '/tools/popup-banners');
    await page.getByRole('link', { name: 'Створити банер', exact: true }).click();
    await choose(page, 'Товарна картка');
    await page.getByLabel('Назва макета').fill('Живий товарний банер');
    await page.getByRole('button', { name: 'Обрати: Товар', exact: true }).click();
    const inspector = page.getByRole('complementary', { name: 'Властивості блока' });
    await inspector.getByLabel('Знайти товар').fill('PHONE-LIVE');
    await inspector.getByRole('button', { name: /Смартфон із живого каталогу/ }).click();
    await expect(page.locator('.pb-node[data-label="Назва товару"]')).toContainText('Смартфон із живого каталогу');
    await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
    await expect(page).toHaveURL(/\/builder\/[a-f0-9-]+$/);
    const id = page.url().split('/').at(-1)!;
    await page.reload(); await expect(page.getByLabel('Назва макета')).toHaveValue('Живий товарний банер');
    await expect(page.locator('.pb-node[data-label="Назва товару"]')).toContainText('Смартфон із живого каталогу');
    await page.getByRole('button', { name: 'Тестувати', exact: true }).click();
    const frame = page.frameLocator('iframe[title="Тестування банера на сайті"]');
    await expect(frame.getByText('Смартфон із живого каталогу', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Розгорнути прев’ю' }).click(); await page.getByRole('button', { name: 'Mobile', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Повернутися до редактора' })).toBeVisible();
    await expect(frame.getByText('Смартфон із живого каталогу', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('live-mobile-preview.png') });
    await page.getByRole('button', { name: 'Повернутися до редактора' }).click();
    await page.getByRole('button', { name: 'Опублікувати', exact: true }).click();
    await expect(page.getByText('Кампанію опубліковано на сайті.', { exact: false })).toBeVisible();
    const stored = await page.request.get(popupBase + '/api/popup-banners/' + id);
    expect((await stored.json()).data.status).toBe('active');
    await page.getByRole('button', { name: 'Редагувати', exact: true }).click();
    await page.locator('.pb-node[data-label="Заголовок"]').click(); await inspector.getByLabel('Текст елемента').fill('Нова чернетка');
    await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
    await expect(page.locator('.pb-server-notice').filter({ hasText: 'Чернетку збережено.' })).toBeVisible();
    const resolved = await page.request.get(popupBase + '/api/public/popup-banners/resolve', { params: { pageUrl: popupBase + '/popup-test-store' } });
    expect(JSON.stringify((await resolved.json()).data.campaign.blockDocument)).not.toContain('Нова чернетка');
    await page.screenshot({ path: testInfo.outputPath('live-editor.png') });
    expect(errors).toEqual([]);
    await page.request.delete(popupBase + '/api/popup-banners/' + id);
  });
});

for (const surface of [{ name: 'desktop', config: devices['Desktop Chrome'] }, { name: 'mobile', config: devices['iPhone 13'] }]) {
  test.describe('published blocks ' + surface.name, () => {
    test.use({ viewport: surface.config.viewport, userAgent: surface.config.userAgent, isMobile: surface.config.isMobile, hasTouch: surface.config.hasTouch });
    test('selects the banner product and binds standalone text through the editor', async ({ page }, testInfo) => {
      await login(page); await page.goto(popupBase + '/tools/popup-banners/builder');
      await choose(page, 'Товарна картка');
      const inspector = page.getByRole('complementary', { name: 'Властивості блока' });
      await page.getByRole('button', { name: 'Товар банера', exact: true }).click();
      await expect(inspector.getByText('Товар ще не обрано.', { exact: false })).toBeVisible();
      await inspector.getByLabel('Знайти товар').fill('PHONE-LIVE');
      await inspector.getByRole('button', { name: /Смартфон із живого каталогу/ }).click();
      await expect(page.locator('.pb-product-bar')).toContainText('Смартфон із живого каталогу · PHONE-LIVE');
      if (surface.name === 'mobile') await page.getByRole('navigation', { name: 'Панелі конструктора' }).getByRole('button', { name: 'Структура', exact: true }).click();
      await page.getByRole('button', { name: 'Обрати: Заголовок', exact: true }).click();
      await inspector.getByRole('button', { name: 'Джерело вмісту', exact: true }).click();
      await page.getByRole('option', { name: 'Назва товару', exact: true }).click();
      await expect(inspector.locator('.pb-product-binding')).toContainText('Товар банера: Смартфон із живого каталогу');
      await inspector.getByRole('button', { name: 'Змінити товар', exact: true }).click();
      await expect(inspector.getByLabel('Знайти товар')).toBeVisible();
      await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
      await expect(page).toHaveURL(/\/builder\/[a-f0-9-]+$/);
      const id = page.url().split('/').at(-1)!;
      await page.reload();
      await expect(page.locator('.pb-product-bar')).toContainText('Смартфон із живого каталогу · PHONE-LIVE');
      await expect(page.locator('.pb-node[data-label="Заголовок"]')).toContainText('Смартфон із живого каталогу');
      await expect(page.locator('.pb-node[data-label="Назва товару"]')).toContainText('Смартфон із живого каталогу');
      await page.getByRole('button', { name: 'Товар банера', exact: true }).click();
      await page.screenshot({ path: testInfo.outputPath('banner-product-' + surface.name + '.png') });
      await page.getByRole('button', { name: 'Опублікувати', exact: true }).click();
      await expect(page.getByText('Кампанію опубліковано на сайті.', { exact: false })).toBeVisible();
      await page.goto(popupBase + '/popup-test-store');
      const banner = page.locator('#mt-popup-banner-root');
      await expect(banner.getByText('Смартфон із живого каталогу', { exact: true })).toHaveCount(2);
      await expect(banner.getByRole('link', { name: 'Переглянути товар', exact: true })).toHaveAttribute('href', popupBase + '/popup-test-product');
      await page.request.delete(popupBase + '/api/popup-banners/' + id);
    });
    if (surface.name === 'mobile') test('opens campaign settings on touch devices and saves a real draft', async ({ page }, testInfo) => {
      await login(page); await page.goto(popupBase + '/tools/popup-banners/builder');
      await page.getByLabel('Назва макета').fill('Мобільна чернетка');
      await page.getByRole('button', { name: 'Умови показу', exact: true }).click();
      const inspector = page.getByRole('complementary', { name: 'Властивості блока' });
      await expect(inspector.getByRole('heading', { name: 'Умови показу', exact: true })).toBeVisible();
      await inspector.getByLabel('Затримка, секунд', { exact: true }).fill('7');
      await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
      await expect(page).toHaveURL(/\/builder\/[a-f0-9-]+$/);
      const id = page.url().split('/').at(-1)!;
      const campaign = (await (await page.request.get(popupBase + '/api/popup-banners/' + id)).json()).data;
      expect(campaign.behavior.delayMs).toBe(7000);
      await page.getByRole('button', { name: 'Розгорнути прев’ю' }).click();
      await page.getByRole('button', { name: 'Mobile', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Повернутися до редактора' })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('live-mobile-editor.png') });
      await page.request.delete(popupBase + '/api/popup-banners/' + id);
    });
    test('submits a real contact, reveals its reward, adds a product and expires its timer', async ({ page }, testInfo) => {
      await login(page);
      const code = await page.request.post(popupBase + '/api/promo-codes', { data: { internalName: 'E2E reward', code: 'LIVE-' + surface.name, type: 'percent_coupon', discountValue: 10, currency: '', startsAt: null, endsAt: null, usageLimit: null, scopeNote: '', enabled: true, horoshopConfirmed: true } }); expect(code.ok()).toBe(true);
      const document = createTemplate('form', true);
      const form = flatten(document.root).find(({ node }) => node.type === 'form')!.node;
      const phone = makeBlock('field'); phone.props.fieldType = 'phone'; phone.props.text = 'Телефон'; phone.props.required = true; form.children.splice(1, 0, phone);
      const product = makeBlock('product'); product.props.productExternalId = 'phone-live';
      const cart = flatten(product).find(({ node }) => node.type === 'button')!.node; cart.props.action = 'cart'; cart.props.text = 'У кошик';
      const timer = makeBlock('countdown'); timer.props.durationMinutes = 1;
      document.root.children.push(product, timer); document.root.style.width = 560;
      const base = emptyCampaign('block');
      const created = await page.request.post(popupBase + '/api/popup-banners', { data: { ...base, name: 'Runtime ' + surface.name, blockDocument: document, promoCodeId: (await code.json()).data.id, targeting: { ...base.targeting, mode: 'all_pages' }, behavior: { ...base.behavior, frequency: 'always', delayMs: 0, requireAcknowledgement: false } } }); expect(created.ok()).toBe(true);
      const campaign = (await created.json()).data;
      const published = await page.request.patch(popupBase + '/api/popup-banners/' + campaign.id + '/status', { data: { status: 'active' } }); expect(published.ok()).toBe(true);
      await page.clock.install();
      await page.route('**/api/public/popup-banners/resolve?**', async route => {
        const response = await route.fetch(); const body = await response.json();
        if (body.data) body.data.serverNow = await page.evaluate(() => new Date().toISOString());
        await route.fulfill({ response, json: body });
      });
      await page.goto(popupBase + '/popup-test-store');
      await expect(page.locator('#mt-popup-banner-root')).toBeVisible();
      const card = page.locator('#mt-popup-banner-root .card');
      const box = (await card.boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      await expect(page.getByText('LIVE-' + surface.name, { exact: true })).toHaveCount(0);
      const fields = flatten(form).filter(({ node }) => node.type === 'field');
      for (const { node } of fields) await page.getByLabel(node.props.text, { exact: true }).fill(node.props.fieldType === 'email' ? surface.name + '@example.com' : node.props.fieldType === 'phone' ? '+380671234567' : 'Тест');
      await page.locator('#mt-popup-banner-root button[type="submit"]').click();
      await expect(page.getByText('LIVE-' + surface.name, { exact: true })).toBeVisible();
      const contacts = await page.request.get(popupBase + '/api/popup-banners/' + campaign.id + '/contacts'); expect((await contacts.json()).data.total).toBe(1);
      await page.getByRole('button', { name: 'У кошик', exact: true }).click();
      await expect(page.getByRole('button', { name: 'У кошику', exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => (window as unknown as { cartItems: Record<string, { quantity: number }> }).cartItems['9001']?.quantity)).toBe(1);
      await page.screenshot({ path: testInfo.outputPath('published-' + surface.name + '.png') });
      await page.clock.fastForward(61000); await expect(page.locator('#mt-popup-banner-root')).toHaveCount(0);
      await page.reload(); await expect(page.locator('#mt-popup-banner-root')).toHaveCount(0);
      await page.request.delete(popupBase + '/api/popup-banners/' + campaign.id);
    });
  });
}
