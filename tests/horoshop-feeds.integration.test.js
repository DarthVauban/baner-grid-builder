import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://horoshop-feeds-tests';
process.env.JWT_SECRET = 'feeds-test-secret-01234567890123456789';
process.env.COOKIE_SECURE = 'false';
process.env.ADMIN_NAME = 'Feeds Admin';
process.env.ADMIN_EMAIL = 'feeds-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');
const { encryptHoroshopCredentials } = await import('../src/modules/search/horoshop/credential-cipher.js');
const { horoshopFeedService: service } = await import('../src/modules/search/horoshop/feeds.service.js');
const { feedNames, marketplaceNames, remoteFeedGroups, sameFeedSnapshot } = await import('../src/modules/search/horoshop/feeds.domain.js');
const agent = request.agent(app);
const base = '/api/search/horoshop/feeds';
const google = feedNames.google;
const facebook = feedNames.facebook;
let productIds;
let remote;
let imports;
let skipWrite;
let throwAfterWrite;
let apiCalls;

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
  imports = []; skipWrite = false; throwAfterWrite = false; apiCalls = 0;
  remote = [
    { id: 101, article: 'PHONE', export_to_marketplace: `${google};Rozetka Feed`, modifications: [
      { article: 'PHONE-BLACK', export_to_marketplace: `${google};Rozetka Feed`, price: 100 },
      { article: 'PHONE-WHITE', export_to_marketplace: `${facebook};Hotline Feed`, price: 120 }
    ] },
    { id: 102, article: 'HEADSET', export_to_marketplace: '', modifications: [
      { article: 'HEADSET-1', export_to_marketplace: '' }
    ] }
  ];
  await pool.query(`INSERT INTO search_horoshop_connections
    (id, generation, store_domain, encrypted_credentials, status, last_sync_at)
    VALUES ($1, $2, 'shop.example.com', $3, 'connected', NOW())`,
  [connection, generation, encryptHoroshopCredentials({ login: 'fixture', password: 'fixture' })]);
  for (let index = 0; index < productIds.length; index += 1) {
    const item = remote[index];
    await pool.query(`INSERT INTO search_horoshop_products
      (id, connection_id, generation, external_id, sku, titles, brand, category_external_id,
       availability, source_data, last_seen_sync_id)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, 'В наявності', $9::jsonb, $10)`,
    [productIds[index], connection, generation, String(item.id), item.article,
      JSON.stringify({ uk: index ? 'Навушники' : 'Телефон' }), index ? 'Samsung' : 'Apple',
      index ? 'headsets' : 'phones', JSON.stringify(item), syncId]);
    for (const offer of item.modifications) {
      await pool.query(`INSERT INTO search_horoshop_modifications
        (connection_id, generation, product_id, external_id, sku, titles, source_data, last_seen_sync_id)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
      [connection, generation, productIds[index], `${item.id}:${offer.article}`, offer.article,
        JSON.stringify({ uk: `${index ? 'Навушники' : 'Телефон'} ${offer.article}` }), JSON.stringify(offer), syncId]);
    }
  }
  service.clientFactory = () => ({
    authenticate: async () => { apiCalls += 1; return 'fixture-token'; },
    exportCatalog: async (_token, _offset, limit, _articles, options) => {
      apiCalls += 1;
      assert.equal(limit, 500);
      assert.deepEqual(options.includedParams, ['export_to_marketplace']);
      return { products: structuredClone(remote), nextOffset: null };
    },
    importCatalog: async (_token, payload, options) => {
      imports.push(structuredClone(payload));
      assert.equal(options.maxAttempts, 1);
      if (skipWrite) return {};
      for (const update of payload) {
        assert.deepEqual(Object.keys(update).sort(), ['article', 'export_to_marketplace']);
        const offer = remote.flatMap((product) => product.modifications || [product]).find((item) => item.article === update.article);
        if (offer) offer.export_to_marketplace = update.export_to_marketplace;
      }
      if (throwAfterWrite) throw new Error('response lost');
      return {};
    }
  });
});

async function preview(action = { google: 'enable', facebook: 'keep' }, ids = productIds) {
  return (await agent.post(`${base}/operations/preview`).send({ selection: { productIds: ids }, action }).expect(201)).body.data;
}
async function completed(id) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const result = await agent.get(`${base}/operations/${id}`).expect(200);
    if (!['queued', 'running'].includes(result.body.data.status)) {
      while (service.running) await new Promise((resolve) => setTimeout(resolve, 5));
      return result.body.data;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('Feed operation did not complete');
}
async function apply(plan) {
  await agent.post(`${base}/operations/${plan.id}/apply`).expect(202);
  return completed(plan.id);
}

test('catalog, saved-list scope, filters and variant resolution use the Horoshop catalog', async () => {
  const catalog = (await agent.get(`${base}/catalog?brand=Apple`).expect(200)).body.data;
  assert.equal(catalog.total, 1);
  assert.equal(catalog.items[0].google, 'mixed');
  assert.equal(catalog.items[0].facebook, 'mixed');
  const scoped = await agent.post(`${base}/catalog/selection`).send({ productIds: [productIds[1]], filters: {} }).expect(200);
  assert.deepEqual(scoped.body.data.matchingProductIds, [productIds[1]]);
  assert.equal(scoped.body.data.items[0].google, 'disabled');
  const resolved = await agent.post(`${base}/resolve`).send({ entries: ['PHONE-WHITE', 'UNKNOWN'] }).expect(200);
  assert.equal(resolved.body.data.matched[0].productId, productIds[0]);
  assert.deepEqual(resolved.body.data.unmatched, ['UNKNOWN']);
});

test('preview uses only the synchronized catalog and apply preserves each variant other marketplaces', async () => {
  const plan = await preview({ google: 'enable', facebook: 'disable' }, [productIds[0]]);
  assert.equal(plan.status, 'draft');
  assert.equal(imports.length, 0);
  assert.equal(apiCalls, 0, 'review must not wait for an external API request');
  assert.ok(plan.items[0].before[0].marketplaces.includes('Rozetka Feed'));
  const result = await apply(plan);
  assert.equal(result.status, 'completed');
  assert.deepEqual(marketplaceNames(remote[0].modifications[0].export_to_marketplace), [google, 'Rozetka Feed'].sort());
  assert.deepEqual(marketplaceNames(remote[0].modifications[1].export_to_marketplace), [google, 'Hotline Feed'].sort());
  assert.equal(remote[0].modifications[0].price, 100);
  assert.equal(imports.flat().some((item) => item.article === 'PHONE-BLACK'), false, 'unchanged offer needs no import');
  const catalog = (await agent.get(`${base}/catalog?brand=Apple`).expect(200)).body.data;
  assert.equal(catalog.items[0].google, 'enabled');
  assert.equal(catalog.items[0].facebook, 'disabled');
  const history = (await agent.get(`${base}/operations`).expect(200)).body.data;
  assert.equal(history[0].confirmed, 1);
  assert.deepEqual(history[0].action, plan.action);
});

test('real id/value marketplace exports support catalog, preview, independent updates and read-back', async () => {
  // Shape observed from the connected store's catalog/export, including with includedParams.
  const exportedFeeds = (value) => value.split(';').filter(Boolean).map((name, index) => ({
    id: name === facebook ? 4 : name === google ? 1 : index + 10, value: name
  }));
  const fixtureClient = service.clientFactory();
  service.clientFactory = () => ({ ...fixtureClient, exportCatalog: async (...args) => {
    const result = await fixtureClient.exportCatalog(...args);
    result.products = result.products.map((product) => ({ ...product,
      export_to_marketplace: exportedFeeds(product.export_to_marketplace),
      modifications: product.modifications.map((offer) => ({ ...offer,
        export_to_marketplace: exportedFeeds(offer.export_to_marketplace) }))
    }));
    return result;
  } });
  for (const product of remote) {
    for (const offer of product.modifications) {
      await pool.query('UPDATE search_horoshop_modifications SET source_data = $2::jsonb WHERE sku = $1',
        [offer.article, JSON.stringify({ ...offer, export_to_marketplace: exportedFeeds(offer.export_to_marketplace) })]);
    }
  }
  const catalog = (await agent.get(`${base}/catalog?brand=Apple`).expect(200)).body.data;
  assert.equal(catalog.items[0].google, 'mixed');
  assert.equal(catalog.items[0].facebook, 'mixed');
  const empty = (await agent.get(`${base}/catalog?brand=Samsung`).expect(200)).body.data;
  assert.equal(empty.items[0].google, 'disabled');
  const plan = await preview({ google: 'enable', facebook: 'disable' }, [productIds[0]]);
  assert.deepEqual(plan.items[0].before[1].marketplaces, [facebook, 'Hotline Feed'].sort());
  const result = await apply(plan);
  assert.equal(result.status, 'completed');
  assert.equal(result.counts.succeeded, 1);
  assert.deepEqual(imports.flat(), [{ article: 'PHONE-WHITE', export_to_marketplace: `${google};Hotline Feed` }]);
  assert.deepEqual(result.items[0].observed[1].marketplaces, [google, 'Hotline Feed'].sort());
  const history = (await agent.get(`${base}/operations`).expect(200)).body.data;
  assert.equal(history[0].confirmed, 1);
});

test('both channels can be enabled across a filtered selection and keep is independent', async () => {
  const plan = (await agent.post(`${base}/operations/preview`).send({
    selection: { filters: { brands: ['Samsung'] } }, action: { google: 'enable', facebook: 'enable' }
  }).expect(201)).body.data;
  assert.equal(plan.total, 1);
  assert.equal((await apply(plan)).status, 'completed');
  assert.deepEqual(marketplaceNames(remote[1].modifications[0].export_to_marketplace), [google, facebook].sort());
  const second = await preview({ google: 'disable', facebook: 'keep' }, [productIds[1]]);
  assert.equal((await apply(second)).status, 'completed');
  assert.deepEqual(marketplaceNames(remote[1].modifications[0].export_to_marketplace), [facebook]);
});

test('removing the last selected feed sends an explicit empty string and verifies it', async () => {
  remote[1].modifications[0].export_to_marketplace = google;
  await pool.query('UPDATE search_horoshop_modifications SET source_data = $2::jsonb WHERE product_id = $1',
    [productIds[1], JSON.stringify(remote[1].modifications[0])]);
  const plan = await preview({ google: 'disable', facebook: 'disable' }, [productIds[1]]);
  const result = await apply(plan);
  assert.equal(result.status, 'completed');
  assert.deepEqual(imports.flat(), [{ article: 'HEADSET-1', export_to_marketplace: '' }]);
});

test('a remote marketplace edit blocks every new write, including unrelated marketplaces', async () => {
  const plan = await preview();
  remote[0].modifications[0].export_to_marketplace += ';Other Feed';
  const result = await apply(plan);
  assert.equal(result.status, 'conflict');
  assert.equal(result.counts.conflict, 1);
  assert.equal(result.counts.cancelled, 1);
  assert.equal(imports.length, 0);
});

test('unknown catalog values remain reviewable but unreadable remote values block every import and appear in history', async () => {
  await pool.query('UPDATE search_horoshop_modifications SET source_data = $2::jsonb WHERE product_id = $1',
    [productIds[0], JSON.stringify({ export_to_marketplace: null })]);
  delete remote[0].export_to_marketplace;
  delete remote[0].modifications[0].export_to_marketplace;
  const plan = await preview();
  assert.equal(plan.items.find((item) => item.productId === productIds[0]).before[0].marketplaces, null);
  assert.equal(apiCalls, 0);
  const result = await apply(plan);
  assert.equal(result.status, 'failed');
  assert.match(result.errorMessage, /не надав поточні налаштування/u);
  assert.equal(imports.length, 0);
  const history = (await agent.get(`${base}/operations`).expect(200)).body.data;
  assert.equal(history[0].id, plan.id);
  assert.equal(history[0].status, 'failed');
  assert.equal(history[0].confirmed, 0);
  assert.equal(history[0].problems, 1);
});

test('unknown cache values are resolved before import, retained separately, and preserve other channels', async () => {
  await pool.query('UPDATE search_horoshop_modifications SET source_data = $2::jsonb WHERE product_id = $1',
    [productIds[0], JSON.stringify({ export_to_marketplace: null })]);
  const plan = await preview({ google: 'enable', facebook: 'disable' }, [productIds[0]]);
  assert.ok(plan.items[0].before.every((offer) => offer.marketplaces === null));
  assert.equal(plan.items[0].resolvedBefore, null);
  const result = await apply(plan);
  assert.equal(result.status, 'completed');
  assert.ok(result.items[0].before.every((offer) => offer.marketplaces === null), 'the reviewed snapshot is immutable');
  assert.deepEqual(result.items[0].resolvedBefore[0].marketplaces, [google, 'Rozetka Feed'].sort());
  assert.deepEqual(result.items[0].resolvedTarget[1].marketplaces, [google, 'Hotline Feed'].sort());
  assert.deepEqual(marketplaceNames(remote[0].modifications[1].export_to_marketplace), [google, 'Hotline Feed'].sort());
});

test('unknown offers cannot bypass a conflict in another known offer of the same product', async () => {
  await pool.query('UPDATE search_horoshop_modifications SET source_data = $2::jsonb WHERE product_id = $1 AND sku = $3',
    [productIds[0], JSON.stringify({ export_to_marketplace: null }), 'PHONE-WHITE']);
  const plan = await preview({ google: 'enable', facebook: 'disable' }, [productIds[0]]);
  remote[0].modifications[0].export_to_marketplace += ';Other Feed';
  assert.equal((await apply(plan)).status, 'conflict');
  assert.equal(imports.length, 0);
});

test('recovery uses persisted resolved snapshots after writing an initially unknown product', async () => {
  await pool.query('UPDATE search_horoshop_modifications SET source_data = $2::jsonb WHERE product_id = $1',
    [productIds[0], JSON.stringify({ export_to_marketplace: null })]);
  const plan = await preview({ google: 'enable', facebook: 'disable' }, [productIds[0]]);
  const before = remote[0].modifications.map((offer) => ({ article: offer.article, marketplaces: marketplaceNames(offer.export_to_marketplace) }));
  const target = before.map((offer) => ({ article: offer.article, marketplaces: [...new Set([...offer.marketplaces.filter((name) => name !== facebook), google])].sort() }));
  await service.repository.resolveItem(plan.items[0].id, before, target);
  await pool.query("UPDATE search_horoshop_feed_operations SET status = 'running' WHERE id = $1", [plan.id]);
  await pool.query("UPDATE search_horoshop_feed_operation_items SET status = 'writing' WHERE operation_id = $1", [plan.id]);
  for (const offer of remote[0].modifications) offer.export_to_marketplace = target.find((item) => item.article === offer.article).marketplaces.join(';');
  await service.runNext();
  const result = await completed(plan.id);
  assert.equal(result.status, 'completed');
  assert.equal(result.counts.succeeded, 1);
  assert.equal(imports.length, 0);
});

test('changed membership blocks apply and a failed import is never marked successful', async () => {
  const plan = await preview();
  remote[0].modifications.push({ article: 'PHONE-NEW', export_to_marketplace: '' });
  assert.equal((await apply(plan)).status, 'conflict');
  remote[0].modifications.pop();
  const next = await preview();
  skipWrite = true;
  const result = await apply(next);
  assert.equal(result.status, 'partial');
  assert.equal(result.counts.failed, 2);
});

test('lost import response is resolved by read-back without retrying the write', async () => {
  throwAfterWrite = true;
  const result = await apply(await preview());
  assert.equal(result.status, 'completed');
  assert.equal(imports.length, 1);
});

test('restart recovery confirms an already written snapshot without a second import', async () => {
  const plan = await preview({ google: 'enable', facebook: 'keep' }, [productIds[1]]);
  await pool.query("UPDATE search_horoshop_feed_operations SET status = 'running' WHERE id = $1", [plan.id]);
  await pool.query("UPDATE search_horoshop_feed_operation_items SET status = 'writing' WHERE operation_id = $1", [plan.id]);
  remote[1].modifications[0].export_to_marketplace = google;
  await service.runNext();
  const result = await completed(plan.id);
  assert.equal(result.status, 'completed');
  assert.equal(result.counts.succeeded, 1);
  assert.equal(imports.length, 0);
});

test('an already configured selection completes without issuing an import', async () => {
  const result = await apply(await preview({ google: 'disable', facebook: 'disable' }, [productIds[1]]));
  assert.equal(result.status, 'completed');
  assert.equal(result.counts.unchanged, 1);
  assert.equal(imports.length, 0);
});

test('restart recovery refuses to replay a partially written product', async () => {
  const plan = await preview({ google: 'disable', facebook: 'disable' }, [productIds[0]]);
  await pool.query("UPDATE search_horoshop_feed_operations SET status = 'running' WHERE id = $1", [plan.id]);
  await pool.query("UPDATE search_horoshop_feed_operation_items SET status = 'writing' WHERE operation_id = $1", [plan.id]);
  remote[0].modifications[0].export_to_marketplace = 'Rozetka Feed';
  await service.runNext();
  const result = await completed(plan.id);
  assert.equal(result.status, 'conflict');
  assert.equal(result.counts.conflict, 1);
  assert.equal(imports.length, 0);
});

test('repeated export pages fail the confirmed operation without writing', async () => {
  service.clientFactory = () => ({ authenticate: async () => 'fixture-token', exportCatalog: async (_token, offset) => ({ products: structuredClone(remote), nextOffset: offset + 500 }) });
  const result = await apply(await preview());
  assert.equal(result.status, 'failed');
  assert.equal(imports.length, 0);
});

test('select-all returns the exact filtered IDs and respects a pasted-list scope', async () => {
  const selected = (await agent.post(`${base}/select`).send({ filters: { brands: ['Apple'] } }).expect(200)).body.data;
  assert.deepEqual(selected.productIds, [productIds[0]]);
  const scoped = (await agent.post(`${base}/select`).send({ filters: {}, productIds: [productIds[1]] }).expect(200)).body.data;
  assert.deepEqual(scoped.productIds, [productIds[1]]);
});

test('feed filters share the displayed modification states across catalog, scoped selection, select-all and preview', async () => {
  const filtered = (await agent.get(`${base}/catalog?google=mixed&facebook=mixed&brand=Apple`).expect(200)).body.data;
  assert.equal(filtered.total, 1);
  assert.deepEqual(filtered.items.map((item) => item.id), [productIds[0]]);
  assert.equal(filtered.items[0].google, 'mixed');
  assert.equal((await agent.get(`${base}/catalog?google=enabled`).expect(200)).body.data.total, 0);
  const scoped = (await agent.post(`${base}/catalog/selection`).send({ productIds,
    filters: { facebook: 'disabled' } }).expect(200)).body.data;
  assert.deepEqual(scoped.matchingProductIds, [productIds[1]]);
  const selected = (await agent.post(`${base}/select`).send({ filters: { google: 'mixed', facebook: 'mixed' } }).expect(200)).body.data;
  assert.deepEqual(selected.productIds, [productIds[0]]);
  const outsideScope = (await agent.post(`${base}/select`).send({ productIds: [productIds[1]],
    filters: { google: 'mixed' } }).expect(200)).body.data;
  assert.deepEqual(outsideScope.productIds, []);
  const plan = (await agent.post(`${base}/operations/preview`).send({
    selection: { filters: { google: 'mixed', facebook: 'mixed' } }, action: { google: 'enable', facebook: 'keep' }
  }).expect(201)).body.data;
  assert.deepEqual(plan.items.map((item) => item.productId), [productIds[0]]);
  const connection = await service.repository.connection();
  assert.deepEqual(await service.repository.matchingIds(connection, { google: 'mixed' }, null, 1), [productIds[0]]);
  assert.equal(apiCalls, 0);
});

test('feed filtering respects inherited values, explicit unknowns and inactive modifications', async () => {
  await pool.query('UPDATE search_horoshop_modifications SET source_data = $2::jsonb WHERE product_id = $1',
    [productIds[0], JSON.stringify({})]);
  await pool.query('UPDATE search_horoshop_modifications SET active = FALSE, source_data = $2::jsonb WHERE sku = $1',
    ['PHONE-WHITE', JSON.stringify({ export_to_marketplace: facebook })]);
  await pool.query('UPDATE search_horoshop_modifications SET source_data = $2::jsonb WHERE product_id = $1',
    [productIds[1], JSON.stringify({ export_to_marketplace: null })]);
  const known = (await agent.get(`${base}/catalog?google=enabled&facebook=disabled`).expect(200)).body.data;
  assert.deepEqual(known.items.map((item) => item.id), [productIds[0]]);
  assert.equal(known.items[0].google, 'enabled');
  const unknown = (await agent.get(`${base}/catalog?google=unknown&facebook=unknown`).expect(200)).body.data;
  assert.deepEqual(unknown.items.map((item) => item.id), [productIds[1]]);
  assert.equal(unknown.items[0].facebook, 'unknown');
  assert.equal((await agent.get(`${base}/catalog?google=disabled`).expect(200)).body.data.total, 0);
});

test('feed filtering runs before pagination and selection limits, including products without modifications', async () => {
  const connection = await service.repository.connection();
  const expected = [];
  for (let index = 0; index < 22; index += 1) {
    const id = randomUUID();
    if (index % 2 === 0) expected.push(id);
    await pool.query(`INSERT INTO search_horoshop_products
      (id, connection_id, generation, external_id, sku, titles, source_data, last_seen_sync_id)
      VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, $6::jsonb, $7)`,
    [id, connection.id, connection.generation, `filter-${index}`, `FILTER-${String(index).padStart(2, '0')}`,
      JSON.stringify({ export_to_marketplace: index % 2 ? [] : [{ id: 1, value: google }] }), randomUUID()]);
  }
  const second = (await agent.get(`${base}/catalog?google=enabled&facebook=disabled&pageSize=10&page=2`).expect(200)).body.data;
  assert.equal(second.total, 11);
  assert.equal(second.pageCount, 2);
  assert.deepEqual(second.items.map((item) => item.id), expected.slice(10));
  const selected = (await agent.post(`${base}/select`).send({ filters: { google: 'enabled', facebook: 'disabled' } }).expect(200)).body.data;
  assert.deepEqual(selected.productIds, expected);
  assert.deepEqual(await service.repository.matchingIds(connection, { google: 'enabled' }, null, 1), expected.slice(0, 1));
});

test('feed status validation rejects unsupported values on every filter input', async () => {
  for (const channel of ['google', 'facebook']) {
    await agent.get(`${base}/catalog?${channel}=invalid`).expect(422);
    await agent.post(`${base}/select`).send({ filters: { [channel]: 'invalid' } }).expect(422);
    await agent.post(`${base}/catalog/selection`).send({ productIds, filters: { [channel]: 'invalid' } }).expect(422);
    await agent.post(`${base}/operations/preview`).send({ selection: { filters: { [channel]: 'invalid' } },
      action: { google: 'enable', facebook: 'keep' } }).expect(422);
  }
});

test('history and operation details remain readable during catalog synchronization', async () => {
  const plan = await preview();
  await apply(plan);
  await pool.query("UPDATE search_horoshop_connections SET status = 'syncing'");
  await agent.get(`${base}/operations/${plan.id}`).expect(200);
  assert.equal((await agent.get(`${base}/operations`).expect(200)).body.data[0].id, plan.id);
  await agent.post(`${base}/operations/preview`).send({ selection: { productIds }, action: { google: 'enable', facebook: 'keep' } }).expect(409);
});

test('feed export explicitly requests marketplace data through the real client serializer', async () => {
  const { HoroshopClient } = await import('../src/modules/search/horoshop/horoshop.client.js');
  const client = new HoroshopClient('fixture.example.com', { fetchImplementation: async (_url, init) => {
    assert.deepEqual(JSON.parse(init.body), { token: 'fixture', offset: 0, limit: 500, includedParams: ['export_to_marketplace'] });
    return new Response(JSON.stringify({ status: 'OK', response: { products: [{ article: 'P', parent_article: 'P', export_to_marketplace: '' }] } }));
  } });
  const result = await client.exportCatalog('fixture', 0, 500, null, { includedParams: ['export_to_marketplace'] });
  assert.equal(result.products[0].export_to_marketplace, '');
});

test('stale previews, double apply and connection replacement are rejected', async () => {
  const plan = await preview();
  await apply(plan);
  await agent.post(`${base}/operations/${plan.id}/apply`).expect(409);
  const expired = await preview();
  await pool.query('UPDATE search_horoshop_feed_operations SET created_at = $2 WHERE id = $1', [expired.id, new Date(Date.now() - 7200_000)]);
  await agent.post(`${base}/operations/${expired.id}/apply`).expect(409);
  await pool.query('UPDATE search_horoshop_connections SET generation = $1', [randomUUID()]);
  await agent.get(`${base}/operations/${plan.id}`).expect(404);
});

test('validation rejects arbitrary marketplaces, malformed IDs and empty actions', async () => {
  for (const action of [{ google: 'keep', facebook: 'keep' }, { google: 'enable', facebook: 'keep', other: 'enable' }, { google: 'delete', facebook: 'keep' }]) {
    await agent.post(`${base}/operations/preview`).send({ selection: { productIds }, action }).expect(422);
  }
  await agent.post(`${base}/operations/preview`).send({ selection: { productIds: [] }, action: { google: 'enable', facebook: 'keep' } }).expect(422);
  await agent.get(`${base}/operations/not-a-uuid`).expect(422);
  await request(app).get(`${base}/catalog`).expect(401);
  assert.equal(imports.length, 0);
});

test('new tool honors server permissions and the configured two-factor requirement', async () => {
  const admin = (await pool.query('SELECT id FROM users WHERE email = $1', [process.env.ADMIN_EMAIL])).rows[0];
  const editorId = randomUUID();
  await pool.query(`INSERT INTO users (id, name, email, password_hash, role, status)
    SELECT $1, 'Feed Editor', 'feed-editor@test.local', password_hash, 'editor', 'approved' FROM users WHERE id = $2`, [editorId, admin.id]);
  const editor = request.agent(app);
  await editor.post('/api/auth/login').send({ email: 'feed-editor@test.local', password: process.env.ADMIN_PASSWORD }).expect(200);
  await editor.get(`${base}/catalog`).expect(403);
  await pool.query("INSERT INTO user_tool_access (user_id, tool_id) VALUES ($1, 'horoshop_feeds')", [editorId]);
  await editor.get(`${base}/catalog`).expect(200);
  await pool.query("UPDATE tool_security_requirements SET requires_two_factor = TRUE WHERE tool_id = 'horoshop_feeds'");
  try {
    const blocked = await editor.get(`${base}/catalog`).expect(403);
    assert.equal(blocked.body.error.code, 'TOOL_2FA_REQUIRED');
  } finally {
    await pool.query("UPDATE tool_security_requirements SET requires_two_factor = FALSE WHERE tool_id = 'horoshop_feeds'");
  }
});

test('normalization supports flat/nested exports and explicit emptiness without guessing unknown values', () => {
  assert.equal(marketplaceNames(undefined), null);
  assert.equal(marketplaceNames(null), null);
  assert.equal(marketplaceNames([1]), null);
  assert.deepEqual(marketplaceNames(''), []);
  assert.deepEqual(marketplaceNames([{ title: google }, { name: facebook }]), [google, facebook].sort());
  assert.deepEqual(marketplaceNames([{ id: 4, value: facebook }]), [facebook]);
  assert.deepEqual(marketplaceNames([{ id: 1, value: google }, { id: 4, value: facebook }]), [google, facebook].sort());
  assert.deepEqual(marketplaceNames([]), []);
  assert.equal(marketplaceNames([{ id: 4 }]), null);
  assert.equal(marketplaceNames([{ id: 4, value: 4 }]), null);
  const groups = remoteFeedGroups([
    { parent_article: 'P', article: 'P-1', export_to_marketplace: google },
    { parent_article: 'P', article: 'P-2', export_to_marketplace: '' },
    { article: 'Q', export_to_marketplace: google, modifications: [{ article: 'Q-1' }] }
  ]);
  assert.equal(groups.get('P').invalid, false);
  assert.deepEqual(groups.get('Q').offers, [{ article: 'Q-1', marketplaces: [google] }]);
  assert.equal(remoteFeedGroups([{ article: 'P', modifications: [null] }]).get('P').invalid, true);
  assert.equal(remoteFeedGroups([{ article: 'P', modifications: [{ article: 'X', export_to_marketplace: '' }, { article: 'X', export_to_marketplace: '' }] }]).get('P').invalid, true);
  assert.equal(sameFeedSnapshot([{ article: 'X', marketplaces: [facebook, google] }], [{ article: 'X', marketplaces: [google, facebook] }]), true);
});
