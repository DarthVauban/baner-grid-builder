import { devices, expect, test } from '@playwright/test';
import sharp from 'sharp';
import type { PopupCampaignInput } from '../../client/src/types/popup-banner';
import { defaultProductPopupConfig } from '../../client/src/lib/popup-product';

type CartItem = { id: string; quantity: number; type: string };
type CartTestWindow = Window & { __cartAppends: CartItem[]; AjaxCart: { getInstance: () => { appendProduct: (item: CartItem) => void; getProductById: (id: string) => CartItem | null } } };

const art = () => sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="880" height="1000"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#e8e2ff"/><stop offset="1" stop-color="#f3f0ff"/></linearGradient></defs><rect width="880" height="1000" fill="url(#bg)"/><rect x="250" y="130" width="380" height="740" rx="55" fill="#172033"/><rect x="270" y="155" width="340" height="685" rx="40" fill="#8273bd"/><ellipse cx="440" cy="490" rx="170" ry="245" fill="#c7bde9"/><rect x="377" y="171" width="126" height="27" rx="14" fill="#172033"/></svg>')).png().toBuffer();
const mobileArt = async () => sharp(await art()).resize(1000, 1000, { fit: 'contain', background: '#e8e2ff' }).png().toBuffer();
const product = {
  id: 'product', productId: 'product', productExternalId: 'phone', modificationId: null, modificationExternalId: null, position: 0,
  sku: 'PHONE-1', article: 'PHONE-1', title: 'Apple iPhone 15 128 ГБ Black', price: '24999', oldPrice: '29999', currency: 'UAH',
  imageUrl: '', pageUrl: 'http://shop.example.test/phone/', buyId: 'PHONE-1', available: true, visible: true
};
function payload(input?: PopupCampaignInput) {
  const config = defaultProductPopupConfig();
  return {
    campaign: {
      publicId: '0d677d17-a486-440f-a757-f45a9d16ddcb', revision: 'product-popup-1', type: 'product_popup', mode: 'all_pages',
      content: input?.content || { eyebrow: 'Спеціальна пропозиція', title: 'Ваш новий iPhone', body: '', primaryLabel: 'Додати до кошика', secondaryLabel: 'Детальніше', imageUrl: '/media/catalog/library/test-art.webp' },
      styles: input?.styles || { layout: 'modal', maxWidth: 880, borderRadius: 24, backgroundColor: '#ffffff', textColor: '#172033', mutedColor: '#667085', accentColor: '#6d5dfc' },
      behavior: input?.behavior || { trigger: 'delay', delayMs: 0, frequency: 'always', device: 'all', cooldownDays: 7, maxShowsPerSession: 0, dismissible: true, requireAcknowledgement: false, buttonCount: 1 },
      productPopup: input?.productPopup || { ...config, showOldPrice: true, showSavings: true, mobileImageUrl: '/media/catalog/library/mobile-art.webp', mobileImageWidth: 1000, mobileImageHeight: 1000 },
      timerConfig: { mode: 'duration', durationMinutes: 15, deadlineAt: null }, formConfig: { fields: [] }, promoCode: null
    },
    product: null, recommendations: [], products: !input || input.promoItems?.length ? [product] : []
  };
}

for (const surface of [
  { name: 'desktop', device: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
  { name: 'mobile', device: devices['iPhone 13'] }
]) {
  test.describe(`single product popup ${surface.name}`, () => {
    test.use({ viewport: surface.device.viewport, userAgent: surface.device.userAgent, isMobile: surface.device.isMobile, hasTouch: surface.device.hasTouch, deviceScaleFactor: surface.device.deviceScaleFactor });

    test('configures uploaded artwork and optional prices in the real preview runtime', async ({ page }, testInfo) => {
      const png = await art();
      await page.route('**/api/popup-banners', (route) => route.fulfill({ json: { data: [] } }));
      await page.route('**/api/popup-banners/options', (route) => route.fulfill({ json: { data: { integration: { id: 'connection', generation: 'generation', storeDomain: 'shop.example.test', status: 'connected', lastSyncAt: null }, stickers: [], brands: [], conditions: [], categories: [] } } }));
      await page.route('**/api/popup-banners/catalog?**', (route) => route.fulfill({ json: { data: { items: [{ id: 'product', externalId: 'phone', sku: 'PHONE-1', titles: { uk: product.title }, price: product.price, oldPrice: product.oldPrice, currency: 'UAH', availability: 'В наявності', visible: true, active: true, canonicalUrl: product.pageUrl, primaryImageUrl: '', modifications: [] }], categories: [], page: 1, pageSize: 60, total: 1 } } }));
      await page.route('**/api/popup-banners/preview', (route) => route.fulfill({ json: { data: payload(route.request().postDataJSON()) } }));
      await page.goto('/login');
      await page.getByLabel('Email').fill('e2e-admin@test.local');
      await page.locator('input[name="password"]').fill('E2E-admin-password-2026');
      await page.getByRole('button', { name: 'Увійти' }).click();
      await expect(page.getByRole('heading', { name: 'Вітаємо, E2E' })).toBeVisible();
      await page.goto('/tools/popup-banners');
      await page.getByRole('button', { name: /Нова кампанія/u }).click();
      await page.getByRole('dialog').getByRole('button', { name: /Попап із товаром/u }).click();
      await page.getByRole('button', { name: 'Обрати товар', exact: true }).click();
      await page.getByRole('button', { name: 'Обрати', exact: true }).click();
      await page.getByRole('button', { name: /Контент і дизайн/u }).click();
      await page.getByRole('textbox', { name: 'Головний заголовок', exact: true }).fill('Ваш новий iPhone');
      await page.getByRole('textbox', { name: /Назва товару на банері/u }).fill('iPhone для вашої акції');
      await page.getByLabel('Зображення банера для desktop', { exact: true }).setInputFiles({ name: 'product.png', mimeType: 'image/png', buffer: png });
      await expect(page.getByText('Завантажено: 880 × 1000 px')).toBeVisible();
      await page.getByLabel('Зображення банера для телефона', { exact: true }).setInputFiles({ name: 'mobile.png', mimeType: 'image/png', buffer: await mobileArt() });
      await expect(page.getByText('Завантажено: 1000 × 1000 px')).toBeVisible();
      await expect(page.getByLabel('Зображення банера для телефона', { exact: true })).toHaveCSS('width', '1px');
      await page.locator('.popup-form-section').filter({ has: page.getByRole('heading', { name: 'Текст і зображення', exact: true }) }).screenshot({ path: testInfo.outputPath(`product-popup-upload-${surface.name}.png`) });
      await page.getByRole('switch', { name: 'Показувати стару ціну' }).check();
      await page.getByRole('switch', { name: 'Показувати лейбл вигоди' }).check();
      await expect(page.getByRole('switch', { name: 'Показувати стару ціну' })).toHaveCSS('width', '40px');
      await expect(page.getByRole('switch', { name: 'Показувати стару ціну' })).toHaveCSS('height', '22px');
      await expect(page.getByRole('switch', { name: 'Показувати стару ціну' })).toHaveCSS('background-image', 'none');
      await page.getByRole('button', { name: 'Джерело старої ціни' }).click();
      await page.getByRole('option', { name: 'Встановити вручну' }).click();
      await page.getByRole('spinbutton', { name: 'Стара ціна', exact: true }).fill('34999');
      const frame = page.frameLocator('iframe[title="Живий перегляд банера"]');
      await expect(frame.locator('.product-popup-productTitle')).toHaveText('iPhone для вашої акції');
      await expect(frame.locator('.product-popup-oldPrice')).toHaveText(/34\s?999/u);
      await expect(frame.locator('.product-popup-savings')).toHaveText(/10\s?000/u);
      await expect(frame.locator('.product-popup-details')).toHaveAttribute('href', product.pageUrl);
      await expect(frame.locator('.product-popup-image')).toHaveJSProperty('naturalWidth', 1000);
      await page.getByRole('switch', { name: 'Показувати стару ціну' }).uncheck();
      await expect(frame.locator('.product-popup-oldPrice')).toHaveCount(0);
      await expect(frame.locator('.product-popup-savings')).toBeVisible();
      await page.locator('.popup-form-section').filter({ has: page.getByRole('heading', { name: 'Ціни та вигода', exact: true }) }).screenshot({ path: testInfo.outputPath(`product-popup-switches-${surface.name}.png`) });
      await page.getByRole('button', { name: 'Відкрити прев’ю на весь екран' }).click();
      if (surface.name === 'mobile') await page.getByRole('button', { name: 'Телефон', exact: true }).click();
      await expect(frame.locator('.card.is-product-popup')).toBeVisible();
      await expect(frame.locator('.product-popup-image')).toHaveJSProperty('naturalWidth', surface.name === 'mobile' ? 1000 : 880);
      if (surface.name === 'mobile') {
        const image = (await frame.locator('.product-popup-image').boundingBox())!;
        expect(Math.abs(image.width - image.height)).toBeLessThan(1);
      }
      await page.screenshot({ path: testInfo.outputPath(`product-popup-preview-${surface.name}.png`) });
      await expect(page.getByRole('button', { name: 'Закрити повноекранний перегляд' })).toBeVisible();
    });

    test('shows the split product popup on the storefront and purchases through the native cart', async ({ page }, testInfo) => {
      const png = await art();
      const script = await (await page.request.get('/api/public/popup-banners/embed.js', { headers: { 'x-forwarded-host': 'panel.example.test', 'x-forwarded-proto': 'http' } })).text();
      await page.route('http://panel.example.test/api/public/popup-banners/embed.js', (route) => route.fulfill({ contentType: 'application/javascript', body: script }));
      await page.route('http://panel.example.test/media/catalog/library/test-art.webp', (route) => route.fulfill({ contentType: 'image/png', body: png }));
      const mobilePng = await mobileArt();
      await page.route('http://panel.example.test/media/catalog/library/mobile-art.webp', (route) => route.fulfill({ contentType: 'image/png', body: mobilePng }));
      const nativeButton = '<button class="j-buy-button-add" id="j-buy-button-widget-1234" data-quantity="2" data-cartproducttype="product">Купити</button>';
      const productMarkup = surface.name === 'desktop'
        ? `<div class="product-order__block--buy">${nativeButton}</div>`
        : `<div class="productsSlider-i"><button class="j-buy-button-add" id="j-buy-button-widget-9999" data-quantity="1" data-cartproducttype="product">Інший товар</button></div><div class="product__block--orderBox"><div data-view-block="orderBox"><div class="product-card product-card--main" itemprop="offers"><div class="product-card__buy-button">${nativeButton}</div></div></div></div>`;
      await page.route('http://shop.example.test/**', (route) => route.fulfill({ contentType: 'text/html', body: route.request().url().endsWith('/phone/')
        ? `<meta itemprop="sku" content="PHONE-1">${productMarkup}`
        : '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f4f5fa;font-family:Arial"><header style="padding:30px;background:white;font-weight:bold">Mobile Trend</header><main style="padding:50px"><h1>Смартфони та аксесуари</h1><button id="catalog">Каталог</button></main><script src="http://panel.example.test/api/public/popup-banners/embed.js"></script></body></html>' }));
      await page.route('**/api/public/popup-banners/resolve?**', (route) => route.fulfill({ json: { data: payload() }, headers: { 'access-control-allow-origin': '*' } }));
      await page.route('**/api/public/popup-banners/events', (route) => route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' } }));
      await page.addInitScript(() => {
        const items = new Map<string, CartItem>();
        const target = window as unknown as CartTestWindow;
        target.__cartAppends = [];
        target.AjaxCart = { getInstance: () => ({ appendProduct(item: CartItem) { items.set(item.id, item); target.__cartAppends.push(item); }, getProductById(id: string) { return items.get(id) || null; } }) };
      });
      await page.goto('http://shop.example.test/');
      const card = page.locator('#mt-popup-banner-root .card.is-product-popup');
      await expect(card).toBeVisible();
      await expect(card.locator('.product-popup-price')).toHaveText(/24\s?999/u);
      await expect(card.locator('.product-popup-oldPrice')).toHaveText(/29\s?999/u);
      await expect(card.locator('.product-popup-details')).toHaveAttribute('href', product.pageUrl);
      await expect(card.locator('.product-popup-image')).toHaveJSProperty('naturalWidth', surface.name === 'mobile' ? 1000 : 880);
      await expect(card.locator('.product-popup-image')).toHaveJSProperty('currentSrc', `http://panel.example.test/media/catalog/library/${surface.name === 'mobile' ? 'mobile-art' : 'test-art'}.webp`);
      await expect(card).toHaveCSS('transform', 'none');
      await expect(card).toHaveJSProperty('scrollTop', 0);
      const imageBounds = (await card.locator('.product-popup-image').boundingBox())!;
      const contentBounds = (await card.locator('.product-popup-content').boundingBox())!;
      if (surface.name === 'desktop') expect(contentBounds.x).toBeGreaterThan(imageBounds.x);
      else {
        expect(contentBounds.y).toBeGreaterThanOrEqual(imageBounds.y + imageBounds.height - 1);
        expect(Math.abs(imageBounds.width - imageBounds.height)).toBeLessThan(1);
      }
      expect((await card.boundingBox())!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      await page.screenshot({ path: testInfo.outputPath(`product-popup-storefront-${surface.name}.png`) });
      await card.locator('.product-popup-details').scrollIntoViewIfNeeded();
      await expect(card.locator('.product-popup-details')).toBeInViewport({ ratio: 1 });
      await card.locator('.product-popup-buy').click();
      await expect.poll(() => page.evaluate(() => (window as unknown as CartTestWindow).__cartAppends)).toEqual([{ type: 'product', quantity: 2, id: '1234' }]);
      await expect(card).toHaveCount(0);
      await expect(page.locator('body')).toHaveCSS('overflow', 'visible');
    });
  });
}
