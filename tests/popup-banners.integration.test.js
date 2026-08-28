import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

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

const admin = request.agent(app);
const connectionId = randomUUID();
const generation = randomUUID();
const productId = randomUUID();
const modificationId = randomUUID();
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

  const code = await admin.get('/api/popup-banners/embed-code').expect(200);
  assert.match(code.body.data.code, /popup-banners\/embed\.js/u);
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
