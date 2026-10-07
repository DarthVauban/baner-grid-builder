import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://horoshop-popularity-tests';
process.env.JWT_SECRET = 'popularity-test-secret-01234567890123456789';
process.env.COOKIE_SECURE = 'false';
process.env.ADMIN_NAME = 'Popularity Admin';
process.env.ADMIN_EMAIL = 'popularity-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');
const { encryptHoroshopCredentials } = await import('../src/modules/search/horoshop/credential-cipher.js');
const { horoshopPopularityService: service } = await import('../src/modules/search/horoshop/popularity.service.js');
const { resolvePopularityEntries, remotePopularityGroups, targetPopularity } = await import('../src/modules/search/horoshop/popularity.domain.js');

const agent = request.agent(app);
const base = '/api/search/horoshop/popularity';
let productIds;
let remote;
let imports;
let skipWrite;

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  await agent.post('/api/auth/login').send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }).expect(200);
});
after(async () => { await pool.end(); });

beforeEach(async () => {
  await pool.query('DELETE FROM search_horoshop_connections');
  const connection = randomUUID();
  const generation = randomUUID();
  const syncId = randomUUID();
  productIds = [randomUUID(), randomUUID()];
  imports = [];
  skipWrite = false;
  remote = [
    { id: 101, article: 'PHONE', popularity: 5, modifications: [
      { article: 'PHONE-BLACK', popularity: 5 }, { article: 'PHONE-WHITE', popularity: 5 }
    ] },
    { id: 102, article: 'HEADSET', popularity: 0, modifications: [{ article: 'HEADSET-1', popularity: 0 }] }
  ];
  await pool.query(`INSERT INTO search_horoshop_connections
    (id, generation, store_domain, encrypted_credentials, status, last_sync_at)
    VALUES ($1, $2, 'shop.example.com', $3, 'connected', NOW())`,
  [connection, generation, encryptHoroshopCredentials({ login: 'fixture', password: 'fixture' })]);
  for (let index = 0; index < productIds.length; index += 1) {
    const item = remote[index];
    await pool.query(`INSERT INTO search_horoshop_products
      (id, connection_id, generation, external_id, sku, titles, brand, category_external_id,
       availability, popularity, source_data, last_seen_sync_id)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, 'В наявності', $9, $10::jsonb, $11)`,
    [productIds[index], connection, generation, String(item.id), item.article,
      JSON.stringify({ uk: index ? 'Навушники' : 'Телефон' }), index ? 'Samsung' : 'Apple',
      index ? 'headsets' : 'phones', String(item.popularity), JSON.stringify(item), syncId]);
    for (const offer of item.modifications) {
      await pool.query(`INSERT INTO search_horoshop_modifications
        (connection_id, generation, product_id, external_id, sku, titles, source_data, last_seen_sync_id)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
      [connection, generation, productIds[index], `${item.id}:${offer.article}`, offer.article,
        JSON.stringify({ uk: `${index ? 'Навушники' : 'Телефон'} ${offer.article}` }), JSON.stringify(offer), syncId]);
    }
  }
  service.clientFactory = () => ({
    authenticate: async () => 'fixture-token',
    exportCatalog: async (_token, _offset, limit) => {
      assert.equal(limit, 500);
      return { products: structuredClone(remote), nextOffset: null };
    },
    importCatalog: async (_token, payload, options) => {
      imports.push(structuredClone(payload));
      assert.equal(options.maxAttempts, 1);
      if (skipWrite) return { imported: 0 };
      for (const update of payload) {
        const group = remote.find((item) => item.modifications.some((offer) => offer.article === update.article));
        const offer = group?.modifications.find((item) => item.article === update.article);
        if (offer) offer.popularity = update.popularity;
        if (group?.modifications.every((item) => item.popularity === update.popularity)) group.popularity = update.popularity;
      }
      return { imported: payload.length };
    }
  });
});

async function completed(id) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = (await agent.get(`${base}/operations/${id}`).expect(200)).body.data;
    if (!['queued', 'running'].includes(result.status)) return result;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Popularity operation did not complete');
}

test('catalog filters by brand and popularity; pasted modification articles resolve to one parent', async () => {
  const response = await agent.get(`${base}/catalog?brand=Apple&popularity=positive`).expect(200);
  assert.equal(response.body.data.total, 1);
  assert.equal(response.body.data.maximumPopularity, 5);
  assert.equal(response.body.data.items[0].sku, 'PHONE');
  assert.equal(response.body.data.items[0].modifications.length, 2);
  assert.deepEqual(response.body.data.brands, ['Apple', 'Samsung']);
  const resolution = await agent.post(`${base}/resolve`).send({ entries: ['PHONE-BLACK', 'Телефон', 'PHONE-BLACK', 'MISSING'] }).expect(200);
  assert.deepEqual(resolution.body.data.matched.map((item) => item.productId), [productIds[0]]);
  assert.deepEqual(resolution.body.data.unmatched, ['MISSING']);
});

test('saved-list catalog is scoped to its product IDs and a popularity range', async () => {
  const scoped = await agent.post(`${base}/catalog/selection`).send({
    productIds: [productIds[1], productIds[0]],
    filters: { popularity: 'range', popularityMin: 1, popularityMax: 5 }
  }).expect(200);
  assert.equal(scoped.body.data.total, 1);
  assert.deepEqual(scoped.body.data.matchingProductIds, [productIds[0]]);
  assert.deepEqual(scoped.body.data.items.map((item) => item.sku), ['PHONE']);
  assert.equal(scoped.body.data.maximumPopularity, 5);

  const listOnly = await agent.post(`${base}/catalog/selection`).send({
    productIds: [productIds[1]], filters: {}
  }).expect(200);
  assert.deepEqual(listOnly.body.data.items.map((item) => item.sku), ['HEADSET']);
  assert.equal(listOnly.body.data.total, 1);

  await agent.get(`${base}/catalog?popularity=range&popularityMin=5&popularityMax=1`).expect(422);
});

test('preview and apply one parent value to all its offers, then verify and cache it', async () => {
  const preview = await agent.post(`${base}/operations/preview`).send({
    selection: { productIds: [productIds[0]] }, action: { mode: 'set', value: 20 }
  }).expect(201);
  const plan = preview.body.data;
  assert.equal(plan.status, 'draft');
  assert.deepEqual(plan.items[0].articles, ['PHONE-BLACK', 'PHONE-WHITE']);
  assert.equal(plan.items[0].before, 5);
  assert.equal(plan.items[0].target, 20);
  await agent.post(`${base}/operations/${plan.id}/apply`).expect(202);
  const result = await completed(plan.id);
  assert.equal(result.status, 'completed');
  assert.equal(result.items[0].status, 'succeeded');
  assert.deepEqual(imports.flat(), [
    { article: 'PHONE-BLACK', popularity: 20 }, { article: 'PHONE-WHITE', popularity: 20 }
  ]);
  const cached = await pool.query('SELECT popularity FROM search_horoshop_products WHERE id = $1', [productIds[0]]);
  assert.equal(cached.rows[0].popularity, '20');
  const history = await agent.get(`${base}/operations`).expect(200);
  assert.equal(history.body.data[0].confirmed, 1);
});

test('a remote popularity change prevents every write in the selected operation', async () => {
  const plan = (await agent.post(`${base}/operations/preview`).send({
    selection: { productIds }, action: { mode: 'add', value: 5 }
  }).expect(201)).body.data;
  remote[0].popularity = 7;
  remote[0].modifications.forEach((item) => { item.popularity = 7; });
  await agent.post(`${base}/operations/${plan.id}/apply`).expect(202);
  const result = await completed(plan.id);
  assert.equal(result.status, 'conflict');
  assert.equal(result.counts.conflict, 1);
  assert.equal(result.counts.cancelled, 1);
  assert.equal(imports.length, 0);
});

test('read-back marks an unconfirmed import as partial', async () => {
  skipWrite = true;
  const plan = (await agent.post(`${base}/operations/preview`).send({
    selection: { productIds: [productIds[0]] }, action: { mode: 'reset' }
  }).expect(201)).body.data;
  await agent.post(`${base}/operations/${plan.id}/apply`).expect(202);
  const result = await completed(plan.id);
  assert.equal(result.status, 'partial');
  assert.equal(result.items[0].status, 'failed');
});

test('domain rejects overflow and detects ambiguous titles and inconsistent remote values', () => {
  assert.throws(() => targetPopularity(1_000_000_000, 'add', 1), /межі/u);
  const resolution = resolvePopularityEntries(['Товар'], [
    { id: 'a', sku: 'A', titles: { uk: 'Товар' }, modifications: [] },
    { id: 'b', sku: 'B', titles: { uk: 'Товар' }, modifications: [] }
  ]);
  assert.equal(resolution.ambiguous.length, 1);
  const groups = remotePopularityGroups([{ article: 'P', popularity: 5, modifications: [{ article: 'P-1', popularity: 7 }] }]);
  assert.equal(groups.get('P').inconsistent, true);
});
