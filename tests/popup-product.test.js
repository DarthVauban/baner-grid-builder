import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';
import { normalizeProductPopupConfig } from '../src/modules/popup-banners/popup-product.config.js';

const mediaDir = path.join(os.tmpdir(), `mt-popup-product-test-${randomUUID()}`);
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: 'pg-mem://popup-product', JWT_SECRET: 'popup-product-test-secret-0123456789',
  COOKIE_SECURE: 'false', APP_ORIGIN: 'https://panel.example.com', CATALOG_MEDIA_DIR: mediaDir,
  ADMIN_NAME: 'Popup Admin', ADMIN_EMAIL: 'product-popup@test.local', ADMIN_PASSWORD: 'AdminPassword123!'
});
const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');
const { popupEmbedScript } = await import('../src/modules/popup-banners/popup-banner.service.js');
const admin = request.agent(app);
const connectionId = randomUUID();
const generation = randomUUID();
const productId = randomUUID();

function input(patch = {}) {
  return {
    campaignType: 'product_popup', name: 'Класичний попап із товаром', priority: 1000,
    content: { eyebrow: 'Спеціальна пропозиція', title: 'Ваш новий смартфон', body: '', primaryLabel: 'Додати до кошика', secondaryLabel: 'Детальніше', imageUrl: '/media/catalog/library/popup-art.webp' },
    styles: { layout: 'modal', accentColor: '#6d5dfc', backgroundColor: '#ffffff', textColor: '#172033', mutedColor: '#667085', borderRadius: 24, maxWidth: 880 },
    targeting: { mode: 'all_pages', match: 'all' },
    behavior: { trigger: 'delay', delayMs: 0, frequency: 'always', device: 'all', cooldownDays: 7, dismissible: true, requireAcknowledgement: false, buttonCount: 1 },
    productPopup: { titleOverride: 'Назва лише для банера', showOldPrice: true, showSavings: true, mobileImageUrl: '/media/catalog/library/mobile-art.webp', mobileImageWidth: 1000, mobileImageHeight: 1000 },
    promoItems: [{ productExternalId: 'phone', modificationExternalId: null }], productEntries: [], ...patch
  };
}

before(async () => {
  await runMigrations(); await ensureBootstrapAdmin();
  await admin.post('/api/auth/login').send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }).expect(200);
  await pool.query(`INSERT INTO search_horoshop_connections (id, generation, store_domain, encrypted_credentials, status)
    VALUES ($1, $2, 'shop.example.com', 'ciphertext', 'connected')`, [connectionId, generation]);
  await pool.query(`INSERT INTO search_horoshop_products
    (id, connection_id, generation, external_id, sku, titles, price, old_price, currency, availability, visible, canonical_url, source_data, active, last_seen_sync_id)
    VALUES ($1, $2, $3, 'phone', 'PHONE-1', $4::JSONB, '24999', '29999', 'UAH', 'В наявності', TRUE, 'https://shop.example.com/phone/', $5::JSONB, TRUE, $6)`,
  [productId, connectionId, generation, JSON.stringify({ uk: 'Назва з каталогу' }), JSON.stringify({ id: 1234 }), randomUUID()]);
});
after(async () => {
  await pool.end();
  assert.equal(path.dirname(path.resolve(mediaDir)), path.resolve(os.tmpdir()));
  await rm(mediaDir, { recursive: true, force: true });
});

test('product popup persists config and reads fresh catalog prices, names and URLs without modifying the catalog', async () => {
  const created = await admin.post('/api/popup-banners').send(input({ styles: { ...input().styles, borderRadius: 0 } })).expect(201);
  assert.equal(created.body.data.styles.borderRadius, 0);
  const campaign = created.body.data;
  assert.equal(campaign.campaignType, 'product_popup');
  assert.equal(campaign.productPopup.titleOverride, 'Назва лише для банера');
  assert.equal(campaign.productPopup.mobileImageUrl, '/media/catalog/library/mobile-art.webp');
  assert.equal(campaign.productPopup.mobileImageWidth, 1000);
  assert.equal(campaign.productPopup.mobileImageHeight, 1000);
  assert.equal(campaign.promoProducts[0].title, 'Назва з каталогу');
  assert.equal(campaign.promoProducts[0].imageUrl, ''); // Own art does not require a catalog photo.
  await admin.patch(`/api/popup-banners/${campaign.id}/status`).send({ status: 'active' }).expect(200);
  const resolve = async () => (await request(app).get('/api/public/popup-banners/resolve').query({ pageUrl: 'https://shop.example.com/' }).expect(200)).body.data;
  assert.equal((await resolve()).products[0].price, '24999');
  await pool.query(`UPDATE search_horoshop_products SET price = '25999', old_price = '31999', titles = $2::JSONB,
    canonical_url = 'https://shop.example.com/phone-updated/' WHERE id = $1`, [productId, JSON.stringify({ uk: 'Оновлена назва з каталогу' })]);
  let payload = await resolve();
  assert.equal(payload.products[0].price, '25999');
  assert.equal(payload.products[0].oldPrice, '31999');
  assert.equal(payload.products[0].title, 'Оновлена назва з каталогу');
  assert.equal(payload.products[0].pageUrl, 'https://shop.example.com/phone-updated/');
  assert.equal(payload.campaign.productPopup.titleOverride, 'Назва лише для банера');
  assert.equal(payload.campaign.productPopup.mobileImageUrl, '/media/catalog/library/mobile-art.webp');
  const manual = input({ productPopup: { titleOverride: '', showOldPrice: false, showSavings: true, oldPriceSource: 'manual', manualOldPrice: '35000', elements: { price: { fontSize: 48, color: '#ee1122' } } } });
  await admin.put(`/api/popup-banners/${campaign.id}`).send(manual).expect(200);
  payload = await resolve();
  assert.equal(payload.campaign.productPopup.manualOldPrice, '35000');
  assert.equal(payload.campaign.productPopup.elements.price.fontSize, 48);
  assert.equal(payload.products[0].oldPrice, '31999');
  assert.equal(payload.products[0].price, '25999');
  const version = await pool.query('SELECT snapshot FROM popup_banner_versions WHERE campaign_id = $1 ORDER BY version_number DESC LIMIT 1', [campaign.id]);
  assert.equal(version.rows[0].snapshot.productPopup.oldPriceSource, 'manual');
  assert.equal(version.rows[0].snapshot.productPopup.mobileImageUrl, ''); // Legacy inputs retain the desktop fallback.
  assert.equal(payload.campaign.productPopup.mobileImageUrl, '');
  for (const patch of ["active = FALSE", "visible = FALSE", "price = '0'", "canonical_url = 'https://another.example.com/phone/'"]) {
    await pool.query(`UPDATE search_horoshop_products SET ${patch} WHERE id = $1`, [productId]);
    assert.equal(await resolve(), null);
    await pool.query("UPDATE search_horoshop_products SET active = TRUE, visible = TRUE, price = '25999', canonical_url = 'https://shop.example.com/phone-updated/' WHERE id = $1", [productId]);
  }
  await admin.delete(`/api/popup-banners/${campaign.id}`).expect(204);
});

test('product popup uses the chosen modification and hides it when its parent becomes hidden', async () => {
  const modificationId = randomUUID();
  await pool.query(`INSERT INTO search_horoshop_modifications
    (id, connection_id, product_id, generation, external_id, sku, titles, price, old_price, currency, availability, visible, page_url, source_data, active, last_seen_sync_id)
    VALUES ($1, $2, $3, $4, 'phone:black', 'PHONE-BLACK', $5::JSONB, '23999', '27999', 'UAH', 'В наявності', TRUE, 'https://shop.example.com/phone-black/', $6::JSONB, TRUE, $7)`,
  [modificationId, connectionId, productId, generation, JSON.stringify({ uk: 'Чорна модифікація' }), JSON.stringify({ id: 4321 }), randomUUID()]);
  const created = await admin.post('/api/popup-banners').send(input({ promoItems: [{ productExternalId: 'phone', modificationExternalId: 'phone:black' }] })).expect(201);
  const id = created.body.data.id;
  await admin.patch(`/api/popup-banners/${id}/status`).send({ status: 'active' }).expect(200);
  const resolved = await request(app).get('/api/public/popup-banners/resolve').query({ pageUrl: 'https://shop.example.com/' }).expect(200);
  assert.equal(resolved.body.data.products[0].price, '23999');
  assert.equal(resolved.body.data.products[0].oldPrice, '27999');
  assert.equal(resolved.body.data.products[0].pageUrl, 'https://shop.example.com/phone-black/');
  await pool.query('UPDATE search_horoshop_products SET visible = FALSE WHERE id = $1', [productId]);
  const hidden = await request(app).get('/api/public/popup-banners/resolve').query({ pageUrl: 'https://shop.example.com/' }).expect(200);
  assert.equal(hidden.body.data, null);
  await pool.query('UPDATE search_horoshop_products SET visible = TRUE WHERE id = $1', [productId]);
  await admin.delete(`/api/popup-banners/${id}`).expect(204);
});

test('product popup validates one product, uploaded artwork, optional old prices and style boundaries', async () => {
  for (const patch of [
    { promoItems: [] }, { promoItems: [{ productExternalId: 'phone' }, { productExternalId: 'phone' }] },
    { content: { ...input().content, imageUrl: 'https://catalog.example.com/image.webp' } },
    { productPopup: { mobileImageUrl: 'https://catalog.example.com/mobile.webp' } },
    { productPopup: { mobileImageUrl: '/media/catalog/library/../private.webp' } },
    { productPopup: { showOldPrice: true, oldPriceSource: 'manual', manualOldPrice: '' } },
    { productPopup: { showSavings: true, oldPriceSource: 'manual', manualOldPrice: '100' } },
    { productPopup: { elements: { heading: { color: 'url(https://example.com/x)', fontSize: 999 } } } }
  ]) await admin.post('/api/popup-banners').send(input(patch)).expect(422);
  const preview = await admin.post('/api/popup-banners/preview').send(input({ promoItems: [], content: { ...input().content, imageUrl: '' } })).expect(200);
  assert.equal(preview.body.data.campaign.type, 'product_popup');
  assert.equal(preview.body.data.products.length, 0);
  assert.equal(preview.body.data.campaign.productPopup.elements.heading.fontSize, 36);
});

test('popup-only image endpoint requires auth, validates actual image data and persists dimensions', async () => {
  const png = await sharp({ create: { width: 880, height: 1000, channels: 3, background: '#ede9fe' } }).png().toBuffer();
  await request(app).post('/api/popup-banners/image').type('image/png').send(png).expect(401);
  await admin.post('/api/popup-banners/image').type('image/svg+xml').send('<svg/>').expect(415);
  await admin.post('/api/popup-banners/image').type('image/png').send(Buffer.from('not an image')).expect(415);
  await admin.post('/api/popup-banners/image').type('image/png').send(Buffer.alloc(10 * 1024 * 1024 + 1)).expect(413);
  const uploaded = await admin.post('/api/popup-banners/image').set('X-File-Name', encodeURIComponent('Товар.png')).type('image/png').send(png).expect(201);
  assert.equal(uploaded.body.data.width, 880); assert.equal(uploaded.body.data.height, 1000);
  assert.match(uploaded.body.data.url, /^\/media\/catalog\/library\/.+\.webp$/u);
  await request(app).get(uploaded.body.data.url).expect(200).expect('Content-Type', /image\/webp/u);
});

for (const surface of ['desktop', 'mobile']) {
  test(`product popup uses catalog detail links and native cart on the independent ${surface} storefront`, async (t) => {
    const dom = new JSDOM('<!doctype html><html><body><button id="page-button">Каталог</button></body></html>', { url: 'https://shop.example.com/', runScripts: 'outside-only', pretendToBeVisual: true });
    t.after(() => dom.window.close());
    dom.window.MutationObserver = class { observe() {} disconnect() {} };
    Object.defineProperty(dom.window.navigator, 'userAgent', { value: surface === 'mobile' ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile' : 'Mozilla/5.0 Desktop' });
    Object.defineProperty(dom.window, 'innerWidth', { value: surface === 'mobile' ? 390 : 1440 });
    const campaignInput = input();
    const payload = {
      campaign: { ...campaignInput, type: 'product_popup', mode: 'all_pages', publicId: randomUUID(), revision: '1', productPopup: normalizeProductPopupConfig(campaignInput.productPopup) },
      product: null, recommendations: [], products: [{ productId, modificationId: null, article: 'PHONE-1', title: 'Назва з каталогу', price: '24999', oldPrice: '29999', currency: 'UAH', pageUrl: 'https://shop.example.com/phone/', buyId: 'PHONE-1' }]
    };
    const cartProducts = new Map(); const appends = [];
    dom.window.AjaxCart = { getInstance: () => ({
      appendProduct(item) { appends.push(item); cartProducts.set(item.id, item); },
      getProductById(id) { return cartProducts.get(id) || null; }
    }) };
    const button = '<button class="j-buy-button-add" id="j-buy-button-widget-1234" data-quantity="2" data-cartproducttype="product">Купити</button>';
    const productMarkup = surface === 'desktop'
      ? `<div class="product-order__block--buy">${button}</div>`
      : `<div class="productsSlider-i"><button class="j-buy-button-add" id="j-buy-button-widget-9999" data-quantity="1" data-cartproducttype="product">Інший товар</button></div><div class="product__block--orderBox"><div data-view-block="orderBox"><div class="product-card product-card--main" itemprop="offers"><div class="product-card__buy-button">${button}</div></div></div></div>`;
    dom.window.fetch = async (url) => {
      const target = new URL(String(url));
      if (target.pathname.endsWith('/resolve')) return { ok: true, json: async () => ({ data: payload }) };
      if (target.pathname.endsWith('/events')) return { ok: true };
      assert.equal(target.href, 'https://shop.example.com/phone/');
      return { ok: true, url: target.href, text: async () => `<meta itemprop="sku" content="PHONE-1">${productMarkup}` };
    };
    dom.window.eval(popupEmbedScript('https://panel.example.com'));
    await new Promise((resolve) => setTimeout(resolve, 70));
    const host = dom.window.document.querySelector('#mt-popup-banner-root');
    assert.ok(host);
    const shadow = host.shadowRoot;
    assert.equal(shadow.querySelector('.product-popup-productTitle').textContent, 'Назва лише для банера');
    assert.equal(shadow.querySelector('.product-popup-details').href, 'https://shop.example.com/phone/');
    assert.match(shadow.querySelector('.product-popup-savings').textContent, /5\s?000/u);
    assert.match(shadow.querySelector('.product-popup-image').src, /^https:\/\/panel.example.com\/media/u);
    assert.equal(shadow.querySelector('.product-popup-media source').srcset, 'https://panel.example.com/media/catalog/library/mobile-art.webp');
    assert.equal(shadow.querySelector('.product-popup-media source').media, '(max-width:640px)');
    assert.equal(shadow.querySelector('.card').getAttribute('aria-modal'), 'true');
    shadow.querySelector('.product-popup-buy').click();
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.deepEqual(JSON.parse(JSON.stringify(appends)), [{ type: 'product', quantity: 2, id: '1234' }]);
    assert.equal(dom.window.document.querySelector('#mt-popup-banner-root'), null);
    assert.equal(dom.window.document.body.style.overflow, '');
  });
}
