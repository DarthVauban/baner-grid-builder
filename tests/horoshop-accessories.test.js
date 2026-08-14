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
const { HoroshopApiError } = await import('../src/modules/search/horoshop/horoshop.client.js');
const { HoroshopAccessoryRepository } = await import('../src/modules/search/horoshop/accessory.repository.js');
const {
  HOROSHOP_CODEX_REVIEW_FORMAT,
  HoroshopAccessoryService
} = await import('../src/modules/search/horoshop/accessory.service.js');

const ids = {
  connection: randomUUID(), generation: randomUUID(), sync: randomUUID(), modification: randomUUID(),
  phoneCategory: randomUUID(), accessoryCategory: randomUUID(),
  phone: randomUUID(), case: randomUUID(), charger: randomUUID(), battery: randomUUID()
};
let reviewRevision;

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
    [ids.phone, 'IPHONE-15', { uk: 'Смартфон Apple iPhone 15 Pro' }, 'Apple', 'phones', { connector: 'USB-C' }, { accessories: ['CASE-15'] }],
    [ids.case, 'CASE-15', { uk: 'Чохол Apple iPhone 15 Pro' }, 'Apple', 'accessories', { model: 'iPhone 15 Pro' }, {}],
    [ids.charger, 'CHARGER-30', { uk: 'Зарядний пристрій USB-C 30W' }, 'Example', 'accessories', { connector: 'USB-C', power: '30W' }, {}],
    [ids.battery, 'BATTERY-AA', { uk: 'Батарейки Duracell AA 4 шт' }, 'Duracell', 'accessories', { size: 'AA' }, {}]
  ];
  for (const [id, sku, titles, brand, category, characteristics, source] of products) {
    await pool.query(`
      INSERT INTO search_horoshop_products (
        id, connection_id, generation, external_id, sku, titles, descriptions, brand,
        category_external_id, price, currency, availability, visible, popularity,
        characteristics, source_data, active, last_seen_sync_id
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, '1000', 'UAH',
        'В наявності', TRUE, '90', $10::jsonb, $11::jsonb, TRUE, $12)
    `, [
      id, ids.connection, ids.generation, id, sku, JSON.stringify(titles),
      JSON.stringify({ uk: `Опис ${titles.uk}` }), brand, category,
      JSON.stringify(characteristics), JSON.stringify(source), ids.sync
    ]);
  }
  await pool.query(`
    INSERT INTO search_horoshop_modifications (
      id, connection_id, product_id, generation, external_id, sku, titles, price,
      currency, availability, visible, attributes, active, last_seen_sync_id
    ) VALUES ($1, $2, $3, $4, 'iphone-15:black', 'IPHONE-15-BLACK', $5::jsonb,
      '1100', 'UAH', 'В наявності', TRUE, $6::jsonb, TRUE, $7)
  `, [
    ids.modification, ids.connection, ids.phone, ids.generation,
    JSON.stringify({ uk: 'Apple iPhone 15 Pro Black' }),
    JSON.stringify({ color: 'Black', storage: '256 GB' }), ids.sync
  ]);
  reviewRevision = (await new HoroshopAccessoryService({
    repository: new HoroshopAccessoryRepository(pool)
  }).reviewCatalog()).catalogRevision;
});

after(async () => pool.end());

function fullReview(overrides = new Map()) {
  return {
    format: HOROSHOP_CODEX_REVIEW_FORMAT,
    connectionGeneration: ids.generation,
    catalogRevision: reviewRevision,
    products: [ids.phone, ids.case, ids.charger, ids.battery].map((productId) => ({
      productId,
      recommendations: overrides.get(productId) || []
    }))
  };
}

function recommendation(productId, reason, scores = {
  compatibility: .95,
  utility: .9,
  availability: 1,
  popularity: .8,
  total: .92
}) {
  return { productId, reason, scores };
}

test('Codex export contains specifications and modification trees but no credentials or raw source data', async () => {
  const service = new HoroshopAccessoryService({ repository: new HoroshopAccessoryRepository(pool) });
  const catalog = await service.reviewCatalog();

  assert.equal(catalog.format, HOROSHOP_CODEX_REVIEW_FORMAT);
  assert.equal(catalog.connectionGeneration, ids.generation);
  assert.equal(catalog.catalogRevision, reviewRevision);
  assert.equal(catalog.storeDomain, 'accessory-shop.example');
  assert.equal(catalog.products.length, 4);
  const phone = catalog.products.find((product) => product.id === ids.phone);
  assert.deepEqual(phone.characteristics, { connector: 'USB-C' });
  assert.equal(phone.descriptions.uk, 'Опис Смартфон Apple iPhone 15 Pro');
  assert.equal(phone.modifications.length, 1);
  assert.deepEqual(phone.modifications[0].attributes, { color: 'Black', storage: '256 GB' });
  assert.equal(JSON.stringify(catalog).includes('encryptedCredentials'), false);
  assert.equal(JSON.stringify(catalog).includes('sourceData'), false);
  assert.equal(JSON.stringify(catalog).includes('secret'), false);
});

test('Codex review must cover the current connection and every active product', async () => {
  const service = new HoroshopAccessoryService({ repository: new HoroshopAccessoryRepository(pool) });

  await assert.rejects(
    service.importReview({ ...fullReview(), connectionGeneration: randomUUID() }, null),
    (error) => error.code === 'HOROSHOP_CODEX_REVIEW_STALE'
  );
  await assert.rejects(
    service.importReview({ ...fullReview(), catalogRevision: '0'.repeat(64) }, null),
    (error) => error.code === 'HOROSHOP_CODEX_REVIEW_STALE'
  );
  await assert.rejects(
    service.importReview({ ...fullReview(), products: fullReview().products.slice(0, 2) }, null),
    (error) => error.code === 'HOROSHOP_CODEX_REVIEW_INCOMPLETE'
  );
  await assert.rejects(
    service.importReview(fullReview(new Map([[ids.phone, [recommendation(ids.phone, 'Той самий товар не може бути аксесуаром.')]]])), null),
    (error) => error.code === 'HOROSHOP_CODEX_REVIEW_ACCESSORY_INVALID'
  );
});

test('Codex proposals become reviewable drafts and publication remains an explicit action', async () => {
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

  const result = await service.importReview(fullReview(new Map([[
    ids.phone,
    [
      recommendation(ids.case, 'Точний чохол для цієї моделі захищає смартфон від пошкоджень.'),
      recommendation(ids.charger, 'USB-C зарядний пристрій корисний для щоденного заряджання смартфона.', {
        compatibility: .88, utility: .86, availability: 1, popularity: .75, total: .87
      })
    ]
  ]])), null);
  assert.deepEqual(result, {
    reviewedProducts: 4,
    productsWithRecommendations: 1,
    productsWithoutRecommendations: 3,
    recommendationsSaved: 2
  });

  let detail = await service.detail(ids.phone, null);
  assert.equal(detail.draft.selected.length, 1);
  assert.equal(detail.draft.selected[0].target.id, ids.case);
  assert.equal(detail.draft.suggestions.length, 1);
  assert.equal(detail.draft.suggestions[0].source, 'codex');
  assert.equal(detail.draft.suggestions[0].target.id, ids.charger);
  assert.deepEqual(detail.draft.suggestions[0].scores, {
    compatibility: .88, utility: .86, availability: 1, popularity: .75, total: .87
  });

  detail = await service.saveDraft(ids.phone, [
    { type: 'product', id: ids.case },
    { type: 'product', id: ids.charger }
  ], null);
  assert.equal(detail.draft.isDirty, true);
  assert.equal(imports.length, 0);

  detail = await service.publish(ids.phone, null);
  assert.equal(detail.draft.isDirty, false);
  assert.deepEqual(imports, [{
    token: 'token',
    products: [{ article: 'IPHONE-15', accessories: ['CASE-15', 'CHARGER-30'] }]
  }]);
});

test('Codex proposals can be added to one draft or all drafts without publishing', async () => {
  const service = new HoroshopAccessoryService({ repository: new HoroshopAccessoryRepository(pool) });
  await service.importReview(fullReview(new Map([
    [ids.phone, [recommendation(ids.battery, 'Батарейки доречні як тестова пропозиція для перевірки додавання до поточної чернетки.')]],
    [ids.case, [recommendation(ids.charger, 'Зарядний пристрій доречний як тестова пропозиція для перевірки масового додавання.')]]
  ])), null);

  const current = await service.acceptReviewProposals(ids.phone, null);
  assert.equal(current.productsUpdated, 1);
  assert.equal(current.recommendationsAdded, 1);
  assert.equal(current.recommendationsSkipped, 0);
  assert.equal(current.detail.draft.suggestions.length, 0);
  assert.equal(current.detail.draft.selected.some((item) => item.target.id === ids.battery), true);
  assert.equal(current.detail.draft.isDirty, true);

  const all = await service.acceptAllReviewProposals(null);
  assert.deepEqual(all, {
    productsUpdated: 1,
    recommendationsAdded: 1,
    recommendationsSkipped: 0,
    detail: null
  });
  const caseDetail = await service.detail(ids.case, null);
  assert.equal(caseDetail.draft.suggestions.length, 0);
  assert.equal(caseDetail.draft.selected.some((item) => item.target.id === ids.charger), true);
});

test('all dirty accessory drafts are published to Horoshop in safe batches with progress', async () => {
  const imports = [];
  const progress = [];
  let authentications = 0;
  const service = new HoroshopAccessoryService({
    repository: new HoroshopAccessoryRepository(pool),
    catalogService: { runExclusiveExternalWrite: (operation) => operation() },
    publicationBatchSize: 1,
    clientFactory: () => ({
      async authenticate(login, password) {
        authentications += 1;
        assert.equal(login, 'owner');
        assert.equal(password, 'secret');
        return 'bulk-token';
      },
      async importCatalog(token, products) {
        imports.push({ token, products });
        return { imported: products.length };
      }
    })
  });

  assert.deepEqual(await service.publicationSummary(), {
    pendingProducts: 2,
    productAccessories: 4,
    categoryAccessories: 0
  });
  assert.deepEqual(await service.publishAll(null, (value) => progress.push(value)), {
    publishedProducts: 2,
    productAccessories: 4,
    categoryAccessories: 0
  });
  assert.equal(authentications, 1);
  assert.equal(imports.length, 2);
  assert.equal(imports[0].token, 'bulk-token');
  assert.deepEqual(imports.flatMap((item) => item.products).toSorted((left, right) => left.article.localeCompare(right.article)), [
    { article: 'CASE-15', accessories: ['CHARGER-30'] },
    { article: 'IPHONE-15', accessories: ['CASE-15', 'CHARGER-30', 'BATTERY-AA'] }
  ]);
  assert.deepEqual(progress.at(-1), {
    stage: 'completed',
    totalProducts: 2,
    processedProducts: 2,
    productAccessories: 4,
    categoryAccessories: 0,
    currentBatch: 2,
    totalBatches: 2,
    percentage: 100
  });
  assert.equal((await service.detail(ids.phone, null)).draft.isDirty, false);
  assert.equal((await service.detail(ids.case, null)).draft.isDirty, false);
  assert.deepEqual(await service.publicationSummary(), {
    pendingProducts: 0,
    productAccessories: 0,
    categoryAccessories: 0
  });
  assert.deepEqual(await service.publishAll(null), {
    publishedProducts: 0,
    productAccessories: 0,
    categoryAccessories: 0
  });
  assert.equal(imports.length, 2);
});

test('a rejected bulk batch preserves remaining drafts and exposes Horoshop diagnostics', async () => {
  await new HoroshopAccessoryService({ repository: new HoroshopAccessoryRepository(pool) })
    .saveDraft(ids.phone, [{ type: 'product', id: ids.case }], null);
  await new HoroshopAccessoryService({ repository: new HoroshopAccessoryRepository(pool) })
    .saveDraft(ids.case, [
      { type: 'product', id: ids.charger },
      { type: 'product', id: ids.battery }
    ], null);
  let importCalls = 0;
  const service = new HoroshopAccessoryService({
    repository: new HoroshopAccessoryRepository(pool),
    catalogService: { runExclusiveExternalWrite: (operation) => operation() },
    publicationBatchSize: 1,
    clientFactory: () => ({
      async authenticate() {
        return 'bulk-token';
      },
      async importCatalog() {
        importCalls += 1;
        if (importCalls === 2) {
          throw new HoroshopApiError('api_rejected', 422, 'Accessory article TEST-BAD was not found');
        }
        return { imported: 1 };
      }
    })
  });

  await assert.rejects(service.publishAll(null), (error) => {
    assert.equal(error.code, 'HOROSHOP_ACCESSORY_PUBLISH_REJECTED');
    assert.match(error.message, /Accessory article TEST-BAD was not found/u);
    assert.deepEqual(error.details.processedProducts, 1);
    assert.deepEqual(error.details.totalProducts, 2);
    return true;
  });
  assert.equal(importCalls, 2);
  const details = await Promise.all([
    service.detail(ids.phone, null),
    service.detail(ids.case, null)
  ]);
  assert.equal(details.filter((item) => item.draft.isDirty).length, 1);
  const remaining = await service.publicationSummary();
  assert.equal(remaining.pendingProducts, 1);
  assert.equal(remaining.categoryAccessories, 0);
});

test('database rejects the removed algorithm source', async () => {
  const set = await new HoroshopAccessoryRepository(pool).ensureSet(ids.battery, null);
  await assert.rejects(pool.query(`
    INSERT INTO search_horoshop_accessory_links (
      id, set_id, target_key, target_type, accessory_product_id, source
    ) VALUES ($1, $2, $3, 'product', $4, 'algorithm')
  `, [randomUUID(), set.set.id, `product:${ids.charger}`, ids.charger]));
});
