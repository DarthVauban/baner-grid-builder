import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://horoshop-catalog-tests';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.COOKIE_SECURE = 'false';

const { pool, query } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const {
  HoroshopClient,
  normalizeHoroshopStoreDomain
} = await import('../src/modules/search/horoshop/horoshop.client.js');
const {
  normalizeHoroshopProducts
} = await import('../src/modules/search/horoshop/catalog.normalizer.js');
const {
  HoroshopCatalogRepository
} = await import('../src/modules/search/horoshop/catalog.repository.js');
const {
  HoroshopCatalogService
} = await import('../src/modules/search/horoshop/catalog.service.js');

before(async () => {
  await runMigrations();
});

after(async () => {
  await pool.end();
});

test('Horoshop client validates public HTTPS domains and follows API envelopes and pagination', async () => {
  assert.equal(normalizeHoroshopStoreDomain('Shop.Example.COM').hostname, 'shop.example.com');
  assert.throws(() => normalizeHoroshopStoreDomain('http://shop.example.com'), /plain HTTPS/u);
  assert.throws(() => normalizeHoroshopStoreDomain('https://127.0.0.1'), /Private network/u);
  assert.throws(() => normalizeHoroshopStoreDomain('https://shop.example.com/path'), /plain HTTPS/u);

  const calls = [];
  const responses = [
    { status: 'OK', response: { token: 'session-token' } },
    { status: 'OK', response: { pages: [{ id: 10 }] } },
    { status: 'OK', response: { products: [{ id: 1 }], total: 2 } },
    { status: 'OK', response: { imported: 1 } }
  ];
  const client = new HoroshopClient('shop.example.com', {
    fetchImplementation: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response(JSON.stringify(responses.shift()), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    },
    lookupImplementation: async () => [{ address: '93.184.216.34', family: 4 }],
    sleep: async () => {}
  });

  const token = await client.authenticate('api-admin', 'secret');
  assert.equal(token, 'session-token');
  assert.deepEqual(await client.exportCategories(token), [{ id: 10 }]);
  assert.deepEqual(await client.exportCatalog(token, 0, 1), {
    products: [{ id: 1 }],
    nextOffset: 1
  });
  assert.deepEqual(await client.importCatalog(token, [{ article: 'PHONE-1', accessories: ['CASE-1'] }]), {
    imported: 1
  });
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
    '/api/auth/', '/api/pages/export/', '/api/catalog/export/', '/api/catalog/import/'
  ]);
  assert.deepEqual(calls[2].body, { token: 'session-token', offset: 0, limit: 1 });
  assert.deepEqual(calls[3].body, {
    token: 'session-token', products: [{ article: 'PHONE-1', accessories: ['CASE-1'] }]
  });
});

test('normalizer keeps product modifications, stock, URLs and raw source data', () => {
  const [product] = normalizeHoroshopProducts([{
    id: 501,
    parent_article: 'PHONE-501',
    title: { ua: 'Телефон 501', ru: 'Телефон 501 RU' },
    parent: { id: 25 },
    slug: 'phones/501',
    brand: 'Example',
    popularity: 87,
    characteristics: { color: 'black' },
    modifications: [
      { article: 'PHONE-501-128', mod_title: { ua: '128 ГБ' }, price: 100, quantity: 3 },
      { article: 'PHONE-501-256', mod_title: { ua: '256 ГБ' }, price: 120, residues: { 1: 0 } }
    ]
  }], 'shop.example.com');

  assert.equal(product.externalId, '501');
  assert.equal(product.titles.uk, 'Телефон 501');
  assert.equal(product.categoryExternalId, '25');
  assert.equal(product.canonicalUrl, 'https://shop.example.com/phones/501/');
  assert.equal(product.modifications.length, 2);
  assert.equal(product.modifications[0].availability, 'В наявності');
  assert.equal(product.modifications[1].availability, 'Немає в наявності');
  assert.deepEqual(product.source.characteristics, { color: 'black' });
});

test('full import streams pages, reconciles missing rows and purges before another store connects', async () => {
  const catalogs = new Map([
    ['first.example.com', [
      [{
        id: 'p-1', article: 'FIRST-1', title: { ua: 'Перший' }, parent_id: 'cat-1',
        modifications: [
          { article: 'FIRST-1-BLACK', price: '100', quantity: 2 },
          { article: 'FIRST-1-WHITE', price: '110', quantity: 0 }
        ]
      }],
      [{ id: 'p-2', article: 'FIRST-2', title: { ua: 'Другий' }, parent_id: 'cat-1' }]
    ]],
    ['second.example.com', [[
      { id: 'p-new', article: 'SECOND-1', title: { ua: 'Новий магазин' }, parent_id: 'cat-new' }
    ]]]
  ]);
  const clientFactory = (domain) => ({
    storeDomain: normalizeHoroshopStoreDomain(domain).hostname,
    async authenticate(login, password) {
      assert.ok(login);
      assert.ok(password);
      return 'token';
    },
    async exportCategories() {
      return [{ id: domain.startsWith('first') ? 'cat-1' : 'cat-new', title: { ua: 'Категорія' } }];
    },
    async exportCatalog(_token, offset) {
      const pages = catalogs.get(domain);
      const index = offset === 0 ? 0 : 1;
      const products = pages[index] || [];
      return { products, nextOffset: index + 1 < pages.length ? 200 : null };
    }
  });
  const service = new HoroshopCatalogService({
    repository: new HoroshopCatalogRepository(pool),
    clientFactory
  });

  await service.connect({
    storeDomain: 'first.example.com', login: 'owner', password: 'password', pollingIntervalMinutes: 15
  }, null);
  assert.equal(await service.startSync('full'), true);
  await service.waitForIdle();
  let status = await service.status();
  assert.equal(status.status, 'connected');
  assert.deepEqual(status.counts, { categories: 1, products: 2, modifications: 3 });
  assert.equal(status.latestRun.pagesReceived, 2);

  const staleTimestamp = new Date('2001-01-01T00:00:00.000Z');
  await query('UPDATE search_horoshop_categories SET updated_at = $1', [staleTimestamp]);
  await query('UPDATE search_horoshop_products SET updated_at = $1', [staleTimestamp]);
  await query('UPDATE search_horoshop_modifications SET updated_at = $1', [staleTimestamp]);
  const beforeUnchangedSync = await query(`
    SELECT external_id, last_seen_sync_id, sync_signature
    FROM search_horoshop_products
    ORDER BY external_id
  `);
  assert.ok(beforeUnchangedSync.rows.every((row) => /^[a-f0-9]{64}$/u.test(row.sync_signature)));

  await service.updateSettings({ pollingIntervalMinutes: 45 }, null);
  status = await service.status();
  assert.equal(status.pollingIntervalMinutes, 45);
  assert.equal(await service.startSync('scheduled'), true);
  await service.waitForIdle();
  const unchangedRows = await query(`
    SELECT external_id, last_seen_sync_id, updated_at
    FROM search_horoshop_products
    ORDER BY external_id
  `);
  assert.deepEqual(
    unchangedRows.rows.map((row) => ({ externalId: row.external_id, lastSeenSyncId: row.last_seen_sync_id })),
    beforeUnchangedSync.rows.map((row) => ({ externalId: row.external_id, lastSeenSyncId: row.last_seen_sync_id }))
  );
  assert.ok(unchangedRows.rows.every((row) => row.updated_at.toISOString() === staleTimestamp.toISOString()));
  const unchangedCategoryAndModificationRows = await query(`
    SELECT
      (SELECT COUNT(*) FROM search_horoshop_categories WHERE updated_at = $1) AS categories,
      (SELECT COUNT(*) FROM search_horoshop_modifications WHERE updated_at = $1) AS modifications
  `, [staleTimestamp]);
  assert.deepEqual({
    categories: Number(unchangedCategoryAndModificationRows.rows[0].categories),
    modifications: Number(unchangedCategoryAndModificationRows.rows[0].modifications)
  }, { categories: 1, modifications: 3 });

  catalogs.set('first.example.com', [[{
    id: 'p-1', article: 'FIRST-1', title: { ua: 'Перший оновлений' }, parent_id: 'cat-1',
    modifications: [{ article: 'FIRST-1-BLACK', price: '95', quantity: 1 }]
  }]]);
  assert.equal(await service.startSync('manual'), true);
  await service.waitForIdle();
  const activeAfterReconcile = await query(`
    SELECT
      (SELECT COUNT(*) FROM search_horoshop_products WHERE active) AS products,
      (SELECT COUNT(*) FROM search_horoshop_modifications WHERE active) AS modifications
  `);
  assert.equal(Number(activeAfterReconcile.rows[0].products), 1);
  assert.equal(Number(activeAfterReconcile.rows[0].modifications), 1);
  const changedRows = await query(`
    SELECT external_id, active, updated_at
    FROM search_horoshop_products
    ORDER BY external_id
  `);
  assert.ok(changedRows.rows.every((row) => row.updated_at.toISOString() !== staleTimestamp.toISOString()));
  assert.deepEqual(changedRows.rows.map((row) => [row.external_id, row.active]), [
    ['p-1', true], ['p-2', false]
  ]);
  const unchangedCategory = await query('SELECT updated_at FROM search_horoshop_categories');
  assert.equal(unchangedCategory.rows[0].updated_at.toISOString(), staleTimestamp.toISOString());

  const deleted = await service.disconnect('first.example.com', null);
  assert.deepEqual(deleted, { categories: 1, products: 2, modifications: 3 });
  const purged = await query(`
    SELECT
      (SELECT COUNT(*) FROM search_horoshop_connections) AS connections,
      (SELECT COUNT(*) FROM search_horoshop_products) AS products,
      (SELECT COUNT(*) FROM search_horoshop_modifications) AS modifications,
      (SELECT COUNT(*) FROM search_horoshop_sync_runs) AS runs
  `);
  assert.deepEqual({
    connections: Number(purged.rows[0].connections),
    products: Number(purged.rows[0].products),
    modifications: Number(purged.rows[0].modifications),
    runs: Number(purged.rows[0].runs)
  }, { connections: 0, products: 0, modifications: 0, runs: 0 });

  await service.connect({
    storeDomain: 'second.example.com', login: 'owner-2', password: 'password-2', pollingIntervalMinutes: 30
  }, null);
  await service.startSync('full');
  await service.waitForIdle();
  status = await service.status();
  assert.equal(status.storeDomain, 'second.example.com');
  assert.deepEqual(status.counts, { categories: 1, products: 1, modifications: 1 });
  const articles = await query('SELECT sku FROM search_horoshop_products ORDER BY sku');
  assert.deepEqual(articles.rows.map((row) => row.sku), ['SECOND-1']);
});
