import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { JSDOM } from 'jsdom';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.POPUP_TEST_DATABASE_URL || 'pg-mem://popup-banners-tests';
process.env.JWT_SECRET = 'popup-banners-test-secret-0123456789';
process.env.COOKIE_SECURE = 'false';
process.env.APP_ORIGIN = 'https://mt-panel.example.com';
process.env.ADMIN_NAME = 'Popup Admin';
process.env.ADMIN_EMAIL = 'popup-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');
const { popupEmbedScript } = await import('../src/modules/popup-banners/popup-banner.service.js');

const admin = request.agent(app);
const connectionId = randomUUID();
const generation = randomUUID();
const productId = randomUUID();
const modificationId = randomUUID();
const alternativeProductId = randomUUID();
const alternativeModificationId = randomUUID();
const secondAlternativeProductId = randomUUID();
const unavailableAlternativeProductId = randomUUID();
const differentCategoryProductId = randomUUID();
const syncId = randomUUID();

function input(overrides = {}) {
  return {
    name: 'Попередження про вживаний товар',
    priority: 200,
    content: {
      eyebrow: 'Важлива інформація',
      title: '{{product.title}} — вживаний товар',
      body: 'Артикул {{product.article}}. Уважно прочитайте опис стану.',
      primaryLabel: 'Я розумію',
      primaryUrl: '',
      secondaryLabel: 'Закрити',
      imageUrl: '',
      acknowledgementLabel: 'Я прочитав(-ла) інформацію про стан товару.'
    },
    styles: {
      layout: 'modal',
      accentColor: '#6d5dfc',
      backgroundColor: '#ffffff',
      textColor: '#172033',
      mutedColor: '#667085',
      primaryButtonBackgroundColor: '#ffe101',
      primaryButtonTextColor: '#101828',
      secondaryButtonBackgroundColor: '#ffffff',
      secondaryButtonTextColor: '#172033',
      checkboxAccentColor: '#f04438',
      checkboxCheckColor: '#101828',
      checkboxTextColor: '#344054',
      eyebrowFontSize: 14,
      titleFontSize: 42,
      bodyFontSize: 18,
      acknowledgementFontSize: 15,
      buttonFontSize: 17,
      borderRadius: 24,
      maxWidth: 1200
    },
    targeting: {
      mode: 'products',
      match: 'all',
      stickers: [],
      brands: [],
      categoryIds: [],
      conditions: [],
      targetPageUrl: '',
      urlContains: []
    },
    behavior: {
      delayMs: 0,
      frequency: 'product',
      cooldownDays: 7,
      dismissible: true,
      requireAcknowledgement: true,
      buttonCount: 2
    },
    startsAt: null,
    endsAt: null,
    productEntries: ['USED-IPHONE-128'],
    ...overrides
  };
}

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  await admin.post('/api/auth/login').send({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD
  }).expect(200);

  await pool.query(`
    INSERT INTO search_horoshop_connections (
      id, generation, store_domain, encrypted_credentials, status, last_sync_at
    ) VALUES ($1, $2, 'shop.example.com', 'ciphertext', 'connected', NOW())
  `, [connectionId, generation]);
  await pool.query(`
    INSERT INTO search_horoshop_categories (
      id, connection_id, generation, external_id, titles, active, last_seen_sync_id
    ) VALUES ($1, $2, $3, 'used-phones', $4::JSONB, TRUE, $5)
  `, [randomUUID(), connectionId, generation, JSON.stringify({ uk: 'Вживані смартфони' }), syncId]);
  await pool.query(`
    INSERT INTO search_horoshop_products (
      id, connection_id, generation, external_id, sku, titles, brand,
      category_external_id, price, currency, availability, visible,
      canonical_url, stickers, condition_label, active, last_seen_sync_id
    ) VALUES (
      $1, $2, $3, 'used-iphone-15', 'USED-IPHONE', $4::JSONB, 'Apple',
      'used-phones', '32999', 'UAH', 'В наявності', TRUE,
      'https://shop.example.com/used-iphone-15/', $5::JSONB, 'Вживаний', TRUE, $6
    )
  `, [productId, connectionId, generation,
    JSON.stringify({ uk: 'Смартфон Apple iPhone 15 128GB' }),
    JSON.stringify([{ id: '14', title: 'Вживаний' }]), syncId]);
  await pool.query(`
    INSERT INTO search_horoshop_modifications (
      id, connection_id, product_id, generation, external_id, sku, titles,
      price, currency, availability, visible, stickers, condition_label, active, last_seen_sync_id
    ) VALUES (
      $1, $2, $3, $4, 'used-iphone-15:black', 'USED-IPHONE-128', $5::JSONB,
      '32999', 'UAH', 'В наявності', TRUE, $6::JSONB, 'Вживаний', TRUE, $7
    )
  `, [modificationId, connectionId, productId, generation,
    JSON.stringify({ uk: 'Смартфон Apple iPhone 15 128GB Black' }),
    JSON.stringify([{ id: '14', title: 'Вживаний' }]), syncId]);
  await pool.query(`
    INSERT INTO search_horoshop_products (
      id, connection_id, generation, external_id, sku, titles, brand,
      category_external_id, price, old_price, currency, availability, visible,
      primary_image_url, canonical_url, popularity, source_data, active, last_seen_sync_id
    ) VALUES
      ($1, $4, $5, 'iphone-15-new', 'IPHONE-15-NEW', $6::JSONB, 'Apple', 'used-phones',
       '33999', '35999', 'UAH', 'В наявності', TRUE, 'https://cdn.example.com/iphone-15.webp',
       'https://shop.example.com/iphone-15-new/', '98', $7::JSONB, TRUE, $8),
      ($2, $4, $5, 'samsung-s24', 'SAMSUNG-S24', $9::JSONB, 'Samsung', 'used-phones',
       '29999', NULL, 'UAH', 'В наявності', TRUE, 'https://cdn.example.com/s24.webp',
       'https://shop.example.com/samsung-s24/', '87', $10::JSONB, TRUE, $8),
      ($3, $4, $5, 'pixel-unavailable', 'PIXEL-OOS', $11::JSONB, 'Google', 'used-phones',
       '31999', NULL, 'UAH', 'Немає в наявності', TRUE, 'https://cdn.example.com/pixel.webp',
       'https://shop.example.com/pixel-unavailable/', '100', $12::JSONB, TRUE, $8),
      ($13, $4, $5, 'macbook-available', 'MACBOOK-AVAILABLE', $14::JSONB, 'Apple', 'laptops',
       '33999', NULL, 'UAH', 'В наявності', TRUE, 'https://cdn.example.com/macbook.webp',
       'https://shop.example.com/macbook-available/', '120', $15::JSONB, TRUE, $8)
  `, [alternativeProductId, secondAlternativeProductId, unavailableAlternativeProductId,
    connectionId, generation, JSON.stringify({ uk: 'Смартфон Apple iPhone 15 128GB New' }),
    JSON.stringify({ id: 9001 }), syncId, JSON.stringify({ uk: 'Смартфон Samsung Galaxy S24' }),
    JSON.stringify({ id: 9003 }), JSON.stringify({ uk: 'Смартфон Google Pixel' }), JSON.stringify({ id: 9004 }),
    differentCategoryProductId, JSON.stringify({ uk: 'Ноутбук Apple MacBook' }), JSON.stringify({ id: 9005 })]);
  await pool.query(`
    INSERT INTO search_horoshop_modifications (
      id, connection_id, product_id, generation, external_id, sku, titles,
      price, old_price, currency, availability, visible, image_url, page_url,
      source_data, active, last_seen_sync_id
    ) VALUES (
      $1, $2, $3, $4, 'iphone-15-new:black', 'IPHONE-15-NEW-BLACK', $5::JSONB,
      '33999', '35999', 'UAH', 'В наявності', TRUE, 'https://cdn.example.com/iphone-15-black.webp',
      'https://shop.example.com/iphone-15-new-black/', $6::JSONB, TRUE, $7
    )
  `, [alternativeModificationId, connectionId, alternativeProductId, generation,
    JSON.stringify({ uk: 'Смартфон Apple iPhone 15 128GB New Black' }), JSON.stringify({ id: 9002 }), syncId]);
});

after(async () => {
  await pool.end();
});

test('popup banner tool resolves exact product campaigns and records public events', async () => {
  await request(app).get('/api/popup-banners').expect(401);

  const options = await admin.get('/api/popup-banners/options').expect(200);
  assert.equal(options.body.data.integration.storeDomain, 'shop.example.com');
  assert.deepEqual(options.body.data.stickers, [{ id: '14', title: 'Вживаний' }]);
  assert.deepEqual(options.body.data.conditions, ['Вживаний']);

  const created = await admin.post('/api/popup-banners').send(input()).expect(201);
  assert.equal(created.body.data.productTargets.length, 1);
  assert.equal(created.body.data.productTargets[0].modificationId, modificationId);
  assert.equal(created.body.data.productTargets[0].sku, 'USED-IPHONE-128');
  assert.equal(created.body.data.styles.primaryButtonBackgroundColor, '#ffe101');
  assert.equal(created.body.data.styles.checkboxAccentColor, '#f04438');
  assert.equal(created.body.data.styles.checkboxCheckColor, '#101828');
  assert.equal(created.body.data.styles.titleFontSize, 42);
  assert.equal(created.body.data.styles.maxWidth, 1200);
  assert.equal(created.body.data.behavior.buttonCount, 2);

  const campaignId = created.body.data.id;
  const publicId = created.body.data.publicId;
  await admin.patch(`/api/popup-banners/${campaignId}/status`).send({ status: 'active' }).expect(200);

  const resolved = await request(app)
    .get('/api/public/popup-banners/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: 'https://shop.example.com/used-iphone-15/', article: 'USED-IPHONE-128' })
    .expect(200);
  assert.equal(resolved.body.data.campaign.publicId, publicId);
  assert.equal(resolved.body.data.product.article, 'USED-IPHONE-128');
  assert.equal(resolved.body.data.campaign.styles.primaryButtonBackgroundColor, '#ffe101');
  assert.equal(resolved.body.data.campaign.styles.checkboxTextColor, '#344054');
  assert.equal(resolved.body.data.campaign.styles.checkboxCheckColor, '#101828');
  assert.equal(resolved.body.data.campaign.styles.bodyFontSize, 18);
  assert.match(resolved.body.data.campaign.content.title, /iPhone 15 128GB Black/u);
  assert.match(resolved.body.data.campaign.content.body, /USED-IPHONE-128/u);

  const foreignOrigin = await request(app)
    .get('/api/public/popup-banners/resolve')
    .set('Origin', 'https://unrelated.example.com')
    .query({ pageUrl: 'https://shop.example.com/used-iphone-15/', article: 'USED-IPHONE-128' })
    .expect(200);
  assert.equal(foreignOrigin.body.data, null);

  await request(app).post('/api/public/popup-banners/events').send({
    publicId,
    eventType: 'impression',
    pageUrl: 'https://shop.example.com/used-iphone-15/',
    article: 'USED-IPHONE-128',
    visitorKey: 'browser-visitor-key',
    metadata: { source: 'test' }
  }).expect(204);

  const campaigns = await admin.get('/api/popup-banners').expect(200);
  assert.equal(campaigns.body.data[0].stats.impressions, 1);
});

test('sticker rules and the embeddable widget work without exact product targets', async () => {
  const exactCampaign = (await admin.get('/api/popup-banners').expect(200)).body.data[0];
  await admin.patch(`/api/popup-banners/${exactCampaign.id}/status`).send({ status: 'paused' }).expect(200);

  const ruleInput = input({
    name: 'Усі вживані товари',
    priority: 300,
    targeting: {
      mode: 'rules',
      match: 'all',
      stickers: ['14'],
      brands: [],
      categoryIds: [],
      conditions: [],
      targetPageUrl: '',
      urlContains: []
    },
    productEntries: []
  });
  const created = await admin.post('/api/popup-banners').send(ruleInput).expect(201);
  await admin.patch(`/api/popup-banners/${created.body.data.id}/status`).send({ status: 'active' }).expect(200);

  const resolved = await request(app)
    .get('/api/public/popup-banners/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: 'https://shop.example.com/used-iphone-15/', article: 'USED-IPHONE-128' })
    .expect(200);
  assert.equal(resolved.body.data.campaign.publicId, created.body.data.publicId);

  const script = await request(app).get('/api/public/popup-banners/embed.js').expect(200);
  assert.match(script.headers['content-type'], /javascript/u);
  assert.match(script.text, /attachShadow/u);
  assert.match(script.text, /popup-banners\/resolve/u);
  assert.match(script.text, /--primary-bg/u);
  assert.match(script.text, /--checkbox-text/u);
  assert.match(script.text, /--checkbox-check/u);
  assert.match(script.text, /--title-size/u);
  assert.match(script.text, /behavior\.buttonCount === 2/u);
  assert.match(script.text, /product-header__availability--out-of-stock/u);
  assert.match(script.text, /j-buy-button-add/u);
  assert.match(script.text, /AjaxCart/u);
  assert.doesNotMatch(script.text, /_widget\/ajax_cart/u);
  assert.doesNotMatch(script.text, /BuyButton\.initButtons/u);
  assert.doesNotThrow(() => new Function(script.text));

  const code = await admin.get('/api/popup-banners/embed-code').expect(200);
  assert.match(code.body.data.code, /popup-banners\/embed\.js/u);
});

test('out-of-stock widget keeps focus and scrolling on the dialog while using Horoshop native cart metadata', async (t) => {
  const dom = new JSDOM(`<!doctype html><html><head>
    <meta itemprop="sku" content="OUT-OF-STOCK-1">
  </head><body>
    <span class="product-header__availability--out-of-stock">Немає в наявності</span>
  </body></html>`, {
    pretendToBeVisual: true,
    runScripts: 'outside-only',
    url: 'https://shop.example.com/unavailable-product/'
  });
  t.after(() => dom.window.close());
  const nativeClicks = [];
  const focusCalls = [];
  const fetchedUrls = [];
  let rejectNativeAppend = true;
  let nativeQuantity = '12';
  const payload = {
    campaign: {
      publicId: 'public-out-of-stock',
      mode: 'out_of_stock',
      content: {
        eyebrow: 'Товар тимчасово недоступний',
        title: 'Цього товару зараз немає в наявності',
        body: 'Оберіть схожу модель із цієї самої категорії.',
        imageUrl: ''
      },
      styles: {
        layout: 'modal',
        accentColor: '#6d5dfc',
        backgroundColor: '#ffffff',
        textColor: '#172033',
        mutedColor: '#667085',
        primaryButtonBackgroundColor: '#6d5dfc',
        primaryButtonTextColor: '#ffffff',
        secondaryButtonBackgroundColor: '#ffffff',
        secondaryButtonTextColor: '#172033',
        checkboxAccentColor: '#6d5dfc',
        checkboxCheckColor: '#ffffff',
        checkboxTextColor: '#172033',
        eyebrowFontSize: 12,
        titleFontSize: 34,
        bodyFontSize: 16,
        acknowledgementFontSize: 14,
        buttonFontSize: 16,
        borderRadius: 22,
        maxWidth: 960
      },
      behavior: {
        delayMs: 0,
        frequency: 'always',
        cooldownDays: 7,
        dismissible: true,
        requireAcknowledgement: false,
        buttonCount: 1
      }
    },
    product: { article: 'OUT-OF-STOCK-1', title: 'Недоступний товар' },
    recommendations: [{
      productId: 'recommended-product',
      modificationId: 'recommended-modification',
      article: 'REC-1',
      title: 'Доступна модель',
      price: '399',
      oldPrice: '',
      currency: 'UAH',
      imageUrl: 'https://shop.example.com/recommended.jpg',
      pageUrl: 'https://shop.example.com/recommended-product/',
      buyId: 'REC-1'
    }]
  };

  const nativeFocus = dom.window.HTMLElement.prototype.focus;
  dom.window.HTMLElement.prototype.focus = function focus(options) {
    focusCalls.push({ element: this, options });
    return nativeFocus.call(this, options);
  };
  dom.window.MutationObserver = class MutationObserver {
    observe() {}
  };

  const cartProducts = new Map();
  const cart = {
    appendProduct(product) {
      if (rejectNativeAppend) throw new Error('Horoshop rejected the cart update');
      nativeClicks.push(product);
      const current = Number(cartProducts.get(product.id)?.quantity || 0);
      dom.window.setTimeout(() => cartProducts.set(product.id, {
        id: product.id,
        type: product.type,
        quantity: current + product.quantity
      }), 10);
    },
    getProductById(id, type) {
      const product = cartProducts.get(String(id));
      return product?.type === type ? product : null;
    }
  };
  dom.window.AjaxCart = { openCartOnAdd: false, getInstance: () => cart };
  dom.window.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    fetchedUrls.push(url.href);
    if (url.origin === 'https://mt-panel.example.com' && url.pathname.endsWith('/resolve')) {
      return { ok: true, json: async () => ({ data: payload }) };
    }
    if (url.origin === 'https://mt-panel.example.com' && url.pathname.endsWith('/events')) {
      return { ok: true };
    }
    if (url.href === 'https://shop.example.com/recommended-product/') {
      assert.equal(init.credentials, 'same-origin');
      return {
        ok: true,
        url: url.href,
        text: async () => `<meta itemprop="sku" content="REC-1">
        <div class="product-order__block--buy">
          <button class="btn __special j-buy-button-add" id="j-buy-button-widget-1963"
            data-skin="modern" data-quantity="${nativeQuantity}" data-gift="0" data-cartproducttype="product">Купити</button>
        </div>`
      };
    }
    throw new Error(`Unexpected fetch: ${url.href}`);
  };

  dom.window.eval(popupEmbedScript('https://mt-panel.example.com'));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 80));

  const host = dom.window.document.querySelector('#mt-popup-banner-root');
  const shadow = host.shadowRoot;
  const card = shadow.querySelector('.card');
  const recommendations = shadow.querySelector('.recommendations');
  const buyButton = shadow.querySelector('.recommendation-buy');
  const css = shadow.querySelector('style').textContent;
  assert.equal(card.className, 'card is-recommendations');
  assert.equal(card.tabIndex, -1);
  assert.equal(focusCalls.at(-1).element, card);
  assert.notEqual(focusCalls.at(-1).element, buyButton);
  assert.equal(focusCalls.at(-1).options.preventScroll, true);
  assert.match(css, /\.card\.is-recommendations\{[^}]*overflow:hidden/u);
  assert.match(css, /\.card\.is-recommendations \.recommendations\{[^}]*overflow-y:auto/u);
  assert.match(css, /@media\(max-width:760px\)\{\.recommendations\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/u);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.card\.is-recommendations \.recommendations\{overflow-x:hidden;overflow-y:auto\}/u);
  assert.doesNotMatch(css, /scroll-snap-type:x mandatory|flex:0 0:min\(74vw/u);
  assert.equal(recommendations.contains(buyButton), true);

  payload.recommendations[0].buyId = '9002';
  buyButton.click();
  await new Promise((resolve) => dom.window.setTimeout(resolve, 30));
  assert.equal(dom.window.document.querySelector('#mt-popup-banner-root'), host);
  assert.equal(buyButton.disabled, false);
  assert.equal(buyButton.textContent, 'Спробувати ще');
  assert.deepEqual(nativeClicks, []);

  payload.recommendations[0].buyId = 'REC-1';
  nativeQuantity = '';
  buyButton.click();
  await new Promise((resolve) => dom.window.setTimeout(resolve, 30));
  assert.equal(dom.window.document.querySelector('#mt-popup-banner-root'), host);
  assert.equal(buyButton.disabled, false);
  assert.deepEqual(nativeClicks, []);

  nativeQuantity = '12';
  buyButton.click();
  await new Promise((resolve) => dom.window.setTimeout(resolve, 30));
  assert.equal(dom.window.document.querySelector('#mt-popup-banner-root'), host);
  assert.equal(buyButton.disabled, false);
  assert.deepEqual(nativeClicks, []);

  rejectNativeAppend = false;
  buyButton.click();
  await new Promise((resolve) => dom.window.setTimeout(resolve, 80));
  assert.equal(nativeClicks.length, 1);
  assert.equal(nativeClicks[0].id, '1963');
  assert.equal(nativeClicks[0].quantity, 12);
  assert.equal(nativeClicks[0].type, 'product');
  assert.equal(dom.window.AjaxCart.openCartOnAdd, true);
  assert.equal(fetchedUrls.includes('https://shop.example.com/recommended-product/'), true);

  await new Promise((resolve) => dom.window.setTimeout(resolve, 260));
  assert.equal(dom.window.document.querySelector('#mt-popup-banner-root'), null);
});

test('target-page campaigns match one exact storefront URL without requiring a product', async () => {
  const campaigns = (await admin.get('/api/popup-banners').expect(200)).body.data;
  for (const campaign of campaigns.filter((item) => item.status === 'active')) {
    await admin.patch(`/api/popup-banners/${campaign.id}/status`).send({ status: 'paused' }).expect(200);
  }

  const targeting = {
    mode: 'target_page',
    match: 'all',
    stickers: [],
    brands: [],
    categoryIds: [],
    conditions: [],
    targetPageUrl: 'https://www.shop.example.com/delivery-and-payment/?source=popup#details',
    urlContains: []
  };
  const foreignStore = await admin.post('/api/popup-banners').send(input({
    targeting: { ...targeting, targetPageUrl: 'https://other.example.com/delivery-and-payment/' },
    productEntries: []
  })).expect(422);
  assert.equal(foreignStore.body.error.code, 'POPUP_TARGET_PAGE_STORE_MISMATCH');

  const created = await admin.post('/api/popup-banners').send(input({
    name: 'Доставка та оплата',
    priority: 500,
    targeting,
    productEntries: []
  })).expect(201);
  assert.equal(
    created.body.data.targeting.targetPageUrl,
    'https://www.shop.example.com/delivery-and-payment'
  );
  await admin.patch(`/api/popup-banners/${created.body.data.id}/status`).send({ status: 'active' }).expect(200);

  const resolved = await request(app)
    .get('/api/public/popup-banners/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: 'https://shop.example.com/delivery-and-payment/?source=menu#shipping' })
    .expect(200);
  assert.equal(resolved.body.data.campaign.publicId, created.body.data.publicId);
  assert.equal(resolved.body.data.product, null);

  const differentPage = await request(app)
    .get('/api/public/popup-banners/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: 'https://shop.example.com/returns/?source=popup' })
    .expect(200);
  assert.equal(differentPage.body.data, null);
});

test('out-of-stock campaigns return available alternatives from the same category with native buy ids', async () => {
  const campaigns = (await admin.get('/api/popup-banners').expect(200)).body.data;
  for (const campaign of campaigns.filter((item) => item.status === 'active')) {
    await admin.patch(`/api/popup-banners/${campaign.id}/status`).send({ status: 'paused' }).expect(200);
  }

  const created = await admin.post('/api/popup-banners').send(input({
    name: 'Альтернативи для відсутнього товару',
    priority: 800,
    targeting: {
      mode: 'out_of_stock',
      match: 'all',
      stickers: [],
      brands: [],
      categoryIds: [],
      conditions: [],
      targetPageUrl: '',
      urlContains: [],
      recommendationLimit: 4
    },
    behavior: {
      delayMs: 0,
      frequency: 'always',
      cooldownDays: 7,
      dismissible: true,
      requireAcknowledgement: false,
      buttonCount: 1
    },
    productEntries: []
  })).expect(201);
  assert.equal(created.body.data.targeting.mode, 'out_of_stock');
  assert.equal(created.body.data.targeting.recommendationLimit, 4);
  await admin.patch(`/api/popup-banners/${created.body.data.id}/status`).send({ status: 'active' }).expect(200);

  const availablePage = await request(app)
    .get('/api/public/popup-banners/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: 'https://shop.example.com/used-iphone-15/', article: 'USED-IPHONE-128', stockState: 'in_stock' })
    .expect(200);
  assert.equal(availablePage.body.data, null);

  const resolved = await request(app)
    .get('/api/public/popup-banners/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: 'https://shop.example.com/used-iphone-15/', article: 'USED-IPHONE-128', stockState: 'out_of_stock' })
    .expect(200);
  assert.equal(resolved.body.data.campaign.mode, 'out_of_stock');
  assert.equal(resolved.body.data.recommendations.length, 2);
  assert.deepEqual(new Set(resolved.body.data.recommendations.map((item) => item.productId)), new Set([
    alternativeProductId,
    secondAlternativeProductId
  ]));
  assert.equal(resolved.body.data.recommendations.some((item) => item.productId === productId), false);
  assert.equal(resolved.body.data.recommendations.some((item) => item.productId === unavailableAlternativeProductId), false);
  assert.equal(resolved.body.data.recommendations.some((item) => item.productId === differentCategoryProductId), false);
  const iphone = resolved.body.data.recommendations.find((item) => item.productId === alternativeProductId);
  assert.equal(iphone.buyId, '9002');
  assert.equal(iphone.modificationId, alternativeModificationId);
  assert.equal(iphone.pageUrl, 'https://shop.example.com/iphone-15-new-black/');
});
