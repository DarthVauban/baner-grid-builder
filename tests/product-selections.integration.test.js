import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.PRODUCT_SELECTION_TEST_DATABASE_URL || 'pg-mem://product-selection-tests';
process.env.JWT_SECRET = 'product-selection-test-secret-0123456789';
process.env.COOKIE_SECURE = 'false';
process.env.APP_ORIGIN = 'https://mt-panel.example.com';
process.env.ADMIN_NAME = 'Product Selection Admin';
process.env.ADMIN_EMAIL = 'product-selection-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');

const admin = request.agent(app);
const connectionId = randomUUID();
const generation = randomUUID();
const productId = randomUUID();
const syncId = randomUUID();

function selectionInput(overrides = {}) {
  return {
    name: 'Перерва на знижки',
    heading: 'Ми рекомендуємо',
    priceMode: 'percent',
    priceValue: 10,
    highlightPromoPrice: true,
    buttonLabel: 'Купити',
    desktopColumns: 4,
    mobileColumns: 2,
    items: [{ productExternalId: 'tecno-spark-50', modificationExternalId: null }],
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
    INSERT INTO search_horoshop_products (
      id, connection_id, generation, external_id, sku, titles, brand,
      category_external_id, price, currency, availability, visible,
      primary_image_url, canonical_url, source_data, active, last_seen_sync_id
    ) VALUES (
      $1, $2, $3, 'tecno-spark-50', 'TECNO-50', $4::JSONB, 'Tecno',
      'smartphones', '8999', 'UAH', 'В наявності', TRUE,
      'https://cdn.example.com/tecno.webp', 'https://shop.example.com/tecno-spark-50/',
      $5::JSONB, TRUE, $6
    )
  `, [productId, connectionId, generation,
    JSON.stringify({ uk: 'Смартфон TECNO Spark 50 4/128GB' }),
    JSON.stringify({ id: 9001 }), syncId]);
});
after(async () => {
  await pool.end();
});

test('product selections are saved from the Horoshop catalog and expose tokenized async embeds', async () => {
  await request(app).get('/api/product-selections').expect(401);

  const catalog = await admin.get('/api/product-selections/catalog').query({ search: 'TECNO' }).expect(200);
  assert.equal(catalog.body.data.items.length, 1);
  assert.equal(catalog.body.data.items[0].externalId, 'tecno-spark-50');

  const created = await admin.post('/api/product-selections').send(selectionInput()).expect(201);
  assert.equal(created.body.data.name, 'Перерва на знижки');
  assert.equal(created.body.data.items.length, 1);
  assert.equal(created.body.data.items[0].title, 'Смартфон TECNO Spark 50 4/128GB');
  assert.equal(created.body.data.items[0].available, true);

  const selectionId = created.body.data.id;
  const publicId = created.body.data.publicId;
  const firstEmbed = await request(app)
    .get(`/api/public/product-selections/${publicId}/embed.js`)
    .expect(200);
  assert.match(firstEmbed.headers['content-type'], /javascript/u);
  assert.match(firstEmbed.text, /mt-product-selection/u);
  assert.match(firstEmbed.text, /Смартфон TECNO Spark 50/u);
  assert.match(firstEmbed.text, /mt_promo=/u);
  assert.doesNotMatch(firstEmbed.text, /mt_old_percent|mt_old_fixed/u);
  const firstToken = firstEmbed.text.match(/mt_promo=([0-9a-f-]{36})/iu)?.[1];
  assert.ok(firstToken);

  const promo = await request(app)
    .get(`/api/public/product-selections/promo/${firstToken}`)
    .query({ page: `https://shop.example.com/tecno-spark-50/?mt_promo=${firstToken}` })
    .expect(200);
  assert.deepEqual(promo.body.data, { mode: 'percent', value: 10, highlightPromoPrice: true });

  await request(app)
    .get(`/api/public/product-selections/promo/${firstToken}`)
    .query({ page: 'https://shop.example.com/another-product/' })
    .expect(404);

  await admin.put(`/api/product-selections/${selectionId}`)
    .send(selectionInput({ priceMode: 'fixed', priceValue: 500 }))
    .expect(200);
  const secondEmbed = await request(app)
    .get(`/api/public/product-selections/${publicId}/embed.js`)
    .expect(200);
  assert.match(secondEmbed.text, new RegExp(firstToken, 'u'));

  const loader = await request(app)
    .get('/api/public/product-selections/promo-loader.js')
    .expect(200);
  assert.match(loader.text, /\.product-price__box/u);
  assert.match(loader.text, /\.product-card__price-box/u);
  assert.match(loader.text, /observer\.observe\(box/u);
  assert.doesNotMatch(loader.text, /observer\.observe\(document\.body/u);

  await admin.delete(`/api/product-selections/${selectionId}`).expect(204);
  await request(app).get(`/api/public/product-selections/${publicId}/embed.js`).expect(404);
});

test('product selection validation rejects duplicate and stale catalog references', async () => {
  await admin.post('/api/product-selections').send(selectionInput({
    items: [
      { productExternalId: 'tecno-spark-50', modificationExternalId: null },
      { productExternalId: 'tecno-spark-50', modificationExternalId: null }
    ]
  })).expect(422);

  await admin.post('/api/product-selections').send(selectionInput({
    items: [{ productExternalId: 'missing-product', modificationExternalId: null }]
  })).expect(422);
});
