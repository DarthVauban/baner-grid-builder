import { blockNode, blockDocument } from './fixtures/popup-block-document.js';
import { createPopupBlockRuntime } from '../src/modules/popup-banners/popup-block-runtime.js';
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

function binaryParser(response, callback) {
  const chunks = [];
  response.on('data', (chunk) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
}

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
      promoFormat: 'notification',
      desktopPosition: 'bottom_right',
      mobilePosition: 'bottom',
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
      timelineColor: '#6d5dfc',
      timelineTrackColor: '#ede9fe',
      showPromoTitle: false,
      eyebrowFontSize: 14,
      titleFontSize: 42,
      bodyFontSize: 18,
      acknowledgementFontSize: 15,
      buttonFontSize: 17,
      buttonBorderRadius: 12,
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
      trigger: 'delay',
      delayMs: 0,
      scrollPercent: 35,
      inactivitySeconds: 8,
      frequency: 'product',
      cooldownHours: 24,
      cooldownDays: 7,
      maxShowsPerSession: 0,
      device: 'all',
      autoCloseSeconds: 0,
      rotationSeconds: 6,
      activeWeekdays: [1, 2, 3, 4, 5, 6, 7],
      dailyStartTime: '',
      dailyEndTime: '',
      scheduleTimezone: 'Europe/Kyiv',
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
       '33999', NULL, 'UAH', 'В наявності', TRUE, 'https://cdn.example.com/iphone-15-black_+a1b2c3d4.webp',
      'https://shop.example.com/iphone-15-new-black/', $6::JSONB, TRUE, $7
    )
  `, [alternativeModificationId, connectionId, alternativeProductId, generation,
    JSON.stringify({ uk: 'Смартфон Apple iPhone 15 128GB New Black' }),
    JSON.stringify({ id: 9002, price_old: '35999' }), syncId]);
});

after(async () => {
  await pool.end();
});


test('block campaigns publish an immutable layout, targeting and schedule while allowing further drafts', async () => {
  const document = blockDocument([blockNode('heading', 'text', { text: 'Published heading' }), blockNode('offer', 'product', { productExternalId: 'iphone-15-new', modificationExternalId: 'iphone-15-new:black' }, [blockNode('title', 'text', { binding: 'product.title' }), blockNode('buy', 'button', { action: 'cart', text: 'Купити' })])]);
  const value = input({ campaignType: 'block', blockDocument: document, targeting: { ...input().targeting, mode: 'all_pages' }, productEntries: [], behavior: { ...input().behavior, requireAcknowledgement: false } });
  const created = (await admin.post('/api/popup-banners').send(value).expect(201)).body.data;
  const resolve = async () => (await request(app).get('/api/public/popup-banners/resolve').query({ pageUrl: 'https://shop.example.com/' }).expect(200)).body.data;
  assert.equal(await resolve(), null);
  const published = (await admin.patch('/api/popup-banners/' + created.id + '/status').send({ status: 'active' }).expect(200)).body.data;
  assert.equal(published.hasUnpublishedChanges, false);
  const runtime = await resolve();
  assert.equal(runtime.campaign.blockDocument.root.children[0].props.text, 'Published heading');
  assert.equal(runtime.products[0].buyId, '9002');
  assert.deepEqual(runtime.campaign.blockDocument.root.mobile, { width: 350, paddingLeft: 16, paddingRight: 16 });
  const changed = structuredClone(value); changed.blockDocument.root.children[0].props.text = 'Draft heading'; changed.startsAt = '2099-01-01T00:00:00Z'; changed.targeting = { ...changed.targeting, mode: 'products' }; changed.productEntries = ['USED-IPHONE-128'];
  const updated = (await admin.put('/api/popup-banners/' + created.id).send(changed).expect(200)).body.data;
  assert.equal(updated.hasUnpublishedChanges, true);
  assert.equal((await resolve()).campaign.revision, runtime.campaign.revision);
  assert.equal((await resolve()).campaign.blockDocument.root.children[0].props.text, 'Published heading');
  changed.startsAt = null;
  await admin.put('/api/popup-banners/' + created.id).send(changed).expect(200);
  await admin.patch('/api/popup-banners/' + created.id + '/status').send({ status: 'active' }).expect(200);
  assert.equal(await resolve(), null);
  const targeted = (await request(app).get('/api/public/popup-banners/resolve').query({ pageUrl: 'https://shop.example.com/used-iphone-15/', article: 'USED-IPHONE-128' }).expect(200)).body.data;
  assert.equal(targeted.campaign.blockDocument.root.children[0].props.text, 'Draft heading');
  await admin.delete('/api/popup-banners/' + created.id).expect(204);
});

test('banner product bindings persist, publish independently and allow nested product overrides', async () => {
  const document = blockDocument([
    blockNode('title', 'text', { binding: 'product.title' }),
    blockNode('details', 'container', {}, [blockNode('photo', 'image', { binding: 'product.image' }), blockNode('link', 'button', { action: 'product', text: 'Відкрити' })]),
    blockNode('inherited', 'product', {}, [blockNode('inherited-title', 'text', { binding: 'product.title' })]),
    blockNode('override', 'product', { productExternalId: 'samsung-s24' }, [blockNode('override-title', 'text', { binding: 'product.title' }), blockNode('nested', 'product', {}, [blockNode('nested-title', 'text', { binding: 'product.title' })])])
  ]);
  Object.assign(document.root.props, { productExternalId: 'iphone-15-new', modificationExternalId: 'iphone-15-new:black' });
  const value = input({ campaignType: 'block', blockDocument: document, targeting: { ...input().targeting, mode: 'all_pages' }, productEntries: [], behavior: { ...input().behavior, requireAcknowledgement: false } });
  const preview = (await admin.post('/api/popup-banners/preview').send(value).expect(200)).body.data;
  assert.equal(preview.products.length, 2);
  const primary = preview.products.find(product => product.productExternalId === 'iphone-15-new');
  assert.equal(primary.modificationExternalId, 'iphone-15-new:black');
  for (const device of ['desktop', 'mobile']) {
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://shop.example.com/' });
    try {
      const runtime = createPopupBlockRuntime(dom.window, {});
      const mounted = runtime.mount(preview, { device, preview: true });
      const shadow = mounted.host.shadowRoot;
      assert.equal(shadow.querySelector('[data-block-id="title"]').textContent, primary.title);
      assert.equal(shadow.querySelector('[data-block-id="inherited-title"]').textContent, primary.title);
      assert.equal(shadow.querySelector('[data-block-id="photo"] img').src, primary.imageUrl);
      assert.equal(shadow.querySelector('[data-block-id="link"] a').href, primary.pageUrl);
      assert.equal(shadow.querySelector('[data-block-id="override-title"]').textContent, 'Смартфон Samsung Galaxy S24');
      assert.equal(shadow.querySelector('[data-block-id="nested-title"]').textContent, 'Смартфон Samsung Galaxy S24');
      mounted.dispose();
      const withoutOverride = runtime.mount({ ...preview, products: [primary] }, { device, preview: true });
      assert.equal(withoutOverride.host.shadowRoot.querySelector('[data-block-id="override"]'), null);
      withoutOverride.dispose();
      assert.equal(runtime.mount({ ...preview, products: [] }, { device, preview: true }), null);
    } finally { dom.window.close(); }
  }
  const created = (await admin.post('/api/popup-banners').send(value).expect(201)).body.data;
  const reopened = (await admin.get('/api/popup-banners/' + created.id).expect(200)).body.data;
  assert.equal(reopened.blockDocument.root.props.modificationExternalId, 'iphone-15-new:black');
  await admin.patch('/api/popup-banners/' + created.id + '/status').send({ status: 'active' }).expect(200);
  const resolve = async () => (await request(app).get('/api/public/popup-banners/resolve').query({ pageUrl: 'https://shop.example.com/' }).expect(200)).body.data;
  assert.equal((await resolve()).products.length, 2);
  Object.assign(document.root.props, { productExternalId: 'samsung-s24', modificationExternalId: '' });
  await admin.put('/api/popup-banners/' + created.id).send(value).expect(200);
  assert.equal((await resolve()).campaign.blockDocument.root.props.modificationExternalId, 'iphone-15-new:black');
  await admin.patch('/api/popup-banners/' + created.id + '/status').send({ status: 'active' }).expect(200);
  assert.equal((await resolve()).campaign.blockDocument.root.props.productExternalId, 'samsung-s24');
  for (const productExternalId of ['', 'pixel-unavailable']) {
    document.root.props.productExternalId = productExternalId;
    await admin.put('/api/popup-banners/' + created.id).send(value).expect(200);
    await admin.patch('/api/popup-banners/' + created.id + '/status').send({ status: 'active' }).expect(422);
    assert.equal((await resolve()).campaign.blockDocument.root.props.productExternalId, 'samsung-s24');
  }
  await admin.delete('/api/popup-banners/' + created.id).expect(204);
});

test('block forms validate the published fields, hide rewards until submission and preserve historical contacts', async () => {
  const code = (await admin.post('/api/promo-codes').send({ internalName: 'Block reward', code: 'BLOCKREWARD17', type: 'percent_coupon', discountValue: 17, currency: '', startsAt: null, endsAt: null, usageLimit: null, scopeNote: '', enabled: true, horoshopConfirmed: true }).expect(201)).body.data;
  const form = blockNode('lead', 'form', { reward: 'promo_code', successMessage: 'Дякуємо за контакт' }, [blockNode('email', 'field', { fieldType: 'email', text: 'Email', required: true }), blockNode('submit', 'button', { action: 'submit', text: 'Надіслати' })]);
  const value = input({ campaignType: 'block', promoCodeId: code.id, blockDocument: blockDocument([form]), targeting: { ...input().targeting, mode: 'all_pages' }, productEntries: [], behavior: { ...input().behavior, requireAcknowledgement: false } });
  const created = (await admin.post('/api/popup-banners').send(value).expect(201)).body.data;
  await admin.patch('/api/popup-banners/' + created.id + '/status').send({ status: 'active' }).expect(200);
  const resolved = (await request(app).get('/api/public/popup-banners/resolve').query({ pageUrl: 'https://shop.example.com/' }).expect(200)).body.data;
  assert.equal(resolved.campaign.promoCode, null);
  assert.ok(!JSON.stringify(resolved).includes('BLOCKREWARD17'));
  const endpoint = '/api/public/popup-banners/' + created.publicId + '/contacts';
  const contact = { formId: 'lead', revision: resolved.campaign.revision, device: 'mobile', pageUrl: 'https://shop.example.com/', values: { email: 'block@example.com' } };
  await request(app).post(endpoint).set('X-Forwarded-For', '192.0.2.77').send({ ...contact, values: { email: 'invalid' } }).expect(422);
  const sent = (await request(app).post(endpoint).set('X-Forwarded-For', '192.0.2.77').send(contact).expect(201)).body.data;
  assert.equal(sent.promoCode.code, 'BLOCKREWARD17'); assert.equal(sent.successMessage, 'Дякуємо за контакт');
  await request(app).post(endpoint).set('X-Forwarded-For', '192.0.2.77').send(contact).expect(200);
  value.blockDocument.root.children[0].children.splice(1, 0, blockNode('phone', 'field', { fieldType: 'phone', text: 'Телефон', required: true }));
  await admin.put('/api/popup-banners/' + created.id).send(value).expect(200);
  await request(app).post(endpoint).set('X-Forwarded-For', '192.0.2.77').send(contact).expect(200);
  await admin.patch('/api/popup-banners/' + created.id + '/status').send({ status: 'active' }).expect(200);
  await request(app).post(endpoint).set('X-Forwarded-For', '192.0.2.77').send(contact).expect(409);
  const next = (await request(app).get('/api/public/popup-banners/resolve').query({ pageUrl: 'https://shop.example.com/' }).expect(200)).body.data;
  await request(app).post(endpoint).set('X-Forwarded-For', '192.0.2.77').send({ ...contact, revision: next.campaign.revision, values: { email: 'new@example.com', phone: '+380671234567' } }).expect(201);
  const feed = (await admin.get('/api/popup-banners/' + created.id + '/contacts').expect(200)).body.data;
  assert.equal(feed.total, 2); assert.ok(feed.items.some(item => item.fields.length === 1)); assert.ok(feed.items.some(item => item.fields.length === 2));
  const workbook = await admin.get('/api/popup-banners/' + created.id + '/contacts/export').buffer(true).parse(binaryParser).expect(200);
  assert.ok(workbook.body.length > 100);
  await admin.delete('/api/popup-banners/' + created.id).expect(204);
  assert.equal((await pool.query('SELECT * FROM popup_banner_contacts WHERE campaign_id = $1', [created.id])).rows.length, 0);
});

test('block publication rejects unsafe links, unbound products and incomplete visible forms', async () => {
  const value = input({ campaignType: 'block', blockDocument: blockDocument([blockNode('unsafe', 'button', { action: 'link', href: 'javascript:alert(1)' })]), targeting: { ...input().targeting, mode: 'all_pages' }, productEntries: [], behavior: { ...input().behavior, requireAcknowledgement: false } });
  const created = (await admin.post('/api/popup-banners').send(value).expect(201)).body.data;
  for (const document of [value.blockDocument, blockDocument([blockNode('unbound', 'product')]), blockDocument([blockNode('form', 'form', {}, [blockNode('email', 'field', { fieldType: 'email' })])])]) {
    await admin.put('/api/popup-banners/' + created.id).send({ ...value, blockDocument: document }).expect(200);
    await admin.patch('/api/popup-banners/' + created.id + '/status').send({ status: 'active' }).expect(422);
  }
  const bad = structuredClone(value.blockDocument); bad.root.children.push(structuredClone(bad.root.children[0]));
  await admin.put('/api/popup-banners/' + created.id).send({ ...value, blockDocument: bad }).expect(422);
  await admin.delete('/api/popup-banners/' + created.id).expect(204);
});

test('authenticated preview API returns the storefront runtime payload for an unsaved campaign', async () => {
  await request(app).post('/api/popup-banners/preview').send(input()).expect(401);
  const preview = await admin.post('/api/popup-banners/preview').send(input({
    campaignType: 'product_promo',
    content: {
      ...input().content,
      eyebrow: '',
      title: '',
      body: '',
      primaryLabel: 'Купити'
    },
    targeting: { ...input().targeting, mode: 'all_pages' },
    behavior: { ...input().behavior, requireAcknowledgement: false },
    productEntries: [],
    promoItems: [{
      productExternalId: 'iphone-15-new',
      modificationExternalId: 'iphone-15-new:black'
    }]
  })).expect(200);

  assert.equal(preview.body.data.campaign.publicId, 'preview');
  assert.equal(preview.body.data.campaign.type, 'product_promo');
  assert.equal(preview.body.data.campaign.mode, 'all_pages');
  assert.equal(preview.body.data.products.length, 1);
  assert.equal(preview.body.data.products[0].title, 'Смартфон Apple iPhone 15 128GB New Black');
  assert.equal(preview.body.data.products[0].imageUrl, 'https://cdn.example.com/iphone-15-black.webp');
  assert.equal(preview.body.data.products[0].buyId, '9002');
});

test('embed runtime renders a supplied preview payload without resolving, tracking, or persisting it', async () => {
  const payload = {
    campaign: {
      publicId: 'preview', revision: 'preview-1', type: 'message', mode: 'all_pages',
      content: { eyebrow: 'Прев’ю', title: 'Точний runtime', body: 'Той самий embed-скрипт.', primaryLabel: 'Добре', primaryUrl: '', secondaryLabel: '', imageUrl: '', acknowledgementLabel: '' },
      styles: input().styles,
      behavior: { ...input().behavior, frequency: 'session', device: 'mobile', requireAcknowledgement: false, buttonCount: 1 },
      promoCode: null
    },
    product: null,
    recommendations: [],
    products: []
  };
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true, runScripts: 'outside-only', url: 'https://mt-panel.example.com/preview'
  });
  Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 1440 });
  const embed = dom.window.document.createElement('script');
  embed.dataset.previewPayload = JSON.stringify(payload);
  embed.dataset.previewDevice = 'mobile';
  Object.defineProperty(dom.window.document, 'currentScript', { configurable: true, value: embed });
  dom.window.MutationObserver = class MutationObserver { observe() {} disconnect() {} };
  let fetches = 0;
  dom.window.fetch = async () => { fetches += 1; throw new Error('Preview must not use public resolve or analytics.'); };
  dom.window.eval(popupEmbedScript('https://mt-panel.example.com'));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 20));

  const host = dom.window.document.querySelector('#mt-popup-banner-root');
  assert.ok(host);
  assert.equal(host.shadowRoot.querySelector('.title').textContent, 'Точний runtime');
  assert.equal(fetches, 0);
  assert.equal(dom.window.localStorage.getItem('mt-popup-visitor'), null);
  assert.equal(dom.window.sessionStorage.length, 0);
  dom.window.close();
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
  assert.equal(created.body.data.styles.timelineColor, '#6d5dfc');
  assert.equal(created.body.data.styles.timelineTrackColor, '#ede9fe');
  assert.equal(created.body.data.styles.showPromoTitle, false);
  assert.equal(created.body.data.styles.buttonBorderRadius, 12);
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
  const analytics = await admin.get('/api/popup-banners/analytics/overview').query({ days: 30 }).expect(200);
  assert.equal(analytics.body.data.totals.impressions, 1);
  assert.equal(analytics.body.data.totals.uniqueVisitors, 1);
  assert.equal(analytics.body.data.campaigns[0].name, created.body.data.name);
  assert.equal(analytics.body.data.pages[0].pageUrl, 'https://shop.example.com/used-iphone-15/');
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

test('information popup persists exit intent as a display condition', async () => {
  const exitPageUrl = 'https://shop.example.com/exit-offer-test/';
  const created = await admin.post('/api/popup-banners').send(input({
    campaignType: 'message',
    name: 'Попап за наміром вийти',
    content: {
      ...input().content,
      eyebrow: 'Зачекайте',
      title: 'Не поспішайте йти',
      body: 'Для вас є спеціальна пропозиція.',
      primaryLabel: 'Переглянути пропозицію',
      primaryUrl: '/special-offer/',
      secondaryLabel: 'Ні, дякую',
      acknowledgementLabel: ''
    },
    targeting: {
      ...input().targeting,
      mode: 'target_page',
      targetPageUrl: exitPageUrl
    },
    behavior: {
      ...input().behavior,
      trigger: 'exit_intent',
      delayMs: 5000,
      frequency: 'session',
      maxShowsPerSession: 1,
      requireAcknowledgement: true
    },
    productEntries: [],
    promoItems: []
  })).expect(201);

  assert.equal(created.body.data.campaignType, 'message');
  assert.equal(created.body.data.behavior.trigger, 'exit_intent');
  assert.equal(created.body.data.behavior.delayMs, 5000);
  assert.equal(created.body.data.behavior.requireAcknowledgement, true);
  assert.equal(created.body.data.promoProducts.length, 0);

  const activated = await admin.patch(`/api/popup-banners/${created.body.data.id}/status`)
    .send({ status: 'active' }).expect(200);
  const resolved = await request(app)
    .get('/api/public/popup-banners/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: exitPageUrl })
    .expect(200);
  assert.equal(resolved.body.data.campaign.publicId, created.body.data.publicId);
  assert.equal(resolved.body.data.campaign.type, 'message');
  assert.equal(resolved.body.data.campaign.revision, activated.body.data.updatedAt);
  assert.equal(resolved.body.data.campaign.behavior.trigger, 'exit_intent');
  assert.equal(resolved.body.data.products.length, 0);

  await admin.patch(`/api/popup-banners/${created.body.data.id}/status`).send({ status: 'paused' }).expect(200);
});

test('exit intent is rejected for product promo and out-of-stock campaigns', async () => {
  await admin.post('/api/popup-banners').send(input({
    campaignType: 'product_promo',
    name: 'Невалідний товарний банер',
    behavior: { ...input().behavior, trigger: 'exit_intent' },
    targeting: { ...input().targeting, mode: 'all_pages' },
    promoItems: [{ productExternalId: 'iphone-15-new', modificationExternalId: null }]
  })).expect(422);

  await admin.post('/api/popup-banners').send(input({
    campaignType: 'out_of_stock_recommendations',
    name: 'Невалідні альтернативи',
    behavior: { ...input().behavior, trigger: 'exit_intent' },
    targeting: { ...input().targeting, mode: 'out_of_stock' }
  })).expect(422);
});

test('exit-intent condition waits for independent desktop and mobile exit signals', async (t) => {
  const script = popupEmbedScript('https://mt-panel.example.com');
  const payload = {
    campaign: {
      publicId: 'exit-offer-runtime',
      type: 'message',
      mode: 'all_pages',
      content: {
        eyebrow: 'Зачекайте', title: 'Не поспішайте йти', body: 'Для вас є спеціальна пропозиція.',
        primaryLabel: 'Переглянути', primaryUrl: '/offer/', secondaryLabel: 'Ні, дякую',
        imageUrl: '', acknowledgementLabel: ''
      },
      styles: {
        layout: 'modal', promoFormat: 'notification', desktopPosition: 'bottom_right', mobilePosition: 'bottom',
        accentColor: '#6d5dfc', backgroundColor: '#ffffff', textColor: '#172033', mutedColor: '#667085',
        primaryButtonBackgroundColor: '#ffe101', primaryButtonTextColor: '#111827',
        secondaryButtonBackgroundColor: '#ffffff', secondaryButtonTextColor: '#172033',
        checkboxAccentColor: '#6d5dfc', checkboxCheckColor: '#ffffff', checkboxTextColor: '#172033',
        timelineColor: '#6d5dfc', timelineTrackColor: '#ede9fe', showPromoTitle: false,
        eyebrowFontSize: 12, titleFontSize: 34, bodyFontSize: 16, acknowledgementFontSize: 14,
        buttonFontSize: 16, buttonBorderRadius: 12, borderRadius: 24, maxWidth: 560
      },
      behavior: {
        trigger: 'exit_intent', delayMs: 0, scrollPercent: 35, inactivitySeconds: 8,
        frequency: 'always', cooldownHours: 24, cooldownDays: 7, maxShowsPerSession: 0,
        device: 'all', autoCloseSeconds: 0, rotationSeconds: 6,
        activeWeekdays: [1, 2, 3, 4, 5, 6, 7], dailyStartTime: '', dailyEndTime: '',
        scheduleTimezone: 'Europe/Kyiv', dismissible: true, requireAcknowledgement: false, buttonCount: 2
      }
    },
    product: null,
    recommendations: [],
    products: []
  };
  const surfaces = [
    { name: 'desktop', width: 1366, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    { name: 'mobile', width: 390, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36' }
  ];

  for (const surface of surfaces) {
    const dom = new JSDOM('<!doctype html><html><body><main>Storefront</main></body></html>', {
      pretendToBeVisual: true,
      runScripts: 'outside-only',
      url: `https://shop.example.com/${surface.name}/`
    });
    t.after(() => dom.window.close());
    Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: surface.width });
    Object.defineProperty(dom.window.navigator, 'userAgent', { configurable: true, value: surface.userAgent });
    Object.defineProperty(dom.window, 'scrollY', { configurable: true, value: 0 });
    dom.window.MutationObserver = class MutationObserver { observe() {} disconnect() {} };
    dom.window.fetch = async (input) => {
      const url = new URL(String(input));
      return url.pathname.endsWith('/resolve')
        ? { ok: true, json: async () => ({ data: structuredClone(payload) }) }
        : { ok: true, json: async () => ({}) };
    };
    dom.window.eval(script);
    await new Promise((resolve) => dom.window.setTimeout(resolve, 30));
    assert.equal(dom.window.document.querySelector('#mt-popup-banner-root'), null);

    if (surface.name === 'desktop') {
      dom.window.document.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true, clientY: 120 }));
      assert.equal(dom.window.document.querySelector('#mt-popup-banner-root'), null);
      dom.window.document.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true, clientY: 0 }));
    } else {
      const shallowStart = new dom.window.Event('touchstart', { bubbles: true });
      Object.defineProperty(shallowStart, 'touches', { value: [{ clientY: 80 }] });
      dom.window.document.dispatchEvent(shallowStart);
      const shallowEnd = new dom.window.Event('touchend', { bubbles: true });
      Object.defineProperty(shallowEnd, 'changedTouches', { value: [{ clientY: 170 }] });
      dom.window.document.dispatchEvent(shallowEnd);
      assert.equal(dom.window.document.querySelector('#mt-popup-banner-root'), null);

      Object.defineProperty(dom.window, 'scrollY', { configurable: true, value: 220 });
      dom.window.dispatchEvent(new dom.window.Event('scroll'));
      const touchStart = new dom.window.Event('touchstart', { bubbles: true });
      Object.defineProperty(touchStart, 'touches', { value: [{ clientY: 80 }] });
      dom.window.document.dispatchEvent(touchStart);
      Object.defineProperty(dom.window, 'scrollY', { configurable: true, value: 20 });
      const touchEnd = new dom.window.Event('touchend', { bubbles: true });
      Object.defineProperty(touchEnd, 'changedTouches', { value: [{ clientY: 170 }] });
      dom.window.document.dispatchEvent(touchEnd);
    }

    await new Promise((resolve) => dom.window.setTimeout(resolve, 20));
    const host = dom.window.document.querySelector('#mt-popup-banner-root');
    assert.ok(host, `${surface.name} exit signal should render the popup`);
    assert.ok(host.shadowRoot.querySelector('.card'));
    assert.equal(host.shadowRoot.querySelector('.card.is-recommendations'), null);
    assert.equal(host.shadowRoot.querySelector('.card').getAttribute('aria-modal'), 'true');
    assert.equal(host.shadowRoot.querySelector('.title')?.textContent, 'Не поспішайте йти');
    assert.equal(host.shadowRoot.querySelector('.body')?.textContent, 'Для вас є спеціальна пропозиція.');
  }
});

test('exit-intent condition keeps an early desktop signal until its activation delay elapses', async (t) => {
  const script = popupEmbedScript('https://mt-panel.example.com');
  const payload = {
    campaign: {
      publicId: 'exit-offer-delayed-runtime',
      revision: '2026-09-07T12:00:00.000Z',
      type: 'message',
      mode: 'all_pages',
      content: {
        eyebrow: 'Зачекайте', title: 'Не поспішайте йти', body: 'Для вас є спеціальна пропозиція.',
        primaryLabel: 'Переглянути', primaryUrl: '/offer/', secondaryLabel: 'Ні, дякую',
        imageUrl: '', acknowledgementLabel: ''
      },
      styles: {
        layout: 'modal', promoFormat: 'notification', desktopPosition: 'bottom_right', mobilePosition: 'bottom',
        accentColor: '#6d5dfc', backgroundColor: '#ffffff', textColor: '#172033', mutedColor: '#667085',
        primaryButtonBackgroundColor: '#ffe101', primaryButtonTextColor: '#111827',
        secondaryButtonBackgroundColor: '#ffffff', secondaryButtonTextColor: '#172033',
        checkboxAccentColor: '#6d5dfc', checkboxCheckColor: '#ffffff', checkboxTextColor: '#172033',
        timelineColor: '#6d5dfc', timelineTrackColor: '#ede9fe', showPromoTitle: false,
        eyebrowFontSize: 12, titleFontSize: 34, bodyFontSize: 16, acknowledgementFontSize: 14,
        buttonFontSize: 16, buttonBorderRadius: 12, borderRadius: 24, maxWidth: 560
      },
      behavior: {
        trigger: 'exit_intent', delayMs: 60, scrollPercent: 35, inactivitySeconds: 8,
        frequency: 'always', cooldownHours: 24, cooldownDays: 7, maxShowsPerSession: 0,
        device: 'desktop', autoCloseSeconds: 0, rotationSeconds: 6,
        activeWeekdays: [1, 2, 3, 4, 5, 6, 7], dailyStartTime: '', dailyEndTime: '',
        scheduleTimezone: 'Europe/Kyiv', dismissible: true, requireAcknowledgement: false, buttonCount: 1
      }
    },
    product: null,
    recommendations: [],
    products: []
  };
  const dom = new JSDOM('<!doctype html><html><body><main>Storefront</main></body></html>', {
    pretendToBeVisual: true,
    runScripts: 'outside-only',
    url: 'https://shop.example.com/delayed-exit/'
  });
  t.after(() => dom.window.close());
  Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 1366 });
  Object.defineProperty(dom.window.navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  });
  dom.window.sessionStorage.setItem('mt-popup-count:exit-offer-delayed-runtime', '99');
  dom.window.sessionStorage.setItem(
    'mt-popup-count:exit-offer-delayed-runtime:2026-09-06T12:00:00.000Z',
    '99'
  );
  dom.window.MutationObserver = class MutationObserver { observe() {} disconnect() {} };
  dom.window.fetch = async (input) => new URL(String(input)).pathname.endsWith('/resolve')
    ? { ok: true, json: async () => ({ data: structuredClone(payload) }) }
    : { ok: true, json: async () => ({}) };

  dom.window.eval(script);
  await new Promise((resolve) => dom.window.setTimeout(resolve, 15));
  dom.window.document.documentElement.dispatchEvent(new dom.window.MouseEvent('mouseleave', {
    clientY: -1,
    relatedTarget: null
  }));
  assert.equal(dom.window.document.querySelector('#mt-popup-banner-root'), null);

  await new Promise((resolve) => dom.window.setTimeout(resolve, 70));
  assert.ok(dom.window.document.querySelector('#mt-popup-banner-root'));
  assert.equal(dom.window.sessionStorage.getItem(
    'mt-popup-count:exit-offer-delayed-runtime:2026-09-07T12:00:00.000Z'
  ), '1');
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
  const nativeAttempts = [];
  const focusCalls = [];
  const fetchedUrls = [];
  let rejectNativeAppend = true;
  let nativeQuantity = '12';
  let nativeLayout = 'desktop';
  let nativeInCart = false;
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
        timelineColor: '#6d5dfc',
        timelineTrackColor: '#ede9fe',
        showPromoTitle: false,
        eyebrowFontSize: 12,
        titleFontSize: 34,
        bodyFontSize: 16,
        acknowledgementFontSize: 14,
        buttonFontSize: 16,
        buttonBorderRadius: 12,
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
      oldPrice: '599',
      currency: 'UAH',
      imageUrl: 'https://shop.example.com/recommended.jpg',
      pageUrl: 'https://shop.example.com/recommended-product/',
      buyId: 'REC-1'
    }, {
      productId: 'regular-product',
      modificationId: null,
      article: 'REGULAR-1',
      title: 'Товар без знижки',
      price: '499',
      oldPrice: '',
      currency: 'UAH',
      imageUrl: 'https://shop.example.com/regular.jpg',
      pageUrl: 'https://shop.example.com/regular-product/',
      buyId: 'REGULAR-1'
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
      nativeAttempts.push(product);
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
      const nativeButtonClass = nativeInCart ? 'j-buy-button-remove' : 'j-buy-button-add';
      const button = `<button class="btn ${nativeButtonClass}" id="j-buy-button-widget-1963"
        data-skin="mobile" data-quantity="${nativeQuantity}" data-gift="0"
        data-cartproducttype="product">${nativeInCart ? 'В кошику' : 'Купити'}</button>`;
      const orderBox = nativeLayout === 'mobile'
        ? `<div class="productsSlider-i"><button class="j-buy-button-add" id="j-buy-button-widget-7777"
             data-skin="small_mobile" data-quantity="1" data-gift="0" data-cartproducttype="product">Купити інший</button></div>
           <div class="product__block--orderBox"><div data-view-block="orderBox">
             <div class="product-card product-card--main" itemprop="offers">
               <div class="product-card__buy-button">${button}</div>
             </div>
           </div></div>`
        : `<div class="product-order__block--buy">${button}</div>`;
      return {
        ok: true,
        url: url.href,
        text: async () => `<meta itemprop="sku" content="REC-1">
        ${orderBox}`
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
  const priceBlocks = [...shadow.querySelectorAll('.recommendation-price')];
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
  assert.doesNotMatch(css, /flex:0 0:min\(74vw/u);
  assert.match(css, /\.recommendation-image\{background:#fff\}/u);
  assert.match(css, /\.recommendation-price\.is-discounted strong\{color:#dc2626\}/u);
  assert.equal(priceBlocks[0].classList.contains('is-discounted'), true);
  assert.equal(priceBlocks[0].querySelector('strong').textContent, '399 грн');
  assert.equal(priceBlocks[0].querySelector('del').textContent, '599 грн');
  assert.equal(priceBlocks[1].classList.contains('is-discounted'), false);
  assert.equal(priceBlocks[1].querySelector('del'), null);
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
  assert.equal(nativeAttempts.at(-1).id, '1963');

  cartProducts.set('1963', { id: '1963', type: 'product', quantity: 1 });
  buyButton.click();
  await new Promise((resolve) => dom.window.setTimeout(resolve, 30));
  assert.equal(dom.window.document.querySelector('#mt-popup-banner-root'), host);
  assert.equal(buyButton.disabled, true);
  assert.equal(buyButton.textContent, 'У кошику');
  assert.equal(buyButton.title, 'Товар уже додано до кошика.');
  assert.deepEqual(nativeClicks, []);

  cartProducts.delete('1963');
  buyButton.disabled = false;
  buyButton.textContent = 'Купити';
  buyButton.title = '';
  nativeLayout = 'mobile';
  nativeInCart = true;
  buyButton.click();
  await new Promise((resolve) => dom.window.setTimeout(resolve, 30));
  assert.equal(dom.window.document.querySelector('#mt-popup-banner-root'), host);
  assert.equal(buyButton.disabled, true);
  assert.equal(buyButton.textContent, 'У кошику');
  assert.equal(nativeClicks.length, 0);

  buyButton.disabled = false;
  buyButton.textContent = 'Купити';
  buyButton.title = '';
  nativeInCart = false;
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
  assert.equal(iphone.oldPrice, '35999');
});

test('product promo campaigns keep promoted products separate from storefront targeting', async () => {
  const campaigns = (await admin.get('/api/popup-banners').expect(200)).body.data;
  for (const campaign of campaigns.filter((item) => item.status === 'active')) {
    await admin.patch(`/api/popup-banners/${campaign.id}/status`).send({ status: 'paused' }).expect(200);
  }

  const created = await admin.post('/api/popup-banners').send(input({
    campaignType: 'product_promo',
    name: 'Промо смартфона',
    priority: 900,
    content: {
      ...input().content,
      eyebrow: '',
      title: '',
      body: '',
      imageUrl: '',
      primaryLabel: 'Купити'
    },
    styles: {
      ...input().styles,
      desktopPosition: 'bottom_left',
      maxWidth: 380
    },
    targeting: {
      mode: 'all_pages', match: 'all', stickers: [], brands: [], categoryIds: [],
      conditions: [], targetPageUrl: '', urlContains: [], recommendationLimit: 6
    },
    behavior: {
      trigger: 'delay', delayMs: 0, scrollPercent: 35, inactivitySeconds: 8,
      frequency: 'session', cooldownHours: 24, cooldownDays: 7, maxShowsPerSession: 1,
      device: 'all', autoCloseSeconds: 0, rotationSeconds: 6,
      activeWeekdays: [1, 2, 3, 4, 5, 6, 7], dailyStartTime: '', dailyEndTime: '', scheduleTimezone: 'Europe/Kyiv',
      dismissible: true, requireAcknowledgement: false, buttonCount: 1
    },
    productEntries: [],
    promoItems: [{
      productExternalId: 'iphone-15-new',
      modificationExternalId: 'iphone-15-new:black'
    }]
  })).expect(201);

  assert.equal(created.body.data.campaignType, 'product_promo');
  assert.equal(created.body.data.content.title, '');
  assert.equal(created.body.data.content.body, '');
  assert.equal(created.body.data.productTargets.length, 0);
  assert.equal(created.body.data.promoProducts.length, 1);
  assert.equal(created.body.data.promoProducts[0].sku, 'IPHONE-15-NEW-BLACK');
  assert.equal(created.body.data.promoProducts[0].position, 0);
  assert.equal(created.body.data.promoProducts[0].buyId, '9002');
  await admin.post('/api/popup-banners').send(input({
    campaignType: 'product_promo',
    content: { ...input().content, title: '', body: '' },
    styles: { ...input().styles, promoFormat: 'compact' }
  })).expect(422);
  await admin.patch(`/api/popup-banners/${created.body.data.id}/status`).send({ status: 'active' }).expect(200);

  const resolved = await request(app)
    .get('/api/public/popup-banners/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: 'https://shop.example.com/sale/' })
    .expect(200);
  assert.equal(resolved.body.data.campaign.type, 'product_promo');
  assert.equal(resolved.body.data.campaign.mode, 'all_pages');
  assert.equal(resolved.body.data.product, null);
  assert.equal(resolved.body.data.products.length, 1);
  assert.equal(resolved.body.data.products[0].article, 'IPHONE-15-NEW-BLACK');
  assert.equal(resolved.body.data.products[0].sku, 'IPHONE-15-NEW-BLACK');
  assert.equal(resolved.body.data.products[0].oldPrice, '35999');
  assert.equal(resolved.body.data.products[0].imageUrl, 'https://cdn.example.com/iphone-15-black.webp');
  assert.equal(resolved.body.data.campaign.styles.promoFormat, 'notification');
  assert.equal(resolved.body.data.campaign.styles.desktopPosition, 'bottom_left');
  assert.equal(resolved.body.data.campaign.behavior.maxShowsPerSession, 1);
  assert.equal(resolved.body.data.campaign.behavior.scheduleTimezone, 'Europe/Kyiv');
  assert.deepEqual(resolved.body.data.recommendations, []);
});

test('campaign weekday schedule is enforced in its configured timezone', async () => {
  const campaigns = (await admin.get('/api/popup-banners').expect(200)).body.data;
  for (const campaign of campaigns.filter((item) => item.status === 'active')) {
    await admin.patch(`/api/popup-banners/${campaign.id}/status`).send({ status: 'paused' }).expect(200);
  }

  const weekdayName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Kyiv',
    weekday: 'short'
  }).format(new Date());
  const today = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[weekdayName];
  const inactiveWeekday = ((today + 2) % 7) + 1;
  const created = await admin.post('/api/popup-banners').send(input({
    name: 'Кампанія поза розкладом',
    priority: 1000,
    targeting: {
      mode: 'target_page', match: 'all', stickers: [], brands: [], categoryIds: [],
      conditions: [], targetPageUrl: 'https://shop.example.com/scheduled/', urlContains: [], recommendationLimit: 6
    },
    behavior: {
      ...input().behavior,
      activeWeekdays: [inactiveWeekday],
      scheduleTimezone: 'Europe/Kyiv'
    }
  })).expect(201);
  await admin.patch(`/api/popup-banners/${created.body.data.id}/status`).send({ status: 'active' }).expect(200);

  const resolved = await request(app)
    .get('/api/public/popup-banners/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: 'https://shop.example.com/scheduled/' })
    .expect(200);
  assert.equal(resolved.body.data, null);
});

test('product promo widget is non-modal on desktop and mobile storefront contracts', async () => {
  const payload = {
    campaign: {
      publicId: 'public-product-promo',
      type: 'product_promo',
      mode: 'all_pages',
      content: {
        eyebrow: 'Рекомендуємо', title: 'Вигідна пропозиція',
        body: 'Товари, які можуть вас зацікавити.', primaryLabel: 'Купити', imageUrl: ''
      },
      styles: {
        layout: 'corner', accentColor: '#6d5dfc', backgroundColor: '#ffffff',
        promoFormat: 'notification', desktopPosition: 'bottom_left', mobilePosition: 'top',
        textColor: '#172033', mutedColor: '#667085', primaryButtonBackgroundColor: '#ffe101',
        primaryButtonTextColor: '#111827', secondaryButtonBackgroundColor: '#ffffff',
        secondaryButtonTextColor: '#172033', checkboxAccentColor: '#6d5dfc',
        checkboxCheckColor: '#ffffff', checkboxTextColor: '#172033',
        timelineColor: '#22c55e', timelineTrackColor: '#dcfce7', showPromoTitle: true, eyebrowFontSize: 12,
        titleFontSize: 28, bodyFontSize: 16, acknowledgementFontSize: 14,
        buttonFontSize: 16, buttonBorderRadius: 18, borderRadius: 22, maxWidth: 680
      },
      behavior: {
        trigger: 'delay', delayMs: 0, scrollPercent: 35, inactivitySeconds: 8,
        frequency: 'always', cooldownHours: 24, cooldownDays: 7, maxShowsPerSession: 0,
        device: 'all', autoCloseSeconds: 0, rotationSeconds: 6,
        activeWeekdays: [1, 2, 3, 4, 5, 6, 7], dailyStartTime: '', dailyEndTime: '', scheduleTimezone: 'Europe/Kyiv',
        dismissible: true, requireAcknowledgement: false, buttonCount: 1
      }
    },
    product: null,
    recommendations: [],
    products: [{
      productId: 'promo-product', modificationId: 'promo-modification', article: 'PROMO-1',
      sku: 'PROMO-1', title: 'Промотовар', price: '399', oldPrice: '599', currency: 'UAH',
      imageUrl: 'https://shop.example.com/promo_+a1b2c3d4.jpg', pageUrl: 'https://shop.example.com/promo/', buyId: '9002'
    }, {
      productId: 'promo-product-2', modificationId: null, article: 'PROMO-2',
      sku: 'PROMO-2', title: 'Другий промотовар', price: '499', oldPrice: '', currency: 'UAH',
      imageUrl: 'https://shop.example.com/promo-2.jpg', pageUrl: 'https://shop.example.com/promo-2/', buyId: '9003'
    }]
  };

  const formats = ['notification', 'compact', 'standard', 'wide', 'custom'];
  for (const surface of [{ name: 'desktop', width: 1440, userAgent: 'Mozilla/5.0 Chrome/140' }, {
    name: 'mobile', width: 390, userAgent: 'Mozilla/5.0 (Linux; Android 16) Chrome/140 Mobile Safari/537.36'
  }]) {
    for (const format of formats) {
    const runtimePayload = structuredClone(payload);
    runtimePayload.campaign.styles.promoFormat = format;
    const cartMarkup = surface.name === 'desktop'
      ? '<section id="cart" class="popup __cart" style="display:block"></section>'
      : '<div id="cart-drawer" class="cart mm-opened"><div id="cart"></div></div>';
    const dom = new JSDOM(`<!doctype html><html><body>
      <button id="storefront-control">Каталог</button>
      ${cartMarkup}
      <div class="productsSlider-i">
        <a href="https://shop.example.com/promo/">Промотовар</a>
        <button class="j-buy-button-add" id="j-buy-button-widget-9002" data-quantity="1" data-cartproducttype="product">Купити</button>
      </div>
    </body></html>`, {
      pretendToBeVisual: true,
      runScripts: 'outside-only',
      url: `https://shop.example.com/${surface.name}/`
    });
    Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: surface.width });
    Object.defineProperty(dom.window.navigator, 'userAgent', { configurable: true, value: surface.userAgent });
    dom.window.MutationObserver = class MutationObserver { observe() {} };
    const focusCalls = [];
    const nativeProducts = new Map();
    let cartReloads = 0;
    const nativeCart = {
      appendProduct(product) {
        dom.window.setTimeout(() => nativeProducts.set(String(product.id), product), 10);
      },
      getProductById(id, type) {
        const product = nativeProducts.get(String(id));
        return product?.type === type ? product : null;
      },
      reloadHtml() { cartReloads += 1; }
    };
    dom.window.AjaxCart = { openCartOnAdd: false, getInstance: () => nativeCart };
    dom.window.document.querySelector('#j-buy-button-widget-9002').addEventListener('click', () => {
      nativeCart.appendProduct({ id: '9002', type: 'product', quantity: 1 });
    });
    dom.window.HTMLElement.prototype.focus = function focus() { focusCalls.push(this); };
    dom.window.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/resolve')) return { ok: true, json: async () => ({ data: runtimePayload }) };
      if (url.pathname.endsWith('/events')) return { ok: true };
      throw new Error(`Unexpected fetch: ${url.href}`);
    };

    dom.window.eval(popupEmbedScript('https://mt-panel.example.com'));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 50));
    try {
    const host = dom.window.document.querySelector('#mt-popup-banner-root');
    const shadow = host.shadowRoot;
    assert.equal(host.style.inset, '');
    assert.equal(host.style.pointerEvents, 'none');
    if (surface.name === 'desktop') {
      assert.notEqual(host.style.left, '');
      assert.notEqual(host.style.bottom, '');
      assert.equal(host.style.right, '');
    } else {
      assert.notEqual(host.style.top, '');
      assert.equal(host.style.bottom, '');
      assert.equal(host.style.left, '50%');
    }
    assert.equal(shadow.querySelector('.backdrop'), null);
    const promoHost = shadow.querySelector('.product-promo-host');
    assert.ok(promoHost);
    assert.equal(promoHost.style.getPropertyValue('--timeline'), '#22c55e');
    assert.equal(promoHost.style.getPropertyValue('--timeline-track'), '#dcfce7');
    assert.equal(promoHost.style.getPropertyValue('--button-radius'), '18px');
    assert.ok(shadow.querySelector(`.format-${format}`));
    assert.equal(shadow.querySelector('.card').classList.contains('has-promo-title'), format === 'compact');
    assert.equal(shadow.querySelector('.card').getAttribute('role'), 'complementary');
    assert.equal(shadow.querySelector('.card').getAttribute('aria-modal'), 'false');
    assert.equal(shadow.querySelectorAll('.recommendation').length, 2);
    assert.equal(shadow.querySelectorAll('.recommendation.is-visible').length, 1);
    assert.equal(shadow.querySelector('.recommendation-buy').textContent, 'Купити');
    assert.equal(shadow.querySelector('.recommendation-image').src, 'https://shop.example.com/promo.jpg');
    assert.equal(shadow.querySelector('.promo-card-link').href, 'https://shop.example.com/promo/');
    assert.ok(shadow.querySelector('.promo-timeline'));
    const card = shadow.querySelector('.card');
    const navigation = shadow.querySelector('.promo-navigation');
    assert.equal(navigation.querySelector('.promo-navigation-status').textContent, '1 / 2');
    assert.equal(navigation.querySelector('[aria-label="Попередній товар"] svg path').getAttribute('d'), 'M15 18 9 12l6-6');
    assert.equal(navigation.querySelector('[aria-label="Наступний товар"] svg path').getAttribute('d'), 'm9 6 6 6-6 6');
    card.dispatchEvent(new dom.window.FocusEvent('focusin', { bubbles: true }));
    navigation.querySelector('[aria-label="Наступний товар"]').click();
    assert.equal(navigation.querySelector('.promo-navigation-status').textContent, '2 / 2');
    assert.equal(card.classList.contains('is-rotation-paused'), false);
    assert.equal(shadow.querySelector('.promo-timeline span').classList.contains('is-running'), true);
    assert.equal(shadow.querySelector('.recommendation.is-visible .recommendation-title').textContent, 'Другий промотовар');
    assert.equal(shadow.querySelector('.promo-card-link').href, 'https://shop.example.com/promo-2/');
    navigation.querySelector('[aria-label="Попередній товар"]').click();
    assert.equal(navigation.querySelector('.promo-navigation-status').textContent, '1 / 2');
    card.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
    assert.equal(card.classList.contains('is-rotation-paused'), true);
    card.dispatchEvent(new dom.window.MouseEvent('mouseleave'));
    assert.equal(card.classList.contains('is-rotation-paused'), false);
    assert.equal(dom.window.document.body.style.overflow, '');
    assert.equal(focusCalls.length, 0);
    shadow.querySelector('.recommendation-buy').click();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 80));
    assert.equal(cartReloads, 1);
    assert.equal(shadow.querySelector('.recommendation-buy').textContent, 'У кошику');
    assert.ok(dom.window.document.querySelector('#storefront-control'));
    const runtimeCss = shadow.querySelector('style').textContent;
    assert.match(runtimeCss, /@media\(max-width:600px\).*is-product-promo/su);
    assert.match(runtimeCss, /recommendation-media\{grid-column:1;grid-row:1\/4/u);
    assert.match(runtimeCss, /format-compact:not\(\.has-promo-title\) \.title\{display:none\}/u);
    assert.match(runtimeCss, /\.card\.is-product-promo\.format-notification \.recommendation\{grid-template-areas:"media product-title buy" "media price buy"/u);
    assert.match(runtimeCss, /\.card\.is-product-promo\.is-rotation-paused \.promo-timeline span\{animation-play-state:paused\}/u);
    assert.doesNotMatch(runtimeCss, /\.card\.is-product-promo \.recommendations\{[^}]*overflow-[xy]:auto/u);
    } finally {
      dom.window.close();
    }
    }
  }
});

test('promo code library publishes immutable snapshots and records copy analytics', async () => {
  await pool.query("UPDATE popup_banner_campaigns SET status = 'paused'");
  const promoInput = {
    internalName: 'Осіння знижка',
    code: 'AUTUMN10',
    type: 'percent_coupon',
    discountValue: 10,
    currency: '',
    startsAt: null,
    endsAt: null,
    usageLimit: 250,
    scopeNote: 'Аксесуари Joyroom',
    enabled: true,
    horoshopConfirmed: true
  };
  const createdCode = await admin.post('/api/promo-codes').send(promoInput).expect(201);
  const promoCodeId = createdCode.body.data.id;
  assert.equal(createdCode.body.data.status, 'active');
  assert.equal(createdCode.body.data.code, 'AUTUMN10');
  await admin.post('/api/promo-codes').send({ ...promoInput, code: 'autumn10' }).expect(409);

  const campaignInput = input({
    campaignType: 'promo_code',
    name: 'Промокод для осінньої акції',
    promoCodeId,
    content: {
      ...input().content,
      eyebrow: 'Промокод',
      title: 'Знижка для вас',
      body: 'Скопіюйте код перед покупкою.',
      primaryLabel: 'До акції',
      primaryUrl: '/sale/',
      secondaryLabel: '',
      acknowledgementLabel: ''
    },
    targeting: { ...input().targeting, mode: 'all_pages' },
    behavior: {
      ...input().behavior,
      trigger: 'exit_intent',
      frequency: 'session',
      requireAcknowledgement: false,
      buttonCount: 1
    },
    productEntries: []
  });
  const createdCampaign = await admin.post('/api/popup-banners').send(campaignInput).expect(201);
  assert.equal(createdCampaign.body.data.promoCode.code, 'AUTUMN10');
  assert.equal(createdCampaign.body.data.publishedPromoCode, null);
  const campaignId = createdCampaign.body.data.id;
  const publicId = createdCampaign.body.data.publicId;
  await admin.patch(`/api/popup-banners/${campaignId}/status`).send({ status: 'active' }).expect(200);

  await admin.put(`/api/promo-codes/${promoCodeId}`).send({
    ...promoInput,
    internalName: 'Осіння знижка 15',
    code: 'AUTUMN15',
    discountValue: 15
  }).expect(200);
  const firstResolve = await request(app)
    .get('/api/public/popup-banners/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: 'https://shop.example.com/sale/' })
    .expect(200);
  assert.equal(firstResolve.body.data.campaign.type, 'promo_code');
  assert.equal(firstResolve.body.data.campaign.behavior.trigger, 'exit_intent');
  assert.equal(firstResolve.body.data.campaign.promoCode.code, 'AUTUMN10');
  assert.equal(firstResolve.body.data.campaign.promoCode.discountValue, 10);

  await admin.patch(`/api/popup-banners/${campaignId}/status`).send({ status: 'paused' }).expect(200);
  const republished = await admin.patch(`/api/popup-banners/${campaignId}/status`).send({ status: 'active' }).expect(200);
  assert.equal(republished.body.data.publishedPromoCode.code, 'AUTUMN15');
  const secondResolve = await request(app)
    .get('/api/public/popup-banners/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: 'https://shop.example.com/sale/' })
    .expect(200);
  assert.equal(secondResolve.body.data.campaign.promoCode.code, 'AUTUMN15');

  for (const eventType of ['impression', 'copy', 'promo_cta']) {
    await request(app).post('/api/public/popup-banners/events').send({
      publicId,
      eventType,
      pageUrl: 'https://shop.example.com/sale/',
      visitorKey: 'promo-visitor',
      metadata: { source: 'promo-test' }
    }).expect(204);
  }
  const analytics = await admin.get('/api/popup-banners/analytics/overview').query({ days: 30 }).expect(200);
  assert.ok(analytics.body.data.totals.impressions >= 1);
  assert.equal(analytics.body.data.totals.copies, 1);
  assert.equal(analytics.body.data.totals.promoCtaClicks, 1);
  assert.ok(analytics.body.data.totals.copyRate > 0);
  const promoCampaignAnalytics = analytics.body.data.campaigns.find((item) => item.id === campaignId);
  assert.equal(promoCampaignAnalytics.copy, 1);
  assert.equal(promoCampaignAnalytics.promo_cta, 1);
  const library = await admin.get('/api/promo-codes').expect(200);
  assert.equal(library.body.data[0].campaigns[0].id, campaignId);
  await admin.delete(`/api/promo-codes/${promoCodeId}`).expect(409);
});

test('promo code widget is responsive on desktop and mobile and never auto-applies the code', async () => {
  const payload = {
    campaign: {
      publicId: 'public-promo-code', revision: 'promo-code-revision', type: 'promo_code', mode: 'all_pages',
      content: { eyebrow: 'Промокод', title: 'Знижка для вас', body: 'Скопіюйте код.', primaryLabel: 'До акції', primaryUrl: '/sale/' },
      styles: {
        layout: 'modal', accentColor: '#6d5dfc', backgroundColor: '#ffffff', textColor: '#172033', mutedColor: '#667085',
        primaryButtonBackgroundColor: '#ffe101', primaryButtonTextColor: '#111827', secondaryButtonBackgroundColor: '#fff',
        secondaryButtonTextColor: '#172033', checkboxAccentColor: '#6d5dfc', checkboxCheckColor: '#fff', checkboxTextColor: '#172033',
        timelineColor: '#6d5dfc', timelineTrackColor: '#ede9fe', eyebrowFontSize: 12, titleFontSize: 34, bodyFontSize: 16,
        acknowledgementFontSize: 14, buttonFontSize: 16, buttonBorderRadius: 12, borderRadius: 24, maxWidth: 560
      },
      behavior: { trigger: 'delay', delayMs: 0, frequency: 'always', cooldownHours: 24, cooldownDays: 7, maxShowsPerSession: 0, device: 'all', autoCloseSeconds: 0, dismissible: true, requireAcknowledgement: false, buttonCount: 1 },
      promoCode: { code: 'AUTUMN15', type: 'percent_coupon', discountValue: 15, currency: '', scopeNote: 'Лише аксесуари' }
    },
    product: null, recommendations: [], products: []
  };
  for (const surface of [{ width: 1440, userAgent: 'Mozilla/5.0 Chrome/140' }, { width: 390, userAgent: 'Mozilla/5.0 (Linux; Android 16) Chrome/140 Mobile Safari/537.36' }]) {
    const dom = new JSDOM('<!doctype html><html><body><input name="coupon"><button class="apply-coupon">Apply</button></body></html>', {
      pretendToBeVisual: true, runScripts: 'outside-only', url: 'https://shop.example.com/sale/'
    });
    Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: surface.width });
    Object.defineProperty(dom.window.navigator, 'userAgent', { configurable: true, value: surface.userAgent });
    Object.defineProperty(dom.window.navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } });
    dom.window.MutationObserver = class MutationObserver { observe() {} disconnect() {} };
    const events = [];
    let applyClicks = 0;
    dom.window.document.querySelector('.apply-coupon').addEventListener('click', () => { applyClicks += 1; });
    dom.window.fetch = async (input, options = {}) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/resolve')) return { ok: true, json: async () => ({ data: payload }) };
      if (url.pathname.endsWith('/events')) { events.push(JSON.parse(options.body)); return { ok: true }; }
      throw new Error(`Unexpected fetch: ${url.href}`);
    };
    dom.window.eval(popupEmbedScript('https://mt-panel.example.com'));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 35));
    const host = dom.window.document.querySelector('#mt-popup-banner-root');
    const shadow = host.shadowRoot;
    assert.equal(shadow.querySelector('.promo-code').textContent, 'AUTUMN15');
    assert.equal(shadow.querySelector('.promo-code-value').textContent, 'Знижка 15%');
    assert.equal(shadow.querySelector('.promo-code-cta').href, 'https://shop.example.com/sale/');
    assert.equal(dom.window.document.querySelector('[name="coupon"]').value, '');
    assert.equal(applyClicks, 0);
    shadow.querySelector('.promo-code-copy').click();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 20));
    assert.ok(events.some((event) => event.eventType === 'copy'));
    shadow.querySelector('.promo-code-cta').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    assert.ok(events.some((event) => event.eventType === 'promo_cta'));
    const runtimeCss = shadow.querySelector('style').textContent;
    assert.match(runtimeCss, /@media\(max-width:600px\)\{\.promo-code-offer/u);
    dom.window.close();
  }
});

test('lead-form campaign stores a deduplicated contact and exports campaign lists as XLSX', async () => {
  await pool.query("UPDATE popup_banner_campaigns SET status = 'paused'");
  const createdCode = await admin.post('/api/promo-codes').send({
    internalName: 'Промокод за контакт',
    code: 'CONTACT15',
    type: 'percent_coupon',
    discountValue: 15,
    currency: '',
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    scopeNote: 'Для першого замовлення',
    enabled: true,
    horoshopConfirmed: true
  }).expect(201);
  const formConfig = {
    fields: [
      { id: 'email', type: 'email', label: '', placeholder: 'name@example.com', required: true, options: [] },
      { id: 'phone', type: 'phone', label: 'Телефон', placeholder: '+380', required: true, options: [] },
      { id: 'interest', type: 'select', label: 'Цікавить', placeholder: 'Оберіть категорію', required: false, options: ['Смартфони', 'Аксесуари'] },
      { id: 'consent', type: 'checkbox', label: 'Погоджуюся на обробку даних', placeholder: '', required: true, options: [] }
    ],
    blocks: [
      { id: 'contacts', layout: 'row', fieldIds: ['email', 'phone'] },
      { id: 'details', layout: 'column', fieldIds: ['interest', 'consent'] }
    ],
    submitLabel: 'Отримати промокод',
    successTitle: 'Готово',
    successBody: 'Ваш персональний код нижче.'
  };
  const leadCampaignInput = input({
    campaignType: 'lead_form',
    name: 'Контакти за промокод',
    promoCodeId: createdCode.body.data.id,
    formConfig,
    content: {
      ...input().content,
      eyebrow: 'Подарунок',
      title: 'Отримайте знижку',
      body: 'Залиште контакти — код з’явиться після відправлення.',
      primaryLabel: '',
      secondaryLabel: '',
      acknowledgementLabel: ''
    },
    targeting: { ...input().targeting, mode: 'all_pages' },
    behavior: { ...input().behavior, frequency: 'session', requireAcknowledgement: false, buttonCount: 1 },
    productEntries: []
  });
  const created = await admin.post('/api/popup-banners').send(leadCampaignInput).expect(201);
  assert.equal(created.body.data.formConfig.fields.length, 4);
  assert.equal(created.body.data.formConfig.fields[0].label, '');
  assert.equal(created.body.data.formConfig.blocks[0].layout, 'row');
  assert.equal(created.body.data.publishedFormConfig, null);
  await admin.patch(`/api/popup-banners/${created.body.data.id}/status`).send({ status: 'active' }).expect(200);
  const originalPoolQuery = pool.query;
  const updateRequest = admin.put(`/api/popup-banners/${created.body.data.id}`).send({
    ...leadCampaignInput,
    name: 'Форма за промокод',
    priority: 100,
    content: {
      eyebrow: 'Подарунок за контакт',
      title: 'Отримайте промокод',
      body: 'Залиште контактні дані — промокод з’явиться одразу після відправлення форми.',
      primaryLabel: '',
      primaryUrl: '',
      secondaryLabel: '',
      imageUrl: '',
      acknowledgementLabel: ''
    },
    styles: {
      layout: 'modal',
      promoFormat: 'notification',
      desktopPosition: 'bottom_right',
      mobilePosition: 'bottom',
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
      timelineColor: '#6d5dfc',
      timelineTrackColor: '#ede9fe',
      showPromoTitle: false,
      eyebrowFontSize: 12,
      titleFontSize: 34,
      bodyFontSize: 16,
      acknowledgementFontSize: 14,
      buttonFontSize: 16,
      buttonBorderRadius: 12,
      borderRadius: 24,
      maxWidth: 600
    },
    targeting: {
      mode: 'all_pages', match: 'all', stickers: [], brands: [], categoryIds: [], conditions: [],
      targetPageUrl: '', urlContains: [], recommendationLimit: 6
    },
    behavior: {
      trigger: 'scroll', delayMs: 300, scrollPercent: 35, inactivitySeconds: 8,
      frequency: 'session', cooldownHours: 24, cooldownDays: 7, maxShowsPerSession: 1,
      device: 'all', autoCloseSeconds: 0, rotationSeconds: 6,
      activeWeekdays: [1, 2, 3, 4, 5, 6, 7], dailyStartTime: '', dailyEndTime: '',
      scheduleTimezone: 'Europe/Kyiv', dismissible: true, requireAcknowledgement: false, buttonCount: 1
    },
    formConfig: {
      fields: [
        { id: 'name', type: 'text', label: "Ім'я", placeholder: 'Ваше імʼя', required: true, options: [] },
        { id: 'field_mtrt6oee_nz07cg_2', type: 'text', label: 'Нове поле', placeholder: '', required: false, options: [] },
        { id: 'field_mtrt6qvs_3tkigo_3', type: 'text', label: 'Нове поле', placeholder: '', required: false, options: [] }
      ],
      blocks: [
        { id: 'legacy_1', layout: 'column', fieldIds: ['name'] },
        { id: 'block_mtrt6oee_lv2dxa_2', layout: 'row', fieldIds: ['field_mtrt6oee_nz07cg_2', 'field_mtrt6qvs_3tkigo_3'] }
      ],
      submitLabel: 'Отримати промокод',
      successTitle: 'Ваш промокод готовий',
      successBody: 'Скопіюйте код і використайте його під час оформлення замовлення.'
    },
    productEntries: [],
    promoItems: []
  });
  let updated;
  let campaignTransactionCommitted = false;
  try {
    pool.query = function guardedPoolQuery(sql, params, callback) {
      const statement = String(sql);
      if (campaignTransactionCommitted && statement.includes('FROM popup_banner_campaigns AS campaign') && statement.includes('WHERE campaign.id = $1')) {
        throw new Error('Campaign save must not reacquire a pool connection to build its response.');
      }
      const result = originalPoolQuery.call(this, sql, params, callback);
      if (statement === 'COMMIT') campaignTransactionCommitted = true;
      return result;
    };
    updated = await updateRequest.expect(200);
  } finally {
    pool.query = originalPoolQuery;
  }
  assert.equal(updated.body.data.formConfig.fields.length, 3);
  assert.equal(updated.body.data.formConfig.blocks[1].fieldIds[1], 'field_mtrt6qvs_3tkigo_3');

  const resolved = await request(app)
    .get('/api/public/popup-banners/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: 'https://shop.example.com/sale/' })
    .expect(200);
  assert.equal(resolved.body.data.campaign.type, 'lead_form');
  assert.equal(resolved.body.data.campaign.formConfig.fields[0].id, 'email');
  assert.equal(resolved.body.data.campaign.promoCode, null, 'the code must not leak in the resolve payload');

  const publicPath = `/api/public/popup-banners/${created.body.data.publicId}/contacts`;
  const invalid = await request(app).post(publicPath).set('Origin', 'https://shop.example.com').send({
    values: { email: 'wrong', phone: '12', consent: false },
    pageUrl: 'https://shop.example.com/sale/',
    visitorKey: 'lead-visitor'
  }).expect(422);
  assert.equal(invalid.body.error.code, 'POPUP_CONTACT_INVALID');
  await request(app).post(publicPath).set('Origin', 'https://foreign.example.com').send({
    values: { email: 'buyer@example.com', phone: '+380501112233', interest: 'Смартфони', consent: true },
    pageUrl: 'https://shop.example.com/sale/',
    visitorKey: 'lead-visitor'
  }).expect(403);
  const submission = {
    values: { email: 'BUYER@EXAMPLE.COM', phone: '+380 50 111 22 33', interest: 'Смартфони', consent: true },
    pageUrl: 'https://shop.example.com/sale/',
    visitorKey: 'lead-visitor'
  };
  const accepted = await request(app).post(publicPath).set('Origin', 'https://shop.example.com').send(submission).expect(201);
  assert.equal(accepted.body.data.promoCode.code, 'CONTACT15');
  assert.equal(accepted.body.data.duplicate, false);
  const duplicate = await request(app).post(publicPath).set('Origin', 'https://shop.example.com').send(submission).expect(200);
  assert.equal(duplicate.body.data.duplicate, true);

  await request(app).get(`/api/popup-banners/${created.body.data.id}/contacts`).expect(401);
  const contacts = await admin.get(`/api/popup-banners/${created.body.data.id}/contacts`).expect(200);
  assert.equal(contacts.body.data.total, 1);
  assert.equal(contacts.body.data.items[0].values.email, 'buyer@example.com');
  assert.equal(contacts.body.data.items[0].values.consent, true);
  const campaigns = await admin.get('/api/popup-banners').expect(200);
  assert.equal(campaigns.body.data.find((campaign) => campaign.id === created.body.data.id).stats.contacts, 1);

  const campaignExport = await admin.get(`/api/popup-banners/${created.body.data.id}/contacts/export`).buffer(true).parse(binaryParser).expect(200);
  assert.match(campaignExport.headers['content-type'], /spreadsheetml/u);
  assert.equal(Buffer.from(campaignExport.body).subarray(0, 2).toString(), 'PK');
  const allExport = await admin.get('/api/popup-banners/contacts/export').buffer(true).parse(binaryParser).expect(200);
  assert.equal(Buffer.from(allExport.body).subarray(0, 2).toString(), 'PK');
});

test('lead-form campaign can add a field after publication without losing contacts or changing the published form', async () => {
  await pool.query("UPDATE popup_banner_campaigns SET status = 'paused'");
  const code = await admin.post('/api/promo-codes').send({
    internalName: 'Промокод для розширюваної форми',
    code: 'EXPAND15',
    type: 'percent_coupon',
    discountValue: 15,
    enabled: true,
    horoshopConfirmed: true
  }).expect(201);
  const emailField = { id: 'email', type: 'email', label: 'Пошта', placeholder: '', required: true, options: [] };
  const phoneField = { id: 'phone', type: 'phone', label: 'Телефон', placeholder: '', required: true, options: [] };
  const campaignInput = input({
    campaignType: 'lead_form',
    name: 'Промокод за пошту',
    promoCodeId: code.body.data.id,
    targeting: { ...input().targeting, mode: 'all_pages' },
    productEntries: [],
    formConfig: {
      fields: [emailField],
      blocks: [{ id: 'contacts', layout: 'column', fieldIds: ['email'] }],
      submitLabel: 'Отримати промокод',
      successTitle: 'Готово',
      successBody: 'Скопіюйте код.'
    }
  });
  const created = await admin.post('/api/popup-banners').send(campaignInput).expect(201);
  const campaignPath = `/api/popup-banners/${created.body.data.id}`;
  const publicPath = `/api/public/popup-banners/${created.body.data.publicId}/contacts`;
  const published = await admin.patch(`${campaignPath}/status`).send({ status: 'active' }).expect(200);
  const submission = {
    values: { email: 'first@example.com' },
    pageUrl: 'https://shop.example.com/sale/',
    visitorKey: 'existing-lead-contact'
  };
  await request(app).post(publicPath).set('Origin', 'https://shop.example.com').send(submission).expect(201);

  const expandedForm = {
    ...campaignInput.formConfig,
    fields: [emailField, phoneField],
    blocks: [{ id: 'contacts', layout: 'row', fieldIds: ['email', 'phone'] }]
  };
  const updated = await admin.put(campaignPath).send({ ...campaignInput, formConfig: expandedForm }).expect(200);
  assert.deepEqual(updated.body.data.formConfig, expandedForm);
  assert.deepEqual(updated.body.data.publishedFormConfig, published.body.data.publishedFormConfig);
  assert.deepEqual(updated.body.data.publishedPromoCode, published.body.data.publishedPromoCode);
  const reloaded = await admin.get(campaignPath).expect(200);
  assert.deepEqual(reloaded.body.data.formConfig, expandedForm);

  const resolve = () => request(app).get('/api/public/popup-banners/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: submission.pageUrl });
  const beforeRepublish = await resolve().expect(200);
  assert.deepEqual(beforeRepublish.body.data.campaign.formConfig.fields, [emailField]);
  assert.equal(beforeRepublish.body.data.campaign.promoCode, null);
  await request(app).post(publicPath).set('Origin', 'https://shop.example.com').send(submission).expect(200);

  await admin.patch(`${campaignPath}/status`).send({ status: 'active' }).expect(200);
  const afterRepublish = await resolve().expect(200);
  assert.deepEqual(afterRepublish.body.data.campaign.formConfig, expandedForm);
  await request(app).post(publicPath).set('Origin', 'https://shop.example.com').send({
    ...submission, values: { email: 'second@example.com' }
  }).expect(422);
  const accepted = await request(app).post(publicPath).set('Origin', 'https://shop.example.com').send({
    ...submission, values: { email: 'second@example.com', phone: '+380501234567' }
  }).expect(201);
  assert.equal(accepted.body.data.promoCode.code, 'EXPAND15');
  const contacts = await admin.get(`${campaignPath}/contacts`).expect(200);
  assert.equal(contacts.body.data.total, 2);
  assert.deepEqual(contacts.body.data.items.find((contact) => contact.values.email === 'first@example.com').values, submission.values);
});

test('lead-form widget renders and reveals its promo code after submission on desktop and mobile', async () => {
  const payload = {
    campaign: {
      publicId: 'a38e14ad-b9e8-4c09-a5ea-8077ad33ee45', revision: 'lead-form-revision', type: 'lead_form', mode: 'all_pages',
      content: { eyebrow: 'Подарунок', title: 'Отримайте знижку', body: 'Залиште контакти.', primaryLabel: '', primaryUrl: '', secondaryLabel: '', imageUrl: '', acknowledgementLabel: '' },
      styles: input().styles,
      behavior: { ...input().behavior, frequency: 'always', requireAcknowledgement: false, buttonCount: 1 },
      formConfig: {
        fields: [
          { id: 'email', type: 'email', label: '', placeholder: 'name@example.com', required: true, options: [] },
          { id: 'phone', type: 'phone', label: 'Телефон', placeholder: '+380', required: true, options: [] }
        ],
        blocks: [{ id: 'contacts', layout: 'row', fieldIds: ['email', 'phone'] }],
        submitLabel: 'Отримати код', successTitle: 'Готово', successBody: 'Скопіюйте промокод.'
      },
      promoCode: null
    },
    product: null, recommendations: [], products: []
  };
  for (const surface of [{ width: 1440, userAgent: 'Mozilla/5.0 Chrome/140' }, { width: 390, userAgent: 'Mozilla/5.0 (Linux; Android 16) Chrome/140 Mobile Safari/537.36' }]) {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      pretendToBeVisual: true, runScripts: 'outside-only', url: 'https://shop.example.com/sale/'
    });
    Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: surface.width });
    Object.defineProperty(dom.window.navigator, 'userAgent', { configurable: true, value: surface.userAgent });
    dom.window.MutationObserver = class MutationObserver { observe() {} disconnect() {} };
    const submitted = [];
    dom.window.fetch = async (input, options = {}) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/resolve')) return { ok: true, json: async () => ({ data: payload }) };
      if (url.pathname.endsWith('/events')) return { ok: true };
      if (url.pathname.endsWith('/contacts')) {
        submitted.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ data: { promoCode: { code: 'CONTACT15', type: 'percent_coupon', discountValue: 15, currency: '', scopeNote: '' } } }) };
      }
      throw new Error(`Unexpected fetch: ${url.href}`);
    };
    dom.window.eval(popupEmbedScript('https://mt-panel.example.com'));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 35));
    const shadow = dom.window.document.querySelector('#mt-popup-banner-root').shadowRoot;
    assert.equal(shadow.querySelector('.promo-code'), null);
    assert.equal(shadow.querySelector('.lead-form-block.is-row').children.length, 2);
    assert.equal(shadow.querySelector('[name="email"]').getAttribute('aria-label'), 'name@example.com');
    assert.equal(shadow.querySelector('.lead-field-email > span'), null);
    shadow.querySelector('[name="email"]').value = 'buyer@example.com';
    shadow.querySelector('[name="phone"]').value = '+380501112233';
    shadow.querySelector('.lead-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 25));
    assert.equal(submitted.length, 1);
    assert.equal(shadow.querySelector('.promo-code').textContent, 'CONTACT15');
    assert.equal(shadow.querySelector('.lead-form-success h3').textContent, 'Готово');
    assert.match(shadow.querySelector('style').textContent, /@media\(max-width:600px\)\{\.lead-form/u);
    dom.window.close();
  }
});

test('countdown campaigns persist both modes through creation, publication, editing, and public resolution', async () => {
  const campaigns = await admin.get('/api/popup-banners').expect(200);
  for (const campaign of campaigns.body.data) {
    if (campaign.status === 'active') await admin.patch(`/api/popup-banners/${campaign.id}/status`).send({ status: 'paused' }).expect(200);
  }
  const timerConfig = { mode: 'deadline', deadlineAt: '2099-01-01T15:00:00+03:00', durationMinutes: 15 };
  const payload = input({
    campaignType: 'countdown', name: 'Таймер акції', timerConfig, productEntries: [],
    targeting: { ...input().targeting, mode: 'all_pages' },
    behavior: { ...input().behavior, frequency: 'always', requireAcknowledgement: false }
  });
  const created = await admin.post('/api/popup-banners').send(payload).expect(201);
  const path = `/api/popup-banners/${created.body.data.id}`;
  const normalized = { ...timerConfig, deadlineAt: '2099-01-01T12:00:00.000Z' };
  assert.deepEqual(created.body.data.timerConfig, normalized);
  const preview = await admin.post('/api/popup-banners/preview').send(payload).expect(200);
  assert.equal(preview.body.data.campaign.type, 'countdown');
  assert.deepEqual(preview.body.data.campaign.timerConfig, normalized);
  await admin.patch(`${path}/status`).send({ status: 'active' }).expect(200);
  const resolve = () => request(app).get('/api/public/popup-banners/resolve').query({ pageUrl: 'https://shop.example.com/sale/' }).expect(200);
  let publicCampaign = (await resolve()).body.data;
  assert.deepEqual(publicCampaign.campaign.timerConfig, normalized);
  assert.ok(Math.abs(Date.parse(publicCampaign.serverNow) - Date.now()) < 10000);

  payload.timerConfig = { mode: 'duration', deadlineAt: null, durationMinutes: 30 };
  const updated = await admin.put(path).send(payload).expect(200);
  assert.equal(updated.body.data.status, 'active');
  assert.deepEqual(updated.body.data.timerConfig, payload.timerConfig);
  assert.deepEqual((await admin.get(path).expect(200)).body.data.timerConfig, payload.timerConfig);
  assert.deepEqual((await admin.get('/api/popup-banners').expect(200)).body.data.find((campaign) => campaign.id === created.body.data.id).timerConfig, payload.timerConfig);
  publicCampaign = (await resolve()).body.data;
  assert.equal(publicCampaign.campaign.type, 'countdown');
  assert.deepEqual(publicCampaign.campaign.timerConfig, payload.timerConfig);
  const changedPreview = await admin.post('/api/popup-banners/preview').send(payload).expect(200);
  assert.notEqual(changedPreview.body.data.campaign.revision, preview.body.data.campaign.revision);

  payload.timerConfig = { mode: 'deadline', deadlineAt: '2020-01-01T00:00:00Z', durationMinutes: 30 };
  await admin.put(path).send(payload).expect(200);
  assert.equal((await resolve()).body.data, null);
  const expired = await admin.patch(`${path}/status`).send({ status: 'active' }).expect(422);
  assert.equal(expired.body.error.code, 'POPUP_TIMER_EXPIRED');
  await admin.delete(path).expect(204);
});

test('countdown validation rejects invalid durations, missing deadlines and unsupported targeting', async () => {
  const payload = input({ campaignType: 'countdown' });
  for (const durationMinutes of [0, -1, 1.5, 43201]) {
    await admin.post('/api/popup-banners').send({ ...payload, timerConfig: { mode: 'duration', deadlineAt: null, durationMinutes } }).expect(422);
  }
  for (const deadlineAt of [null, 'not-a-date', '2026-09-08T15:00:00']) {
    await admin.post('/api/popup-banners').send({ ...payload, timerConfig: { mode: 'deadline', deadlineAt, durationMinutes: 15 } }).expect(422);
  }
  await admin.post('/api/popup-banners').send({ ...payload, targeting: { ...payload.targeting, mode: 'out_of_stock' } }).expect(422);
});

test('popup live preview never steals focus from the workspace editor', async () => {
  const dom = new JSDOM('<!doctype html><html><body><input id="workspace-field"></body></html>', {
    pretendToBeVisual: true, runScripts: 'outside-only', url: 'https://mt-panel.example.com/tools/popup-banners'
  });
  const workspaceField = dom.window.document.querySelector('#workspace-field');
  workspaceField.focus();
  dom.window.__MT_POPUP_PREVIEW__ = {
    campaign: {
      publicId: 'preview', revision: 'focus-regression', type: 'lead_form', mode: 'all_pages',
      content: { eyebrow: '', title: 'Форма', body: '', primaryLabel: '', primaryUrl: '', secondaryLabel: '', imageUrl: '', acknowledgementLabel: '' },
      styles: input().styles,
      behavior: { ...input().behavior, frequency: 'always', requireAcknowledgement: false, buttonCount: 1 },
      formConfig: {
        fields: [{ id: 'email', type: 'email', label: '', placeholder: 'name@example.com', required: true, options: [] }],
        blocks: [{ id: 'contact', layout: 'column', fieldIds: ['email'] }],
        submitLabel: 'Отримати код', successTitle: '', successBody: ''
      },
      promoCode: { code: 'CONTACT15', type: 'percent_coupon', discountValue: 15, currency: '', scopeNote: '' }
    },
    product: null, recommendations: [], products: []
  };
  dom.window.eval(popupEmbedScript('https://mt-panel.example.com'));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 35));
  assert.equal(dom.window.document.activeElement, workspaceField);
  dom.window.close();
});
