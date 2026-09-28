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
const { horoshopStickerService: service } = await import('../src/modules/search/horoshop/sticker.service.js');
const { applyStickerChange, assertManualActions, filterStickerProducts, remoteStickerSnapshot } = await import('../src/modules/search/horoshop/sticker.domain.js');
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
  directory = [{ id: 1, title: 'Хіт', enabled: 1 }, { id: 2, title: 'Акція', enabled: 1 }, { id: 3, title: 'Гарантія', enabled: 1 }, { id: 8, title: 'Автоматичний', enabled: 1 }, { id: 9, title: 'Вимкнений', enabled: 0 }];
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
    await pool.query(`INSERT INTO search_horoshop_products (id, connection_id, generation, external_id, sku, titles, brand, price, availability, stickers, last_seen_sync_id)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'Apple', '100', 'В наявності', $7::jsonb, $8)`, [productIds[i], connection, generation, String(product.id), product.article, JSON.stringify({ uk: product.title.ua }), JSON.stringify(stickers), syncId]);
    for (const modification of product.modifications) await pool.query(`INSERT INTO search_horoshop_modifications
      (connection_id, generation, product_id, external_id, sku, titles, price, availability, stickers, last_seen_sync_id)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, '120', 'В наявності', $7::jsonb, $8)`, [connection, generation, productIds[i], `${product.id}:${modification.article}`, modification.article, JSON.stringify({ uk: product.title.ua }), JSON.stringify(stickers), syncId]);
  }
  for (const id of ['1', '2', '3', '9']) await pool.query('INSERT INTO search_horoshop_manual_stickers (connection_id, external_id) VALUES ($1, $2)', [connection, id]);
  service.clientFactory = () => ({
    authenticate: async () => 'fixture-token',
    exportStickers: async () => structuredClone(directory),
    exportCatalog: async () => ({ products: structuredClone(remoteProducts), nextOffset: null }),
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

async function preview(ids = productIds, addIds = ['2'], removeIds = ['1']) {
  const response = await admin.post(`${base}/operations/preview`).send({ name: 'Тестова акція', productIds: ids, addIds, removeIds }).expect(201);
  return response.body.data;
}
async function apply(operation) {
  await admin.post(`${base}/operations/${operation.id}/apply`).expect(202);
  await service.runNext();
  return (await admin.get(`${base}/operations/${operation.id}`).expect(200)).body.data;
}

test('catalog, exact article resolution and saved selection expose no credentials and keep leading zeros', async () => {
  await request(app).get(`${base}/catalog`).expect(401);
  const response = await admin.get(`${base}/catalog?stickerMode=present&stickerId=1`).expect(200);
  assert.equal(response.body.data.total, 1);
  assert.match(response.headers['cache-control'], /no-store/u);
  assert.equal(response.body.data.directory.find((s) => s.externalId === '8').manual, false);
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
  assert.equal(first.directory.length, directory.length);
  assert.equal(first.directoryWarning, null);
  await admin.get(`${base}/catalog?search=Телефон`).expect(200);
  assert.equal(calls, 1);
  directory = directory.filter((item) => item.id !== 3);
  directory.push({ id: 12, title: 'Передзамовлення', enabled: 1 });
  await admin.post(`${base}/directory/refresh`).expect(200);
  const refreshed = (await admin.get(`${base}/catalog`).expect(200)).body.data;
  assert.equal(calls, 2);
  assert.equal(refreshed.directory.some((s) => s.externalId === '3'), false);
  assert.equal(refreshed.directory.find((s) => s.externalId === '12').manual, false);
  assert.equal(imports.length, 0);
});

test('directory failures remain visible while the cached catalog and brands stay usable', async () => {
  service.clientFactory = () => ({ authenticate: async () => { throw new Error('fixture API unavailable'); } });
  const catalog = (await admin.get(`${base}/catalog`).expect(200)).body.data;
  assert.ok(catalog.directoryWarning);
  assert.equal(catalog.items.length, 2);
  assert.deepEqual(catalog.brands, ['Apple']);
  await admin.post(`${base}/directory/refresh`).expect(502);
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
  assert.equal(cache.body.data.items.every((p) => p.stickers.some((s) => s.id === '2')), true);
  await admin.post(`${base}/operations/${operation.id}/apply`).expect(409);
});

test('removing the last sticker sends an empty array and no-op products are skipped', async () => {
  const operation = await preview(productIds, [], ['1', '3']);
  assert.equal(operation.counts.unchanged, 1);
  const result = await apply(operation);
  assert.equal(result.counts.succeeded, 1);
  assert.equal(result.counts.unchanged, 1);
  assert.deepEqual(imports[0].payloads, [{ article: '0001', icons: [] }, { article: '0002', icons: [] }]);
});

test('unconfirmed automatic stickers, disabled additions and conflicting actions cannot be submitted', async () => {
  for (const [addIds, removeIds, status] of [[['8'], [], 409], [['9'], [], 422], [['1'], ['1'], 422], [[], [], 422]]) {
    await admin.post(`${base}/operations/preview`).send({ productIds, addIds, removeIds }).expect(status);
  }
  assert.equal(imports.length, 0);
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
  assert.equal(blocked.counts.conflict, 1);
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
  const second = await apply(await preview([productIds[0]], ['1'], ['2']));
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

test('permission is independent of related-products access and configuring manual icons is administrator-only', async () => {
  const userId = randomUUID();
  const adminRow = await pool.query('SELECT password_hash FROM users WHERE email = $1', [process.env.ADMIN_EMAIL]);
  await pool.query(`INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Sticker Editor', 'sticker-editor@test.local', $2, 'editor', 'approved')`, [userId, adminRow.rows[0].password_hash]);
  const editor = request.agent(app);
  await editor.post('/api/auth/login').send({ email: 'sticker-editor@test.local', password: process.env.ADMIN_PASSWORD }).expect(200);
  await editor.get(`${base}/catalog`).expect(403);
  await pool.query(`INSERT INTO user_tool_access (user_id, tool_id) VALUES ($1, 'horoshop_stickers')`, [userId]);
  await editor.get(`${base}/catalog`).expect(200);
  await editor.get('/api/search/horoshop/catalog').expect(403);
  await editor.put(`${base}/manual`).send({ ids: ['1'], confirmManual: true }).expect(403);
  await admin.put(`${base}/manual`).send({ ids: ['1'], confirmManual: false }).expect(422);
  await admin.put(`${base}/manual`).send({ ids: ['1'], confirmManual: true }).expect(200);
  const actor = await pool.query(`SELECT actor_user_id FROM search_horoshop_sticker_events WHERE action = 'manual_stickers_confirmed'`);
  assert.ok(actor.rows[0].actor_user_id);
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
  assert.throws(() => assertManualActions(['1'], [], [{ externalId: '1', title: 'X', enabled: true }, { externalId: '2', title: 'X', enabled: true }], ['1']));
  const snapshot = remoteStickerSnapshot([{ id: 10, article: 'A', icons: [{ title: 'Невідомий ручний' }] }], [], 'shop.example.com');
  assert.equal(snapshot.groups.get('10').stickers[0].title, 'Невідомий ручний');
  const localized = remoteStickerSnapshot([{ id: 10, article: 'A', icons: [{ title: { ua: 'Хіт' } }] }], [{ id: 1, title: 'Хіт' }], 'shop.example.com');
  assert.equal(localized.groups.get('10').stickers[0].id, '1');
});
