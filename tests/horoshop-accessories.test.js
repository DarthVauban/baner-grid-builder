import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://horoshop-accessory-tests';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.COOKIE_SECURE = 'false';

const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { encryptHoroshopCredentials } = await import('../src/modules/search/horoshop/credential-cipher.js');
const { HoroshopAccessoryRepository } = await import('../src/modules/search/horoshop/accessory.repository.js');
const { HoroshopAccessoryService } = await import('../src/modules/search/horoshop/accessory.service.js');
const { recommendAccessories } = await import('../src/modules/search/horoshop/accessory-recommender.js');

const ids = {
  connection: randomUUID(), generation: randomUUID(), sync: randomUUID(),
  phoneCategory: randomUUID(), accessoryCategory: randomUUID(),
  phone: randomUUID(), case: randomUUID(), wrongCase: randomUUID(), charger: randomUUID(),
  unrelated: randomUUID(), battery: randomUUID()
};

before(async () => {
  await runMigrations();
  await pool.query(`
    INSERT INTO search_horoshop_connections (
      id, generation, store_domain, encrypted_credentials, status, last_sync_at
    ) VALUES ($1, $2, 'accessory-shop.example', $3, 'connected', NOW())
  `, [ids.connection, ids.generation, encryptHoroshopCredentials({ login: 'owner', password: 'secret' })]);
  await pool.query(`
    INSERT INTO search_horoshop_categories (
      id, connection_id, generation, external_id, titles, active, last_seen_sync_id
    ) VALUES
      ($1, $3, $4, 'phones', $5::jsonb, TRUE, $7),
      ($2, $3, $4, 'accessories', $6::jsonb, TRUE, $7)
  `, [
    ids.phoneCategory, ids.accessoryCategory, ids.connection, ids.generation,
    JSON.stringify({ uk: 'Смартфони' }), JSON.stringify({ uk: 'Аксесуари' }), ids.sync
  ]);
  const products = [
    [ids.phone, 'IPHONE-15', { uk: 'Смартфон Apple iPhone 15 Pro' }, 'Apple', 'phones', 'USB-C', 100, { accessories: ['CASE-15'] }],
    [ids.case, 'CASE-15', { uk: 'Чохол Apple iPhone 15 Pro Case' }, 'Apple', 'accessories', '', 95, {}],
    [ids.wrongCase, 'CASE-14', { uk: 'Чохол Apple iPhone 14 Pro Case' }, 'Apple', 'accessories', '', 96, {}],
    [ids.charger, 'CHARGER-30', { uk: 'Зарядний пристрій USB-C 30W' }, 'Example', 'accessories', 'USB-C', 88, {}],
    [ids.unrelated, 'PHONE-OTHER', { uk: 'Смартфон Samsung Galaxy S24' }, 'Samsung', 'phones', 'USB-C', 99, {}],
    [ids.battery, 'BATTERY-AA', { uk: 'Батарейки Duracell AA 4 шт' }, 'Duracell', 'accessories', '', 91, {}]
  ];
  for (const [id, sku, titles, brand, category, connector, popularity, source] of products) {
    await pool.query(`
      INSERT INTO search_horoshop_products (
        id, connection_id, generation, external_id, sku, titles, brand,
        category_external_id, price, currency, availability, visible, popularity,
        characteristics, source_data, active, last_seen_sync_id
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, '1000', 'UAH',
        'В наявності', TRUE, $9, $10::jsonb, $11::jsonb, TRUE, $12)
    `, [
      id, ids.connection, ids.generation, id, sku, JSON.stringify(titles), brand,
      category, String(popularity), JSON.stringify({ connector }), JSON.stringify(source), ids.sync
    ]);
  }
});

after(async () => pool.end());

test('recommendation scoring prioritizes compatible, useful and available accessories', () => {
  const recommendations = recommendAccessories({
    id: ids.phone, titles: { uk: 'Смартфон Apple iPhone 15 Pro' }, brand: 'Apple',
    categoryTitles: { uk: 'Смартфони' }, characteristics: { connector: 'USB-C' }
  }, [{
    id: ids.case, titles: { uk: 'Чохол Apple iPhone 15 Pro Case' }, brand: 'Apple',
    categoryTitles: { uk: 'Аксесуари' }, characteristics: {}, popularity: '95',
    availabilities: ['В наявності'], visible: true, active: true
  }, {
    id: ids.wrongCase, titles: { uk: 'Чохол Apple iPhone 14 Pro Case' }, brand: 'Apple',
    categoryTitles: { uk: 'Аксесуари' }, characteristics: {}, popularity: '96',
    availabilities: ['В наявності'], visible: true, active: true
  }, {
    id: ids.unrelated, titles: { uk: 'Смартфон Samsung Galaxy S24' }, brand: 'Samsung',
    categoryTitles: { uk: 'Смартфони' }, characteristics: { connector: 'USB-C' }, popularity: '99',
    availabilities: ['В наявності'], visible: true, active: true
  }], 12);

  assert.equal(recommendations.length, 1);
  assert.equal(recommendations[0].productId, ids.case);
  assert.equal(recommendations.some((item) => item.productId === ids.wrongCase), false);
  assert.ok(recommendations[0].compatibilityScore > 0.8);
  assert.match(recommendations[0].reason, /модель явно збігається/u);
});

test('recommendation scoring deliberately leaves unsupported products without suggestions', () => {
  const recommendations = recommendAccessories({
    id: ids.battery, titles: { uk: 'Батарейки Duracell AA 4 шт' }, brand: 'Duracell',
    categoryTitles: { uk: 'Аксесуари' }, characteristics: {}
  }, [{
    id: ids.charger, titles: { uk: 'Зарядний пристрій USB-C 30W' }, brand: 'Example',
    categoryTitles: { uk: 'Аксесуари' }, characteristics: { connector: 'USB-C' }, popularity: '88',
    availabilities: ['В наявності'], visible: true, active: true
  }], 12);

  assert.deepEqual(recommendations, []);
});

test('accessory workflow hydrates current links, saves a draft and publishes an overwrite payload', async () => {
  const imports = [];
  const repository = new HoroshopAccessoryRepository(pool);
  const service = new HoroshopAccessoryService({
    repository,
    catalogService: { runExclusiveExternalWrite: (operation) => operation() },
    clientFactory: () => ({
      async authenticate(login, password) {
        assert.equal(login, 'owner');
        assert.equal(password, 'secret');
        return 'token';
      },
      async importCatalog(token, products) {
        imports.push({ token, products });
        return {};
      }
    })
  });

  let detail = await service.detail(ids.phone, null);
  assert.equal(Object.hasOwn(detail.product, 'sourceData'), false);
  assert.equal(Object.hasOwn(detail.product, 'characteristics'), false);
  assert.equal(detail.draft.catalogStateKnown, true);
  assert.equal(detail.draft.selected.length, 1);
  assert.equal(detail.draft.selected[0].target.id, ids.case);
  assert.equal(detail.draft.selected[0].published, true);

  const generated = await service.generateRecommendations(ids.phone, 12, null);
  assert.ok(generated.generatedCount >= 2);
  assert.ok(generated.draft.suggestions.some((item) => item.target.id === ids.charger));

  const bulk = await service.generateAllRecommendations(12, null);
  assert.equal(bulk.analyzedProducts, 6);
  assert.equal(bulk.productsWithRecommendations + bulk.productsWithoutRecommendations, 6);
  assert.ok(bulk.productsWithoutRecommendations >= 4);
  assert.ok(bulk.recommendationsGenerated >= 3);

  detail = await service.saveDraft(ids.phone, [
    { type: 'product', id: ids.case },
    { type: 'product', id: ids.charger },
    { type: 'category', id: ids.accessoryCategory }
  ], null);
  assert.equal(detail.draft.selected.length, 3);
  assert.equal(detail.draft.isDirty, true);

  detail = await service.publish(ids.phone, null);
  assert.equal(detail.draft.isDirty, false);
  assert.equal(detail.latestPublication.status, 'succeeded');
  assert.deepEqual(imports, [{
    token: 'token',
    products: [{
      article: 'IPHONE-15',
      accessories: ['CASE-15', 'CHARGER-30', { page: { id: 'accessories' } }]
    }]
  }]);

  await pool.query('DELETE FROM search_horoshop_connections WHERE id = $1', [ids.connection]);
  const remaining = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM search_horoshop_accessory_sets) AS sets,
      (SELECT COUNT(*) FROM search_horoshop_accessory_links) AS links,
      (SELECT COUNT(*) FROM search_horoshop_accessory_publications) AS publications
  `);
  assert.deepEqual({
    sets: Number(remaining.rows[0].sets),
    links: Number(remaining.rows[0].links),
    publications: Number(remaining.rows[0].publications)
  }, { sets: 0, links: 0, publications: 0 });
});
