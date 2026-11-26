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
const unavailableProductId = randomUUID();
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
  await pool.query(`
    INSERT INTO search_horoshop_products (
      id, connection_id, generation, external_id, sku, titles, brand,
      category_external_id, price, currency, availability, visible,
      primary_image_url, canonical_url, source_data, active, last_seen_sync_id
    ) VALUES (
      $1, $2, $3, 'poco-x7-pro', 'POCO-X7-PRO', $4::JSONB, 'Poco',
      'smartphones', '15999', 'UAH', 'Немає в наявності', TRUE,
      'https://cdn.example.com/poco.webp', 'https://shop.example.com/poco-x7-pro/',
      $5::JSONB, TRUE, $6
    )
  `, [unavailableProductId, connectionId, generation,
    JSON.stringify({ uk: 'Смартфон POCO X7 Pro 8/256GB' }),
    JSON.stringify({ id: 9002 }), syncId]);
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

  await request(app).post('/api/public/product-selections/events').send({
    publicId,
    events: [
      { eventType: 'impression', visitorKey: 'selection-visitor', pageUrl: 'https://shop.example.com/article/' },
      { eventType: 'product_impression', productExternalId: 'tecno-spark-50', visitorKey: 'selection-visitor', pageUrl: 'https://shop.example.com/article/', surface: 'mobile' },
      { eventType: 'product_click', productExternalId: 'tecno-spark-50', visitorKey: 'selection-visitor', pageUrl: 'https://shop.example.com/article/', surface: 'mobile' },
      { eventType: 'buy_click', productExternalId: 'tecno-spark-50', visitorKey: 'selection-visitor', pageUrl: 'https://shop.example.com/article/', surface: 'mobile' },
      { eventType: 'add_to_cart', productExternalId: 'tecno-spark-50', visitorKey: 'selection-visitor', pageUrl: 'https://shop.example.com/article/', surface: 'mobile' }
    ]
  }).expect(204);
  const analytics = await admin.get('/api/product-selections/analytics/overview').query({ days: 30 }).expect(200);
  assert.equal(analytics.body.data.totals.impressions, 1);
  assert.equal(analytics.body.data.totals.productClicks, 1);
  assert.equal(analytics.body.data.totals.addToCart, 1);
  assert.equal(analytics.body.data.totals.uniqueVisitors, 1);
  assert.equal(analytics.body.data.products[0].title, 'Смартфон TECNO Spark 50 4/128GB');
  assert.equal(analytics.body.data.surfaces.find((item) => item.surface === 'mobile').count, 4);

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

test('out-of-stock products can be saved and remain visible in the public selection', async () => {
  const catalog = await admin.get('/api/product-selections/catalog').query({ search: 'POCO' }).expect(200);
  assert.equal(catalog.body.data.items.length, 1);
  assert.equal(catalog.body.data.items[0].availability, 'Немає в наявності');

  const created = await admin.post('/api/product-selections').send(selectionInput({
    name: 'Очікувані новинки',
    items: [{ productExternalId: 'poco-x7-pro', modificationExternalId: null }]
  })).expect(201);
  assert.equal(created.body.data.items.length, 1);
  assert.equal(created.body.data.items[0].available, false);

  const embed = await request(app)
    .get(`/api/public/product-selections/${created.body.data.publicId}/embed.js`)
    .expect(200);
  assert.match(embed.text, /Смартфон POCO X7 Pro/u);
  assert.match(embed.text, /"availability":"Немає в наявності"/u);
  assert.match(embed.text, /"available":false/u);

  await admin.delete(`/api/product-selections/${created.body.data.id}`).expect(204);
});

test('thematic campaigns resolve mixed lists, persist category edits and serve current catalog pages', async () => {
  const base = '/api/thematic-campaigns';
  await request(app).get(base).expect(401);
  await pool.query(`INSERT INTO search_horoshop_modifications
    (connection_id, generation, product_id, external_id, sku, titles, last_seen_sync_id)
    VALUES ($1,$2,$3,'black','BLACK-50',$4::jsonb,$5)`, [connectionId, generation, productId, JSON.stringify({ uk: 'Чорний' }), syncId]);
  const resolved = (await admin.post(base + '/resolve').send({
    entries: ['Смартфон TECNO Spark 50 4/128GB', 'BLACK-50', 'TECNO-50', 'POCO-X7-PRO', 'BLACK-50', '???']
  }).expect(200)).body.data;
  assert.deepEqual(resolved.matched.map((item) => item.id), [productId, unavailableProductId]);
  assert.deepEqual(resolved.matched.map((item) => item.availability), ['В наявності', 'Немає в наявності']);
  assert.equal(resolved.matched[0].category, 'smartphones');
  assert.equal(resolved.duplicates, 3);
  assert.deepEqual(resolved.unmatched, ['???']);
  const first = randomUUID(), second = randomUUID();
  const extra = Array.from({ length: 125 }, () => randomUUID());
  for (const [index, id] of extra.entries()) {
    await pool.query(`INSERT INTO search_horoshop_products
      (id,connection_id,generation,external_id,sku,titles,price,primary_image_url,canonical_url,last_seen_sync_id,brand)
      VALUES ($1,$2,$3,$4,$4,$5::jsonb,'123','/image.jpg','/item/',$6,$7)`,
    [id, connectionId, generation, 'extra-' + index, JSON.stringify({ uk: 'Для подарунка ' + index }), syncId,
      index < 75 ? null : index % 2 ? 'Sony' : 'SONY']);
  }
  const input = { generation, name: 'Різдво', sections: [
    { id: first, name: 'Телефони', categories: ['smartphones'], productIds: [productId, unavailableProductId] },
    { id: second, name: 'Подарунки', categories: ['gift'], productIds: extra }
  ] };
  const created = (await admin.post(base).send(input).expect(201)).body.data;
  const resource = base + '/' + created.id;
  const widget = '/api/public/thematic-campaigns/' + created.publicId;
  assert.ok((await admin.get(base).expect(200)).body.data.some((row) => row.id === created.id));
  const detail = (await admin.get(resource).expect(200)).body.data;
  assert.equal(detail.sections[1].products.length, 125);
  assert.equal(detail.sections[1].products[0].availability, null);
  assert.equal(detail.sections[0].products[0].sku, 'TECNO-50');
  assert.deepEqual(detail.sections[0].products.map((item) => item.availability), ['В наявності', 'Немає в наявності']);
  await admin.put(resource).send({ ...input, revision: 1, sections: [input.sections[0], { ...input.sections[1], productIds: [productId] }] }).expect(422);
  const embed = await request(app).get(widget + '/embed.js').expect(200);
  assert.match(embed.text, /Різдво/u);
  assert.match(embed.text, /"brands":\[/u);
  assert.doesNotMatch(embed.text, /TECNO Spark|encrypted_credentials/u);
  const offers = (filters) => request(app).get(widget + '/products').query({ revision: 1, ...filters });
  const byBrand = (await offers({ brand: 'sOnY', section: second }).expect(200)).body.data;
  assert.equal(byBrand.total, 50);
  assert.equal(byBrand.products[0].article, 'extra-75');
  assert.equal(byBrand.products.length, 24);
  const brandPage = (await offers({ brand: 'sony', section: second, cursor: byBrand.nextCursor }).expect(200)).body.data;
  assert.equal(brandPage.products[0].article, 'extra-99');
  const multi = (await offers({ section: first }).query('brand=poco&brand=tecno').expect(200)).body.data;
  assert.deepEqual(multi.products.map((p) => p.brand), ['Tecno', 'Poco']);
  assert.equal((await offers({ brand: 'sony', section: first }).expect(200)).body.data.total, 0);
  assert.equal((await offers({ brand: 'sony', q: 'подарунка 120' }).expect(200)).body.data.total, 1);
  assert.equal((await offers({ q: 'EXTRA-120' }).expect(200)).body.data.products[0].article, 'extra-120');
  await offers({ brand: '   ' }).expect(422);
  await offers({ q: 'a'.repeat(201) }).expect(422);
  const page = (await request(app).get(widget + '/products').query({ revision: 1, section: second }).expect(200)).body.data;
  assert.equal(page.products.length, 24);
  assert.equal(page.nextCursor, 26);
  const tail = (await request(app).get(widget + '/products').query({ revision: 1, section: second, cursor: 122 }).expect(200)).body.data;
  assert.equal(tail.products.length, 5);
  assert.equal(tail.nextCursor, null);
  assert.equal(tail.products[0].pageUrl, 'https://shop.example.com/item/');
  await pool.query('UPDATE search_horoshop_products SET visible = FALSE WHERE id = $1', [extra[0]]);
  const filtered = (await request(app).get(widget + '/products').query({ revision: 1, section: second }).expect(200)).body.data;
  assert.equal(filtered.nextCursor, 27);
  assert.equal(filtered.products[0].productExternalId, 'extra-1');
  const continued = (await request(app).get(widget + '/products').query({ revision: 1, section: second, cursor: page.nextCursor }).expect(200)).body.data;
  assert.equal(continued.products[0].productExternalId, 'extra-24');
  await pool.query('UPDATE search_horoshop_products SET availability = $2 WHERE id = $1', [productId, 'Очікується']);
  const refreshed = (await admin.get(resource).expect(200)).body.data;
  assert.equal(refreshed.sections[0].products[0].availability, 'Очікується');
  const revision = (await admin.put(resource).send({ ...input, name: 'Зимові акції', revision: 1,
    sections: [{ ...input.sections[0], name: 'Усі подарунки', categories: ['smartphones', 'gift'], productIds: [productId, ...extra] }]
  }).expect(200)).body.data.revision;
  assert.equal(revision, 2);
  await admin.put(resource).send({ ...input, revision: 1 }).expect(409);
  await request(app).get(widget + '/products').query({ revision: 1 }).expect(409);
  await admin.delete(resource).query({ revision }).expect(204);
  await request(app).get(widget + '/embed.js').expect(404);
});
