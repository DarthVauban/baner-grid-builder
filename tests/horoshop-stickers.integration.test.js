import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://horoshop-stickers-tests';
process.env.JWT_SECRET = 'sticker-test-secret-01234567890123456789';
process.env.COOKIE_SECURE = 'false';
process.env.ADMIN_NAME = 'Sticker Admin';
process.env.ADMIN_EMAIL = 'sticker-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');
const { encryptHoroshopCredentials } = await import('../src/modules/search/horoshop/credential-cipher.js');
const { horoshopStickerService: service, tuneStickerImportBatch } = await import('../src/modules/search/horoshop/sticker.service.js');
const { HoroshopApiError } = await import('../src/modules/search/horoshop/horoshop.client.js');
const { applyStickerChange, assertManualActions, filterStickerProducts, manualStickerDirectory, remoteStickerSnapshot } = await import('../src/modules/search/horoshop/sticker.domain.js');
const admin = request.agent(app);
const base = '/api/search/horoshop/stickers';
let connection;
let generation;
let productIds;
let remoteProducts;
let imports;
let importMode;
let directory;

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  await admin.post('/api/auth/login').send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }).expect(200);
});
after(async () => { await pool.end(); });
beforeEach(async () => {
  await pool.query('DELETE FROM search_horoshop_connections');
  connection = randomUUID(); generation = randomUUID(); productIds = [randomUUID(), randomUUID()];
  imports = []; importMode = 'normal';
  service.batchSize = 25;
  service.scopedExportCapability = null;
  directory = [{ id: 1, title: 'Хіт', enabled: 1 }, { id: 11, title: 'Акція', enabled: 1 }, { id: 3, title: 'Гарантія', enabled: 1 }, { id: 8, title: 'Автоматичний', enabled: 1 }, { id: 19, title: 'Вимкнений', enabled: 0 }];
  remoteProducts = [
    { id: 101, article: 'P1', title: { ua: 'Телефон' }, icons: ['Хіт', 'Гарантія'], modifications: [{ article: '0001', icons: ['Хіт', 'Гарантія'] }, { article: '0002', icons: ['Хіт', 'Гарантія'] }] },
    { id: 102, article: 'P2', title: { ua: 'Навушники' }, icons: [], modifications: [{ article: '0003', icons: [] }] }
  ];
  await pool.query(`INSERT INTO search_horoshop_connections (id, generation, store_domain, encrypted_credentials, status, last_sync_at)
    VALUES ($1, $2, 'shop.example.com', $3, 'connected', NOW())`, [connection, generation, encryptHoroshopCredentials({ login: 'fixture', password: 'fixture' })]);
  const syncId = randomUUID();
  for (const sticker of directory) await pool.query(`INSERT INTO search_horoshop_stickers (connection_id, generation, external_id, title, enabled, last_seen_sync_id)
    VALUES ($1, $2, $3, $4, $5, $6)`, [connection, generation, String(sticker.id), sticker.title, !!sticker.enabled, syncId]);
  for (let i = 0; i < productIds.length; i += 1) {
    const product = remoteProducts[i];
    const stickers = product.icons.map((title) => ({ id: String(directory.find((d) => d.title === title).id), title }));
    await pool.query(`INSERT INTO search_horoshop_products (id, connection_id, generation, external_id, sku, titles, brand, price, availability, stickers, source_data, last_seen_sync_id)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'Apple', '100', 'В наявності', $7::jsonb, $8::jsonb, $9)`, [productIds[i], connection, generation, String(product.id), product.article, JSON.stringify({ uk: product.title.ua }), JSON.stringify(stickers), JSON.stringify(product), syncId]);
    for (const modification of product.modifications) await pool.query(`INSERT INTO search_horoshop_modifications
      (connection_id, generation, product_id, external_id, sku, titles, price, availability, stickers, source_data, last_seen_sync_id)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, '120', 'В наявності', $7::jsonb, $8::jsonb, $9)`, [connection, generation, productIds[i], `${product.id}:${modification.article}`, modification.article, JSON.stringify({ uk: product.title.ua }), JSON.stringify(stickers), JSON.stringify(modification), syncId]);
  }
  service.clientFactory = () => ({
    authenticate: async () => 'fixture-token',
    exportStickers: async () => structuredClone(directory),
    exportCatalog: async (_token, _offset, limit) => {
      assert.equal(limit, 500);
      return { products: structuredClone(remoteProducts), nextOffset: null };
    },
    importCatalog: async (_token, payloads, options) => {
      imports.push({ payloads: structuredClone(payloads), options });
      if (importMode === 'no-write') return { imported: 0 };
      for (const payload of payloads) {
        if (importMode === 'partial' && payload.article === '0003') continue;
        if (importMode === 'partial-offer' && payload.article === '0002') continue;
        const group = remoteProducts.find((p) => p.article === payload.article || p.modifications.some((m) => m.article === payload.article));
        const offer = group.modifications.find((m) => m.article === payload.article);
        if (offer) offer.icons = [...payload.icons];
        if (group.modifications.every((m) => JSON.stringify(m.icons) === JSON.stringify(payload.icons))) group.icons = [...payload.icons];
      }
      if (importMode === 'timeout-after-write') throw new Error('fixture transport timeout');
      return { imported: payloads.length };
    }
  });
});

async function preview(ids = productIds, addIds = ['11'], removeIds = ['1']) {
  const response = await admin.post(`${base}/operations/preview`).send({ name: 'Тестова акція', productIds: ids, addIds, removeIds }).expect(201);
  return response.body.data;
}
async function apply(operation) {
  await admin.post(`${base}/operations/${operation.id}/apply`).expect(202);
  await service.runNext();
  return (await admin.get(`${base}/operations/${operation.id}`).expect(200)).body.data;
}

const streamEvents = (text) => text.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line));

function pagedStickerExport(scopedResponse = (articles) => remoteProducts.filter((product) => articles.includes(product.article))) {
  const requests = [];
  const factory = service.clientFactory;
  service.clientFactory = (...args) => {
    const client = factory(...args);
    return { ...client, exportCatalog: async (_token, offset, limit, articles) => {
      assert.equal(limit, 500);
      requests.push({ offset, articles });
      if (articles) return { products: structuredClone(scopedResponse(articles)), nextOffset: null };
      return offset === 0
        ? { products: structuredClone([remoteProducts[0]]), nextOffset: 500 }
        : { products: structuredClone([remoteProducts[1]]), nextOffset: null };
    } };
  };
  return requests;
}

test('complete parent-article export is probed once, then verifies the write with one scoped request', async () => {
  const requests = pagedStickerExport();
  const completed = await apply(await preview([productIds[0]]));
  assert.equal(completed.counts.succeeded, 1);
  assert.deepEqual(requests.map((call) => call.articles), [null, null, ['P1'], ['P1']]);
  const event = await pool.query(`SELECT details FROM search_horoshop_sticker_events
    WHERE operation_id = $1 AND action = 'operation_finished'`, [completed.id]);
  const details = typeof event.rows[0].details === 'string' ? JSON.parse(event.rows[0].details) : event.rows[0].details;
  assert.equal(details.apiOperations.catalogExports, 4);
});

test('a multi-offer product elsewhere in the full catalog can verify scoped reads for a single-offer selection', async () => {
  const requests = pagedStickerExport();
  const completed = await apply(await preview([productIds[1]], ['11'], []));
  assert.equal(completed.counts.succeeded, 1);
  assert.deepEqual(requests.map((call) => call.articles), [null, null, ['P1'], ['P2']]);
});

test('verified scoped export batches selected parent articles in one request', async () => {
  const requests = pagedStickerExport();
  service.scopedExportCapability = {
    key: `${connection}:${generation}`, supported: true, fullPages: 2, expiresAt: Date.now() + 60_000
  };
  const completed = await apply(await preview(productIds, ['11'], []));
  assert.equal(completed.counts.succeeded, 2);
  assert.deepEqual(requests.map((call) => call.articles), [['P1', 'P2'], ['P1', 'P2']]);
});

test('import batch size recovers conservatively after fast responses and shrinks after slow or limited responses', () => {
  let state = { size: 25, fastCount: 0 };
  state = tuneStickerImportBatch(state, 9_000);
  assert.equal(state.size, 20);
  for (let count = 0; count < 3; count += 1) state = tuneStickerImportBatch(state, 900);
  assert.equal(state.size, 25);
  state = tuneStickerImportBatch(state, 100, new HoroshopApiError('api_rejected', 429));
  assert.equal(state.size, 10);
  for (let count = 0; count < 3; count += 1) state = tuneStickerImportBatch(state, 900);
  assert.equal(state.size, 15);
});

test('a filtered export without the complete modification group stays on full catalog reads', async () => {
  const requests = pagedStickerExport(() => [{ id: 101, parent_article: 'P1', article: '0001', icons: ['Хіт', 'Гарантія'] }]);
  const completed = await apply(await preview([productIds[0]]));
  assert.equal(completed.counts.succeeded, 1);
  assert.deepEqual(requests.map((call) => call.articles), [null, null, ['P1'], null, null]);
  assert.equal(service.scopedExportCapability.supported, false);
});

test('an incomplete scoped read falls back to the full export before confirming success', async () => {
  let filteredReads = 0;
  const requests = pagedStickerExport((articles) => {
    filteredReads += 1;
    const group = structuredClone(remoteProducts.find((product) => product.article === articles[0]));
    if (filteredReads === 2) group.modifications.pop();
    return [group];
  });
  const completed = await apply(await preview([productIds[0]]));
  assert.equal(completed.counts.succeeded, 1);
  assert.deepEqual(requests.map((call) => call.articles), [null, null, ['P1'], ['P1'], null, null]);
  assert.equal(service.scopedExportCapability.supported, false);
});

test('rate limiting on a scoped read does not launch a full export', async () => {
  let filteredReads = 0;
  const requests = pagedStickerExport((articles) => {
    filteredReads += 1;
    if (filteredReads === 2) throw new HoroshopApiError('api_rejected', 429);
    return remoteProducts.filter((product) => articles.includes(product.article));
  });
  const completed = await apply(await preview([productIds[0]]));
  assert.equal(completed.counts.failed, 1);
  assert.deepEqual(requests.map((call) => call.articles), [null, null, ['P1'], ['P1']]);
});

test('a changed modification set in scoped read is confirmed by a full export and blocks success', async () => {
  const requests = pagedStickerExport();
  const factory = service.clientFactory;
  service.clientFactory = (...args) => {
    const client = factory(...args);
    return { ...client, importCatalog: async (...params) => {
      const result = await client.importCatalog(...params);
      remoteProducts[0].modifications.push({ article: '0004', icons: ['Акція', 'Гарантія'] });
      return result;
    } };
  };
  const completed = await apply(await preview([productIds[0]]));
  assert.equal(completed.counts.failed, 1);
  assert.deepEqual(requests.map((call) => call.articles), [null, null, ['P1'], ['P1'], null, null]);
  assert.equal(service.scopedExportCapability.supported, false);
});

test('preparation streams cached catalog progress without calling Horoshop and creates a reviewable draft', async () => {
  service.clientFactory = () => { throw new Error('Preview must only read the synchronized catalog'); };
  let sawProgressBeforeResult = false;
  const response = await admin.post(`${base}/operations/preview/stream`).send({ productIds, addIds: ['11'], removeIds: ['1'] })
    .buffer(true).parse((res, callback) => {
      let text = '';
      res.on('data', (chunk) => {
        text += chunk.toString();
        if (text.includes('"stage":"comparing"') && !sawProgressBeforeResult) {
          sawProgressBeforeResult = true;
          assert.equal(imports.length, 0);
        }
      });
      res.on('end', () => callback(null, streamEvents(text)));
      res.on('error', callback);
    }).timeout({ response: 5000, deadline: 10_000 }).expect(200);
  assert.equal(sawProgressBeforeResult, true);
  assert.match(response.headers['content-type'], /application\/x-ndjson/u);
  assert.equal(response.headers['x-accel-buffering'], 'no');
  assert.match(response.headers['cache-control'], /no-store/u);
  const progress = response.body.filter((event) => event.type === 'progress').map((event) => event.data);
  assert.deepEqual([...new Set(progress.map((item) => item.stage))], ['checking', 'comparing', 'saving']);
  assert.equal(progress.at(-1).processed, 2);
  assert.equal(progress.at(-1).total, 2);
  const operation = response.body.at(-1).data;
  assert.equal(response.body.at(-1).type, 'result');
  assert.equal(operation.status, 'draft');
  assert.equal((await admin.get(`${base}/operations/${operation.id}`).expect(200)).body.data.total, 2);
  assert.equal(imports.length, 0);
  assert.equal(/fixture-token|password|encrypted|source_data/u.test(JSON.stringify(response.body)), false);
});

test('several sticker selections share one verification cycle and overlapping actions use the final state', async () => {
  let exports = 0;
  const clientFactory = service.clientFactory;
  service.clientFactory = (...args) => {
    const client = clientFactory(...args);
    return { ...client, exportCatalog: async (...params) => {
      exports += 1;
      return client.exportCatalog(...params);
    } };
  };
  const response = await admin.post(`${base}/operations/preview`).send({ name: 'Спільна зміна', steps: [
    { productIds: [productIds[0]], addIds: ['11'], removeIds: ['1'] },
    { productIds: [productIds[1]], addIds: ['11'], removeIds: [] },
    { productIds: [productIds[0]], addIds: ['1'], removeIds: ['11'] }
  ] }).expect(201);
  assert.equal(response.body.data.total, 2);
  assert.equal(response.body.data.counts.unchanged, 1);
  assert.equal(response.body.data.counts.pending, 1);
  const completed = await apply(response.body.data);
  assert.equal(completed.counts.succeeded, 1);
  assert.equal(exports, 2);
  assert.deepEqual(imports.flatMap((entry) => entry.payloads.map((item) => item.article)), ['0003']);
  const event = await pool.query(`SELECT details FROM search_horoshop_sticker_events
    WHERE operation_id = $1 AND action = 'operation_finished'`, [completed.id]);
  const details = typeof event.rows[0].details === 'string' ? JSON.parse(event.rows[0].details) : event.rows[0].details;
  assert.deepEqual(details.apiOperations, { catalogExports: 2, stickerExports: 2, authentications: 2, imports: 1 });
  assert.equal(details.importMetrics.articles, 1);
  assert.equal(details.importMetrics.batches, 1);
});

test('stream preparation validates access and input, reports errors and permits retry', async () => {
  await request(app).post(`${base}/operations/preview/stream`).send({ productIds, addIds: ['11'], removeIds: [] }).expect(401);
  await admin.post(`${base}/operations/preview/stream`).send({ productIds: ['invalid'], addIds: [], removeIds: [] }).expect(422);
  const failed = await admin.post(`${base}/operations/preview/stream`).send({ productIds, addIds: ['8'], removeIds: [] }).expect(200);
  const events = streamEvents(failed.text);
  assert.equal(events.at(-1).type, 'error');
  assert.equal(events.at(-1).status, 409);
  assert.equal(events.some((event) => event.type === 'result'), false);
  assert.deepEqual((await admin.get(`${base}/operations`).expect(200)).body.data, []);
  const valid = await admin.post(`${base}/operations/preview/stream`).send({ productIds, addIds: ['11'], removeIds: [] }).expect(200);
  assert.equal(streamEvents(valid.text).at(-1).data.status, 'draft');
  assert.equal(imports.length, 0);
});

test('rollback preparation streams progress and still requires explicitly applying the reverse draft', async () => {
  const original = await apply(await preview());
  const writes = imports.length;
  const response = await admin.post(`${base}/operations/${original.id}/rollback/stream`).expect(200);
  const events = streamEvents(response.text);
  assert.ok(events.some((event) => event.type === 'progress' && event.data.stage === 'catalog'));
  assert.equal(events.at(-1).data.status, 'draft');
  assert.equal(events.at(-1).data.kind, 'rollback');
  assert.equal(events.at(-1).data.parentId, original.id);
  assert.equal(imports.length, writes);
});

test('catalog, exact article resolution and saved selection expose no credentials and keep leading zeros', async () => {
  await request(app).get(`${base}/catalog`).expect(401);
  const response = await admin.get(`${base}/catalog?stickerMode=present&stickerId=1`).expect(200);
  assert.equal(response.body.data.total, 1);
  assert.match(response.headers['cache-control'], /no-store/u);
  assert.equal(response.body.data.directory.some((s) => s.externalId === '8'), false);
  assert.deepEqual(response.body.data.directory.map((s) => s.externalId).sort(), ['1', '11', '19', '3']);
  assert.equal('canConfigure' in response.body.data, false);
  assert.equal(/encrypted|password|token|source_data/u.test(JSON.stringify(response.body)), false);
  const resolution = await admin.post(`${base}/resolve`).send({ entries: ['0001', '0002', '0001', 'missing'] }).expect(200);
  assert.deepEqual(resolution.body.data.productIds, [productIds[0]]);
  assert.equal(resolution.body.data.duplicates, 2);
  assert.deepEqual(resolution.body.data.unmatched, ['missing']);
  const selected = await admin.post(`${base}/select`).send({ brand: 'Apple' }).expect(200);
  assert.equal(selected.body.data.productIds.length, 2);
  const saved = await admin.post(`${base}/selections`).send({ name: 'Телефони', productIds: [productIds[0]] }).expect(201);
  assert.deepEqual(saved.body.data[0].productIds, [productIds[0]]);
  await admin.delete(`${base}/selections/${saved.body.data[0].id}`).expect(200);
  assert.deepEqual((await admin.get(`${base}/selections`).expect(200)).body.data, []);
  await admin.get(`${base}/catalog?priceMin=200&priceMax=100`).expect(422);
  await admin.get(`${base}/catalog?createdFrom=2026-02-31`).expect(422);
});

test('unfiltered catalog paginates products in SQL and loads modifications only for that page', async () => {
  const syncId = randomUUID();
  for (let index = 0; index < 12; index += 1) {
    await pool.query(`INSERT INTO search_horoshop_products
      (id, connection_id, generation, external_id, sku, titles, brand, stickers, source_data, last_seen_sync_id)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'Other', '[]'::jsonb, '{}'::jsonb, $7)`,
    [randomUUID(), connection, generation, `extra-${index}`, `Z-${String(index).padStart(2, '0')}`, JSON.stringify({ uk: `Додатковий ${index}` }), syncId]);
  }
  const queries = [];
  const original = pool.query;
  pool.query = function (...args) { queries.push(String(args[0])); return original.apply(this, args); };
  try {
    const page = (await admin.get(`${base}/catalog?page=2&pageSize=10`).expect(200)).body.data;
    assert.equal(page.total, 14);
    assert.equal(page.items.length, 4);
    assert.deepEqual(page.brands, ['Apple', 'Other']);
    assert.ok(page.items.every((item) => item.sku.startsWith('Z-')));
    assert.ok(queries.some((query) => /FROM search_horoshop_products[\s\S]*ORDER BY sku, id LIMIT \$3 OFFSET \$4/u.test(query)));
    assert.ok(queries.some((query) => /FROM search_horoshop_modifications[\s\S]*product_id IN/u.test(query)));
  } finally { pool.query = original; }
});

test('catalog SQL filters keep category descendants, offer availability and visibility semantics', async () => {
  const syncId = randomUUID();
  for (const [externalId, parentExternalId] of [['root', null], ['child', 'root']]) {
    await pool.query(`INSERT INTO search_horoshop_categories
      (connection_id, generation, external_id, parent_external_id, titles, last_seen_sync_id)
      VALUES ($1, $2, $3, $4, '{}'::jsonb, $5)`, [connection, generation, externalId, parentExternalId, syncId]);
  }
  await pool.query(`UPDATE search_horoshop_products SET category_external_id = 'child', visible = FALSE WHERE id = $1`, [productIds[0]]);
  await pool.query(`UPDATE search_horoshop_modifications SET availability = 'Очікується' WHERE product_id = $1`, [productIds[1]]);
  const category = (await admin.get(`${base}/catalog?category=root`).expect(200)).body.data;
  assert.deepEqual(category.items.map((item) => item.id), [productIds[0]]);
  const selected = (await admin.post(`${base}/select`).send({ category: 'root' }).expect(200)).body.data;
  assert.deepEqual(selected.productIds, [productIds[0]]);
  const direct = (await admin.get(`${base}/catalog?category=root&includeChildren=false`).expect(200)).body.data;
  assert.equal(direct.total, 0);
  const availability = (await admin.get(`${base}/catalog?availability=${encodeURIComponent('Очікується')}`).expect(200)).body.data;
  assert.deepEqual(availability.items.map((item) => item.id), [productIds[1]]);
  const hidden = (await admin.get(`${base}/catalog?visibility=hidden`).expect(200)).body.data;
  assert.deepEqual(hidden.items.map((item) => item.id), [productIds[0]]);
  await pool.query(`UPDATE search_horoshop_products SET horoshop_created_at = '2026-09-01T00:00:00Z' WHERE id = $1`, [productIds[0]]);
  await pool.query(`UPDATE search_horoshop_products SET horoshop_created_at = '2026-10-01T00:00:00Z' WHERE id = $1`, [productIds[1]]);
  const recent = (await admin.get(`${base}/catalog?createdFrom=2026-09-15`).expect(200)).body.data;
  assert.deepEqual(recent.items.map((item) => item.id), [productIds[1]]);
  const older = (await admin.get(`${base}/catalog?createdTo=2026-09-15`).expect(200)).body.data;
  assert.deepEqual(older.items.map((item) => item.id), [productIds[0]]);
});

test('operation detail counts all statuses while loading only the requested item page', async () => {
  const draft = await preview();
  const queries = [];
  const original = pool.query;
  pool.query = function (...args) { queries.push(String(args[0])); return original.apply(this, args); };
  try {
    const page = await service.detail(draft.id, 2, 1);
    assert.equal(page.total, 2);
    assert.equal(page.items.length, 1);
    assert.equal(page.pageCount, 2);
    assert.equal(page.counts.pending, 2);
    assert.ok(queries.some((query) => /search_horoshop_sticker_operation_items[\s\S]*LIMIT \$2 OFFSET \$3/u.test(query)));
    assert.ok(queries.some((query) => /COUNT\(\*\)::int AS count[\s\S]*GROUP BY status/u.test(query)));
  } finally { pool.query = original; }
});

test('selection summary and preview hydrate only selected product IDs', async () => {
  const queries = [];
  const original = pool.query;
  pool.query = function (...args) { queries.push(String(args[0])); return original.apply(this, args); };
  try {
    await admin.post(`${base}/selection/summary`).send({ productIds: [productIds[0]] }).expect(200);
    await preview([productIds[0]]);
    const productReads = queries.filter((query) => /SELECT[\s\S]*FROM search_horoshop_products/u.test(query));
    assert.ok(productReads.length >= 2);
    assert.ok(productReads.every((query) => /id IN \(/u.test(query)));
    assert.ok(queries.some((query) => /FROM search_horoshop_modifications[\s\S]*product_id IN \(/u.test(query)));
  } finally { pool.query = original; }
});

test('catalog recovers brand choices and filtering from previously synchronized raw brand objects', async () => {
  await pool.query(`UPDATE search_horoshop_products SET brand = NULL, source_data = $1::jsonb WHERE id = $2`, [JSON.stringify({ brand: { id: 7, title: { ua: 'Samsung' } } }), productIds[0]]);
  await pool.query(`UPDATE search_horoshop_products SET brand = NULL WHERE id = $1`, [productIds[1]]);
  await pool.query(`UPDATE search_horoshop_modifications SET source_data = $1::jsonb WHERE product_id = $2`, [JSON.stringify({ brand: { name: 'Apple' } }), productIds[1]]);
  const catalog = (await admin.get(`${base}/catalog`).expect(200)).body.data;
  assert.deepEqual(catalog.brands, ['Apple', 'Samsung']);
  assert.equal(catalog.items.find((p) => p.id === productIds[0]).brand, 'Samsung');
  assert.equal(JSON.stringify(catalog).includes('source_brand'), false);
  const filtered = (await admin.post(`${base}/select`).send({ brand: 'Samsung' }).expect(200)).body.data;
  assert.deepEqual(filtered.productIds, [productIds[0]]);
});

test('directory is fetched without a full catalog sync, cached and refreshed explicitly', async () => {
  await pool.query('DELETE FROM search_horoshop_stickers WHERE connection_id = $1', [connection]);
  let calls = 0;
  const factory = service.clientFactory;
  service.clientFactory = (...args) => {
    const client = factory(...args);
    const original = client.exportStickers;
    client.exportStickers = async (...input) => { calls += 1; return original(...input); };
    client.exportCatalog = () => { throw new Error('Directory loading must not export the full catalog'); };
    return client;
  };
  const first = (await admin.get(`${base}/catalog`).expect(200)).body.data;
  assert.equal(first.directory.length, directory.length - 1);
  assert.equal(first.directoryWarning, null);
  await admin.get(`${base}/catalog?search=Телефон`).expect(200);
  assert.equal(calls, 1);
  directory = directory.filter((item) => item.id !== 3);
  directory.push({ id: 12, title: 'Передзамовлення', enabled: 1 });
  await admin.post(`${base}/directory/refresh`).expect(200);
  const refreshed = (await admin.get(`${base}/catalog`).expect(200)).body.data;
  assert.equal(calls, 2);
  assert.equal(refreshed.directory.some((s) => s.externalId === '3'), false);
  assert.deepEqual(refreshed.directory.find((s) => s.externalId === '12'), { externalId: '12', title: 'Передзамовлення', enabled: true });
  assert.equal(imports.length, 0);
  const labels = (await admin.get('/api/horoshop-title-labels/settings').expect(200)).body.data;
  assert.ok(labels.stickerOptions.some((s) => s.id === '12'));
  service.clientFactory = factory;
  const operation = await preview([productIds[1]], ['12'], []);
  assert.deepEqual(operation.items[0].after, [{ id: '12', title: 'Передзамовлення' }]);
});

test('directory failures remain visible while the cached catalog and brands stay usable', async () => {
  service.clientFactory = () => ({ authenticate: async () => { throw new Error('fixture API unavailable'); } });
  const catalog = (await admin.get(`${base}/catalog`).expect(200)).body.data;
  assert.equal(catalog.items.length, 2);
  assert.deepEqual(catalog.brands, ['Apple']);
  await service.directoryRefresh?.promise.catch(() => {});
  const refreshed = (await admin.get(`${base}/catalog`).expect(200)).body.data;
  assert.ok(refreshed.directoryWarning);
  await admin.post(`${base}/directory/refresh`).expect(502);
});

test('selection summary counts groups across products and modifications and excludes absent stickers', async () => {
  await pool.query('UPDATE search_horoshop_products SET stickers = $1::jsonb WHERE id = $2', [JSON.stringify([{ id: '1', title: 'Хіт' }]), productIds[1]]);
  await pool.query('UPDATE search_horoshop_modifications SET stickers = $1::jsonb WHERE sku = $2', [JSON.stringify([{ id: '1', title: 'Хіт' }, { id: '3', title: 'Гарантія' }, { id: '19', title: 'Вимкнений' }, { id: '8', title: 'Автоматичний' }]), '0001']);
  service.clientFactory = () => { throw new Error('Selection summaries must only read the synchronized catalog'); };
  const response = await admin.post(`${base}/selection/summary`).send({ productIds: [...productIds, productIds[0]] }).expect(200);
  assert.match(response.headers['cache-control'], /no-store/u);
  assert.equal(response.body.data.total, 2);
  assert.deepEqual(response.body.data.stickers.map((s) => [s.externalId, s.productCount, s.enabled]).sort((a, b) => a[0].localeCompare(b[0])), [['1', 2, true], ['19', 1, false], ['3', 1, true]]);
  const first = (await admin.post(`${base}/selection/summary`).send({ productIds: [productIds[0]] }).expect(200)).body.data;
  assert.equal(first.stickers.every((s) => s.productCount === 1), true);
  assert.equal(first.stickers.some((s) => s.externalId === '11'), false);
  assert.equal(/encrypted|password|token|source_data/u.test(JSON.stringify(response.body)), false);
  assert.equal(imports.length, 0);
});

test('selection summary resolves cached title-only stickers only when their directory title is unique', async () => {
  await pool.query('UPDATE search_horoshop_products SET stickers = $1::jsonb WHERE id = $2', ['[]', productIds[0]]);
  await pool.query('UPDATE search_horoshop_modifications SET stickers = $1::jsonb WHERE product_id = $2', [JSON.stringify([{ id: '', title: 'Гарантія' }]), productIds[0]]);
  const input = { productIds: [productIds[0]] };
  const summary = (await admin.post(`${base}/selection/summary`).send(input).expect(200)).body.data;
  assert.deepEqual(summary.stickers.map((s) => [s.externalId, s.productCount]), [['3', 1]]);
  await pool.query(`INSERT INTO search_horoshop_stickers (connection_id, generation, external_id, title, enabled, last_seen_sync_id)
    VALUES ($1, $2, 'duplicate-title', 'Гарантія', TRUE, $3)`, [connection, generation, randomUUID()]);
  const ambiguous = (await admin.post(`${base}/selection/summary`).send(input).expect(200)).body.data;
  assert.deepEqual(ambiguous.stickers, []);
});

test('selection summary validates selection and access and rejects missing or inactive products', async () => {
  await request(app).post(`${base}/selection/summary`).send({ productIds }).expect(401);
  await admin.post(`${base}/selection/summary`).send({ productIds: [] }).expect(422);
  await admin.post(`${base}/selection/summary`).send({ productIds: ['invalid'] }).expect(422);
  await admin.post(`${base}/selection/summary`).send({ productIds, extra: true }).expect(422);
  await admin.post(`${base}/selection/summary`).send({ productIds: [randomUUID()] }).expect(409);
  await pool.query('UPDATE search_horoshop_products SET active = FALSE WHERE id = $1', [productIds[0]]);
  await admin.post(`${base}/selection/summary`).send({ productIds }).expect(409);
});

test('preview is read-only; applying merges manual icons, updates the whole group and verifies every product', async () => {
  const operation = await preview();
  assert.equal(imports.length, 0);
  assert.deepEqual(operation.items.find((i) => i.productId === productIds[0]).after.map((s) => s.title), ['Гарантія', 'Акція']);
  const result = await apply(operation);
  assert.equal(result.status, 'completed');
  assert.equal(result.counts.succeeded, 2);
  assert.equal(imports[0].options.maxAttempts, 1);
  assert.deepEqual(Object.keys(imports[0].payloads[0]).sort(), ['article', 'icons']);
  assert.deepEqual(imports.flatMap((entry) => entry.payloads.map((payload) => payload.article)).sort(), ['0001', '0002', '0003']);
  assert.equal(remoteProducts[0].modifications.every((m) => m.icons.includes('Гарантія') && m.icons.includes('Акція') && !m.icons.includes('Хіт')), true);
  const cache = await admin.get(`${base}/catalog`).expect(200);
  assert.equal(cache.body.data.items.every((p) => p.stickers.some((s) => s.id === '11')), true);
  await admin.post(`${base}/operations/${operation.id}/apply`).expect(409);
});

test('a second preview uses stickers cached after the previous write despite older raw sync data', async () => {
  assert.equal((await apply(await preview([productIds[0]]))).counts.succeeded, 1);
  service.clientFactory = () => { throw new Error('Preview must not read Horoshop'); };
  const next = await preview([productIds[0]], ['1'], ['11']);
  assert.deepEqual(next.items[0].before.map((sticker) => sticker.id).sort(), ['11', '3']);
  assert.deepEqual(next.items[0].after.map((sticker) => sticker.id).sort(), ['1', '3']);
  assert.equal(next.counts.pending, 1);
});

test('cached preview accepts stickers supplied by modifications when the parent export omitted the field', async () => {
  const parent = structuredClone(remoteProducts[0]);
  delete parent.icons;
  await pool.query('UPDATE search_horoshop_products SET source_data = $1::jsonb, stickers = $2::jsonb WHERE id = $3',
    [JSON.stringify(parent), '[]', productIds[0]]);
  const operation = await preview([productIds[0]]);
  assert.deepEqual(operation.items[0].before.map((sticker) => sticker.id).sort(), ['1', '3']);
  assert.equal(operation.counts.pending, 1);
});

test('live offer order may differ from cached order without blocking an unchanged group', async () => {
  remoteProducts[0].modifications.reverse();
  const operation = await preview([productIds[0]]);
  assert.equal(operation.items[0].article, '0001');
  assert.equal((await apply(operation)).counts.succeeded, 1);
});

test('removing the last sticker sends an empty array and no-op products are skipped', async () => {
  const operation = await preview(productIds, [], ['1', '3']);
  assert.equal(operation.counts.unchanged, 1);
  const result = await apply(operation);
  assert.equal(result.counts.succeeded, 1);
  assert.equal(result.counts.unchanged, 1);
  assert.deepEqual(imports[0].payloads, [{ article: '0001', icons: [] }, { article: '0002', icons: [] }]);
});

test('automatic stickers, disabled additions, missing stickers and conflicting actions cannot be submitted', async () => {
  for (const [addIds, removeIds, status] of [[['8'], [], 409], [[], ['8'], 409], [['19'], [], 422], [['missing'], [], 409], [['1'], ['1'], 422], [[], [], 422]]) {
    await admin.post(`${base}/operations/preview`).send({ productIds, addIds, removeIds }).expect(status);
  }
  assert.equal(imports.length, 0);
});

test('legacy confirmations cannot expose or authorize renamed automatic icons', async () => {
  directory.find((item) => item.id === 8).title = 'Спеціальна пропозиція';
  await pool.query('INSERT INTO search_horoshop_manual_stickers (connection_id, external_id) VALUES ($1, $2)', [connection, '8']);
  const catalog = (await admin.get(`${base}/catalog`).expect(200)).body.data;
  assert.equal(catalog.directory.some((item) => item.externalId === '8'), false);
  assert.ok(catalog.directory.some((item) => item.externalId === '11'));
  await admin.post(`${base}/operations/preview`).send({ productIds, addIds: ['8'], removeIds: [] }).expect(409);
  const operation = await preview();
  await pool.query('UPDATE search_horoshop_sticker_operation_items SET add_ids = $1::jsonb WHERE operation_id = $2', ['["8"]', operation.id]);
  const result = await apply(operation);
  assert.equal(result.counts.conflict, 2);
  assert.equal(imports.length, 0);
});

test('manual directory includes unused and disabled manual icons and excludes every native automatic icon independently of title', () => {
  const directory = Array.from({ length: 12 }, (_, i) => ({ externalId: String(i + 1), title: `Перейменований ${i + 1}`, enabled: i !== 10 }));
  assert.deepEqual(manualStickerDirectory(directory).map((item) => item.externalId), ['1', '3', '4', '10', '11', '12']);
  assert.deepEqual(assertManualActions(['10', '12'], [], directory), [{ id: '10', title: 'Перейменований 10' }, { id: '12', title: 'Перейменований 12' }]);
  assert.doesNotThrow(() => assertManualActions([], ['11'], directory));
  for (const id of ['2', '5', '6', '7', '8', '9']) {
    assert.throws(() => assertManualActions([id], [], directory), { code: 'STICKER_NOT_MANUAL' });
    assert.throws(() => assertManualActions([], [id], directory), { code: 'STICKER_NOT_MANUAL' });
  }
});

test('changed sticker sets, missing icon fields and changed modification membership block writes', async () => {
  const operation = await preview();
  remoteProducts[0].icons.push('Автоматичний');
  remoteProducts[0].modifications.forEach((m) => m.icons.push('Автоматичний'));
  remoteProducts[1].modifications.push({ article: 'NEW', icons: [] });
  const result = await apply(operation);
  assert.equal(result.counts.conflict, 2);
  assert.equal(imports.length, 0);
  delete remoteProducts[0].icons;
  remoteProducts[0].modifications.forEach((m) => { delete m.icons; });
  const blocked = await preview([productIds[0]]);
  assert.equal(blocked.counts.pending, 1);
  assert.equal((await apply(blocked)).counts.conflict, 1);
  assert.equal(imports.length, 0);
});

test('transport timeout after success is reconciled, and an interrupted writing item is not sent twice', async () => {
  importMode = 'timeout-after-write';
  const operation = await preview([productIds[0]]);
  const result = await apply(operation);
  assert.equal(result.counts.succeeded, 1);
  const recovered = await preview([productIds[1]]);
  await admin.post(`${base}/operations/${recovered.id}/apply`).expect(202);
  await pool.query(`UPDATE search_horoshop_sticker_operations SET status = 'running' WHERE id = $1`, [recovered.id]);
  await pool.query(`UPDATE search_horoshop_sticker_operation_items SET status = 'writing' WHERE operation_id = $1`, [recovered.id]);
  remoteProducts[1].icons = ['Акція']; remoteProducts[1].modifications[0].icons = ['Акція'];
  const previousImports = imports.length;
  await service.runNext();
  assert.equal(imports.length, previousImports);
  assert.equal((await service.detail(recovered.id)).counts.succeeded, 1);
});

test('partial results retry only failures; stop preserves already completed work', async () => {
  importMode = 'partial';
  const result = await apply(await preview());
  assert.equal(result.counts.succeeded, 1); assert.equal(result.counts.failed, 1);
  const retry = (await admin.post(`${base}/operations/${result.id}/retry`).expect(200)).body.data;
  assert.equal(retry.total, 1); assert.equal(retry.kind, 'retry');
  importMode = 'normal';
  assert.equal((await apply(retry)).counts.succeeded, 1);
  const stopped = await preview(productIds, ['1'], []);
  await admin.post(`${base}/operations/${stopped.id}/apply`).expect(202);
  await admin.post(`${base}/operations/${stopped.id}/stop`).expect(200);
  const before = imports.length;
  await service.runNext();
  assert.equal(imports.length, before);
  const stopResult = await service.detail(stopped.id);
  assert.equal(stopResult.status, 'stopped'); assert.equal(stopResult.counts.cancelled, 2);
});

test('retry repairs a partially written modification group only when every set matches its before or after snapshot', async () => {
  importMode = 'partial-offer';
  const result = await apply(await preview([productIds[0]]));
  assert.equal(result.counts.failed, 1);
  assert.ok(remoteProducts[0].modifications[0].icons.includes('Акція'));
  assert.ok(remoteProducts[0].modifications[1].icons.includes('Хіт'));
  const retry = (await admin.post(`${base}/operations/${result.id}/retry`).expect(200)).body.data;
  importMode = 'normal';
  assert.equal((await apply(retry)).counts.succeeded, 1);
  assert.ok(remoteProducts[0].modifications.every((m) => m.icons.includes('Акція')));

  importMode = 'partial-offer';
  const second = await apply(await preview([productIds[0]], ['1'], ['11']));
  remoteProducts[0].modifications[1].icons.push('Автоматичний');
  const blocked = (await admin.post(`${base}/operations/${second.id}/retry`).expect(200)).body.data;
  const previousImports = imports.length;
  assert.equal((await apply(blocked)).counts.conflict, 1);
  assert.equal(imports.length, previousImports);
});

test('stopping during an import finishes the current group and cancels the remaining groups', async () => {
  service.batchSize = 1;
  const operation = await preview();
  const factory = service.clientFactory;
  let calls = 0;
  service.clientFactory = (...args) => {
    const client = factory(...args);
    const original = client.importCatalog;
    client.importCatalog = async (...input) => {
      const result = await original(...input);
      calls += 1;
      if (calls === 1) await admin.post(`${base}/operations/${operation.id}/stop`).expect(200);
      return result;
    };
    return client;
  };
  const result = await apply(operation);
  assert.equal(result.status, 'stopped');
  assert.equal(result.counts.succeeded, 1);
  assert.equal(result.counts.cancelled, 1);
  assert.deepEqual(imports.flatMap((entry) => entry.payloads.map((payload) => payload.article)), ['0001', '0002']);
});

test('rollback removes its own changes, preserves unrelated later stickers, and rejects later edits to touched icons', async () => {
  const result = await apply(await preview([productIds[0]]));
  remoteProducts[0].icons.push('Автоматичний'); remoteProducts[0].modifications.forEach((m) => m.icons.push('Автоматичний'));
  const rollback = (await admin.post(`${base}/operations/${result.id}/rollback`).expect(200)).body.data;
  assert.equal(imports.length, 1);
  assert.equal(rollback.kind, 'rollback');
  await apply(rollback);
  assert.deepEqual(remoteProducts[0].icons.sort(), ['Автоматичний', 'Гарантія', 'Хіт'].sort());
  const conflict = (await admin.post(`${base}/operations/${result.id}/rollback`).expect(200)).body.data;
  assert.equal(conflict.counts.conflict, 1);
});

test('editors with tool access can use all manual icons without administrator setup', async () => {
  const userId = randomUUID();
  const adminRow = await pool.query('SELECT password_hash FROM users WHERE email = $1', [process.env.ADMIN_EMAIL]);
  await pool.query(`INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Sticker Editor', 'sticker-editor@test.local', $2, 'editor', 'approved')`, [userId, adminRow.rows[0].password_hash]);
  const editor = request.agent(app);
  await editor.post('/api/auth/login').send({ email: 'sticker-editor@test.local', password: process.env.ADMIN_PASSWORD }).expect(200);
  await editor.get(`${base}/catalog`).expect(403);
  await pool.query(`INSERT INTO user_tool_access (user_id, tool_id) VALUES ($1, 'horoshop_stickers')`, [userId]);
  const catalog = (await editor.get(`${base}/catalog`).expect(200)).body.data;
  assert.ok(catalog.directory.some((s) => s.externalId === '11'));
  await editor.get('/api/search/horoshop/catalog').expect(403);
  const operation = (await editor.post(`${base}/operations/preview`).send({ productIds, addIds: ['11'], removeIds: [] }).expect(201)).body.data;
  await editor.post(`${base}/operations/${operation.id}/apply`).expect(202);
  await service.runNext();
  const result = (await editor.get(`${base}/operations/${operation.id}`).expect(200)).body.data;
  assert.equal(result.counts.succeeded, 2);
  const actor = await pool.query(`SELECT actor_user_id FROM search_horoshop_sticker_events WHERE operation_id = $1 AND action = 'preview_created'`, [operation.id]);
  assert.equal(actor.rows[0].actor_user_id, userId);
  await admin.put(`${base}/manual`).send({ ids: ['1'], confirmManual: true }).expect(404);
});

test('reports escape CSV formulas and old operations cannot target a new connection generation', async () => {
  await pool.query(`UPDATE search_horoshop_products SET titles = $1::jsonb WHERE id = $2`, [JSON.stringify({ uk: '=HYPERLINK("https://example.com")' }), productIds[0]]);
  const operation = await preview([productIds[0]]);
  const report = await admin.get(`${base}/operations/${operation.id}/report.csv`).expect(200);
  assert.match(report.text, /'=HYPERLINK/u);
  assert.match(report.headers['content-disposition'], /attachment/u);
  await pool.query('UPDATE search_horoshop_connections SET generation = $1 WHERE id = $2', [randomUUID(), connection]);
  await admin.post(`${base}/operations/${operation.id}/apply`).expect(404);
  assert.equal(imports.length, 0);
});

test('domain filtering honors category descendants and price ranges on the same offer', () => {
  const product = { categoryExternalId: 'child', brand: 'Apple', sku: 'P', titles: {}, price: '50', availability: null, visible: true, stickers: [], modifications: [{ sku: 'M', titles: {}, price: '200', stickers: [] }], horoshopCreatedAt: '2026-01-01' };
  const categories = [{ externalId: 'child', parentExternalId: 'parent' }];
  assert.equal(filterStickerProducts([product], categories, { category: 'parent' }).length, 1);
  assert.equal(filterStickerProducts([product], categories, { category: 'parent', includeChildren: false }).length, 0);
  assert.equal(filterStickerProducts([product], categories, { priceMin: 100, priceMax: 150 }).length, 0);
  assert.equal(filterStickerProducts([product], categories, { priceMin: 100, priceMax: 220 }).length, 1);
  const before = [{ id: '1', title: 'Хіт' }, { id: '', title: 'Невідомий ручний' }];
  assert.equal(applyStickerChange(before, [], ['1'])[0].title, 'Невідомий ручний');
  assert.throws(() => assertManualActions(['1'], [], [{ externalId: '1', title: 'X', enabled: true }, { externalId: '11', title: 'X', enabled: true }]));
  const snapshot = remoteStickerSnapshot([{ id: 10, article: 'A', icons: [{ title: 'Невідомий ручний' }] }], [], 'shop.example.com');
  assert.equal(snapshot.groups.get('10').stickers[0].title, 'Невідомий ручний');
  const localized = remoteStickerSnapshot([{ id: 10, article: 'A', icons: [{ title: { ua: 'Хіт' } }] }], [{ id: 1, title: 'Хіт' }], 'shop.example.com');
  assert.equal(localized.groups.get('10').stickers[0].id, '1');
});
