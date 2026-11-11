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
  imports = []; skipWrite = false; throwAfterWrite = false;
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
    authenticate: async () => 'fixture-token',
    exportCatalog: async (_token, _offset, limit) => {
      assert.equal(limit, 500);
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

test('preview is read-only, uses fresh values, and preserves each variant other marketplaces', async () => {
  remote[0].modifications[0].export_to_marketplace += ';Prom Feed';
  const plan = await preview({ google: 'enable', facebook: 'disable' }, [productIds[0]]);
  assert.equal(plan.status, 'draft');
  assert.equal(imports.length, 0);
  assert.ok(plan.items[0].before[0].marketplaces.includes('Prom Feed'));
  const result = await apply(plan);
  assert.equal(result.status, 'completed');
  assert.deepEqual(marketplaceNames(remote[0].modifications[0].export_to_marketplace), [google, 'Prom Feed', 'Rozetka Feed'].sort());
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

test('unknown feed values and missing or duplicate modifications block preview', async () => {
  delete remote[0].export_to_marketplace;
  delete remote[0].modifications[0].export_to_marketplace;
  await agent.post(`${base}/operations/preview`).send({ selection: { productIds }, action: { google: 'enable', facebook: 'keep' } }).expect(409);
  remote[0].modifications[0].export_to_marketplace = '';
  remote[0].modifications.push({ article: 'PHONE-NEW', export_to_marketplace: '' });
  await agent.post(`${base}/operations/preview`).send({ selection: { productIds }, action: { google: 'enable', facebook: 'keep' } }).expect(409);
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

test('repeated export pages cannot create a preview', async () => {
  service.clientFactory = () => ({ authenticate: async () => 'fixture-token', exportCatalog: async (_token, offset) => ({ products: structuredClone(remote), nextOffset: offset + 500 }) });
  const response = await agent.post(`${base}/operations/preview`).send({ selection: { productIds }, action: { google: 'enable', facebook: 'keep' } }).expect(502);
  assert.equal(response.body.error.code, 'HOROSHOP_FEEDS_EXPORT_INVALID');
  assert.equal(imports.length, 0);
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
