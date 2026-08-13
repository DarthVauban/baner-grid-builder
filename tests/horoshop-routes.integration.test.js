import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://horoshop-routes-tests';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.COOKIE_SECURE = 'false';
process.env.ADMIN_NAME = 'Horoshop Admin';
process.env.ADMIN_EMAIL = 'horoshop-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');

const admin = request.agent(app);

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  await admin.post('/api/auth/login').send({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD
  }).expect(200);
});

after(async () => {
  await pool.end();
});

test('Horoshop integration state is admin-only, non-cacheable and never contains credentials', async () => {
  await request(app).get('/api/admin/integrations/horoshop').expect(401);
  const response = await admin.get('/api/admin/integrations/horoshop').expect(200);
  assert.match(response.headers['cache-control'], /no-store/u);
  assert.deepEqual(response.body.data, {
    configured: false,
    status: 'disconnected',
    storeDomain: '',
    pollingIntervalMinutes: null,
    lastSyncAt: null,
    lastError: null,
    counts: { categories: 0, products: 0, modifications: 0 },
    latestRun: null
  });
  assert.equal(JSON.stringify(response.body).includes('password'), false);
  assert.equal(JSON.stringify(response.body).includes('token'), false);
  assert.equal(JSON.stringify(response.body).includes('encryptedCredentials'), false);
});

test('Horoshop catalog route returns product cards with nested modification trees', async () => {
  await request(app).get('/api/search/horoshop/catalog').expect(401);
  const connectionId = randomUUID();
  const generation = randomUUID();
  const syncId = randomUUID();
  const productId = randomUUID();
  await pool.query(`
    INSERT INTO search_horoshop_connections (
      id, generation, store_domain, encrypted_credentials, status, last_sync_at
    ) VALUES ($1, $2, 'test-shop.example', 'ciphertext', 'connected', NOW())
  `, [connectionId, generation]);
  await pool.query(`
    INSERT INTO search_horoshop_categories (
      id, connection_id, generation, external_id, titles, active, last_seen_sync_id
    ) VALUES ($1, $2, $3, 'earphones', $4::jsonb, TRUE, $5)
  `, [randomUUID(), connectionId, generation, JSON.stringify({ uk: 'Навушники' }), syncId]);
  await pool.query(`
    INSERT INTO search_horoshop_products (
      id, connection_id, generation, external_id, sku, titles, brand,
      category_external_id, price, currency, availability, visible,
      primary_image_url, canonical_url, active, last_seen_sync_id
    ) VALUES (
      $1, $2, $3, 'redmi-buds-6', '34208', $4::jsonb, 'Xiaomi',
      'earphones', '1099', 'UAH', 'В наявності', TRUE,
      'https://cdn.example/black.jpg', 'https://test-shop.example/redmi-buds-6', TRUE, $5
    )
  `, [productId, connectionId, generation, JSON.stringify({ uk: 'Xiaomi Redmi Buds 6 Active' }), syncId]);
  await pool.query(`
    INSERT INTO search_horoshop_modifications (
      id, connection_id, product_id, generation, external_id, sku, titles,
      price, currency, availability, visible, image_url, active, last_seen_sync_id
    ) VALUES
      ($1, $2, $3, $4, 'redmi-buds-6:black', '34208-B', $5::jsonb, '1299', 'UAH', 'В наявності', TRUE, 'https://cdn.example/black.jpg', TRUE, $7),
      ($6, $2, $3, $4, 'redmi-buds-6:pink', '34209-P', $8::jsonb, '1099', 'UAH', 'Немає в наявності', FALSE, 'https://cdn.example/pink.jpg', TRUE, $7)
  `, [
    randomUUID(), connectionId, productId, generation,
    JSON.stringify({ uk: 'Xiaomi Redmi Buds 6 Active Black' }), randomUUID(), syncId,
    JSON.stringify({ uk: 'Xiaomi Redmi Buds 6 Active Pink' })
  ]);

  await admin
    .patch('/api/admin/integrations/horoshop/settings')
    .send({ pollingIntervalMinutes: 0 })
    .expect(422);
  const updatedSettings = await admin
    .patch('/api/admin/integrations/horoshop/settings')
    .send({ pollingIntervalMinutes: 45 })
    .expect(200);
  assert.equal(updatedSettings.body.data.pollingIntervalMinutes, 45);
  assert.equal(JSON.stringify(updatedSettings.body).includes('encryptedCredentials'), false);

  const response = await admin.get('/api/search/horoshop/catalog?page=1&pageSize=10').expect(200);
  assert.match(response.headers['cache-control'], /no-store/u);
  assert.equal(response.body.data.integration.storeDomain, 'test-shop.example');
  assert.equal(response.body.data.total, 1);
  assert.equal(response.body.data.items[0].modifications.length, 2);
  assert.equal(
    response.body.data.items[0].modifications.find((item) => item.sku === '34209-P')?.titles.uk,
    'Xiaomi Redmi Buds 6 Active Pink'
  );
  assert.deepEqual(response.body.data.availabilityOptions, ['В наявності', 'Немає в наявності']);
  assert.equal(response.body.data.categories[0].productCount, 1);
  assert.equal(JSON.stringify(response.body).includes('sourceData'), false);
  assert.equal(JSON.stringify(response.body).includes('ciphertext'), false);

  const matchedByModification = await admin
    .get('/api/search/horoshop/catalog?search=34209-P&pageSize=10')
    .expect(200);
  assert.equal(matchedByModification.body.data.total, 1);
  assert.equal(matchedByModification.body.data.items[0].sku, '34208');

  const hidden = await admin
    .get('/api/search/horoshop/catalog?visibility=hidden&pageSize=10')
    .expect(200);
  assert.equal(hidden.body.data.total, 1);

  await request(app).get(`/api/search/horoshop/accessories/products/${productId}`).expect(401);
  const accessoryDetail = await admin
    .get(`/api/search/horoshop/accessories/products/${productId}`)
    .expect(200);
  assert.match(accessoryDetail.headers['cache-control'], /no-store/u);
  assert.equal(accessoryDetail.body.data.product.id, productId);
  assert.equal(accessoryDetail.body.data.draft.catalogStateKnown, false);
  assert.equal(JSON.stringify(accessoryDetail.body).includes('sourceData'), false);
  assert.equal(JSON.stringify(accessoryDetail.body).includes('ciphertext'), false);

  await request(app).get('/api/search/horoshop/accessories/review/catalog').expect(401);
  const reviewCatalog = await admin
    .get('/api/search/horoshop/accessories/review/catalog')
    .expect(200);
  assert.equal(reviewCatalog.body.data.format, 'horoshop-codex-accessory-review/v1');
  assert.equal(reviewCatalog.body.data.connectionGeneration, generation);
  assert.equal(reviewCatalog.body.data.products.length, 1);
  assert.equal(reviewCatalog.body.data.products[0].modifications.length, 2);
  assert.equal(JSON.stringify(reviewCatalog.body).includes('ciphertext'), false);

  await request(app).post('/api/search/horoshop/accessories/review/proposals').send({}).expect(401);
  const importedReview = await admin
    .post('/api/search/horoshop/accessories/review/proposals')
    .send({
      format: 'horoshop-codex-accessory-review/v1',
      connectionGeneration: generation,
      catalogRevision: reviewCatalog.body.data.catalogRevision,
      products: [{ productId, recommendations: [] }]
    })
    .expect(200);
  assert.deepEqual(importedReview.body.data, {
    reviewedProducts: 1,
    productsWithRecommendations: 0,
    productsWithoutRecommendations: 1,
    recommendationsSaved: 0
  });

  await admin.post('/api/search/horoshop/accessories/recommendations/bulk').send({ limit: 12 }).expect(404);

  await admin
    .post(`/api/search/horoshop/accessories/products/${productId}/publish`)
    .send({})
    .expect(422);
});
