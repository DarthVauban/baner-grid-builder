import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { createElement } from '../src/modules/popup-banners/zero-block/document.mjs';
import { enableFormFlow, newReward } from '../src/modules/popup-banners/zero-block/form-flow.mjs';
import { evaluateRules, recordImpression, validateRuleSet } from '../src/modules/popup-banners/zero-block/rules.mjs';
import { createRuleState } from '../src/modules/popup-banners/zero-block/rule-state.mjs';

const mediaDir = await mkdtemp(join(tmpdir(), 'mt-zero-block-'));
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: process.env.ZERO_BLOCK_TEST_DATABASE_URL || 'pg-mem://popup-zero-block',
  JWT_SECRET: 'zero-block-fixture-signing-key-32-characters',
  APP_ORIGIN: 'https://panel.zero.example',
  COOKIE_SECURE: 'false',
  CATALOG_MEDIA_DIR: mediaDir
});

const [{ default: app }, { pool }, { runMigrations }, { createAccessToken }] = await Promise.all([
  import('../src/app.js'), import('../src/db/pool.js'), import('../src/db/migrate.js'), import('../src/lib/jwt.js')
]);
const http = request(app);
const base = '/api/popup-banners/zero-block';
const publicBase = '/api/public/popup-banners';
const store = 'https://zero-shop.example';
const resolver = `${publicBase}/resolve`;
let auth;
let productId;

before(async () => {
  await runMigrations();
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, status, two_factor_enabled, two_factor_confirmed_at)
     VALUES ('Zero Block QA', 'zero-block@example.test', 'fixture', 'admin', 'approved', TRUE, $1) RETURNING id, role`,
    [new Date('2025-01-01T00:00:00Z')]
  );
  auth = `Bearer ${createAccessToken(user)}`;
});
after(async () => {
  await pool.end();
  await rm(mediaDir, { recursive: true, force: true });
});

const admin = (method, path) => http[method](path).set('Authorization', auth);
const revisions = (widget) => ({ draftRevision: widget.revision, campaignRevision: widget.campaignRevision });
const publish = (widget, operationId = randomUUID()) => admin('post', `${base}/${widget.widgetId}/publish`).send({
  ...revisions(widget), operationId
});
const save = (widget) => admin('patch', `${base}/${widget.widgetId}`).send({ revision: widget.revision, document: widget.document });
const resolve = (includeZero = true, origin = store) => http.get(resolver).set('Origin', origin)
  .query({ pageUrl: `${store}/sale`, ...(includeZero ? { zeroBlock: '1' } : {}) });

test('Zero Block lifecycle, immutable media, redacted rewards and rollback compatibility', async () => {
  await http.post(base).send({ name: 'Недоступно' }).expect(401);
  const draft = (await admin('post', base).send({ name: 'Вільна композиція' }).expect(201)).body.data;
  await publish(draft).expect(409);
  const connectionId = randomUUID();
  const generation = randomUUID();
  await pool.query(
    `INSERT INTO search_horoshop_connections (id, generation, store_domain, encrypted_credentials, status)
     VALUES ($1, $2, 'zero-shop.example', 'fixture', 'connected')`, [connectionId, generation]
  );
  productId = randomUUID();
  await pool.query(
    `INSERT INTO search_horoshop_products
     (id, connection_id, generation, external_id, sku, titles, primary_image_url, canonical_url, price, availability, last_seen_sync_id)
     VALUES ($1, $2, $3, 'pd-1', 'PD-1', '{"uk":"Вибраний товар"}',
       'https://zero-shop.example/photo.webp', 'https://zero-shop.example/item/', '1250', 'В наявності', $4)`,
    [productId, connectionId, generation, randomUUID()]
  );
  const text = createElement('text');
  text.content.text = 'Перша публікація';
  const form = createElement('form');
  form.content = enableFormFlow(form.content, true);
  for (const field of form.content.fields) field.required = true;
  const bytes = Buffer.from('Винагорода для перевірки\n');
  const rewardUpload = (await admin('post', `${base}/reward-files`).set('Content-Type', 'application/octet-stream')
    .set('X-File-Name', 'reward.txt').send(bytes).expect(201)).body.data;
  form.content.flow.reward = { ...newReward('file'), fileId: rewardUpload.id, fileName: rewardUpload.name };
  draft.document.forms = [{ id: form.content.formId, name: 'Дані учасника' }];
  const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#6d5dfc' } }).png().toBuffer();
  const ids = [];
  const images = [];
  for (let index = 0; index < 2; index += 1) {
    const asset = (await admin('post', '/api/popup-banners/image').set('Content-Type', 'image/png')
      .set('X-File-Name', `banner-${index}.png`).send(png).expect(201)).body.data;
    ids.push(asset.id);
    const image = createElement('image');
    image.content.resourceId = asset.id;
    images.push(image);
  }
  draft.document.elements = [text, form, ...images];
  draft.document.mobile.width = 380;
  draft.document.showCloseButton = false;
  draft.document.productId = productId;
  draft.document.timezone = 'Europe/Warsaw';
  draft.document.priority = 90;
  draft.document.rules.rules = [{ type: 'url', include: ['/sale'], exclude: [] }, { type: 'session_frequency', max: 3, dailyMax: 2 }];
  const firstResponse = await save(draft);
  assert.equal(firstResponse.status, 200, JSON.stringify(firstResponse.body));
  const firstSave = firstResponse.body.data;
  await save(draft).expect(409);
  assert.equal((await publish(firstSave).expect(422)).body.error.details[0].code, 'close_control_missing');
  const close = createElement('button');
  close.action = { type: 'close' };
  firstSave.document.elements.push(close);
  const saved = (await save(firstSave).expect(200)).body.data;
  assert.equal(saved.document.mobile.width, 380);
  assert.equal(saved.products[productId].name, 'Вибраний товар');

  const operationA = randomUUID();
  const first = (await publish(saved, operationA).expect(200)).body.data;
  assert.equal(first.publishedVersionId, first.operationVersionId);
  const same = (await publish(first).expect(200)).body.data;
  assert.equal(same.publishedVersionId, first.publishedVersionId, 'an unchanged draft reuses its immutable version');
  const listing = (await admin('get', '/api/popup-banners').expect(200)).body.data;
  const listed = listing.find((item) => item.id === draft.widgetId);
  assert.equal(listed.campaignType, 'zero_block');
  assert.equal((await resolve(false).expect(200)).body.data, null, 'legacy resolvers only see legacy campaigns');
  assert.equal((await resolve(true, 'https://other.example').expect(200)).body.data, null);
  const candidate = (await resolve().expect(200)).body.data.zeroBlock.campaigns[0];
  assert.equal(candidate.timezone, 'Europe/Warsaw');
  assert.equal(candidate.id, listed.publicId);
  assert.equal(candidate.document.elements[1].content.flow.reward.fileId, '');
  assert.equal(candidate.document.elements[1].content.flow.reward.fileName, '');
  assert.equal(candidate.document.shopId, undefined);

  await admin('delete', `/api/media/${ids[0]}`).expect(204);
  await admin('post', '/api/media/bulk-delete').send({ ids: [ids[1]] }).expect(200);
  for (const id of ids) {
    const image = await http.get(`${publicBase}/zero-block/media/${id}`).expect(200);
    assert.equal(image.headers['content-type'], 'image/webp');
    assert.ok(image.body.length > 0);
  }

  same.document.elements[0].content.text = 'Друга публікація';
  const nextDraft = (await save(same).expect(200)).body.data;
  assert.equal((await resolve().expect(200)).body.data.zeroBlock.campaigns[0].document.elements[0].content.text, 'Перша публікація');
  const second = (await publish(nextDraft).expect(200)).body.data;
  assert.notEqual(second.publishedVersionId, first.publishedVersionId);
  const replay = (await publish(saved, operationA).expect(200)).body.data;
  assert.equal(replay.operationVersionId, first.publishedVersionId);
  assert.equal(replay.publishedVersionId, second.publishedVersionId);
  assert.equal(replay.campaignRevision, second.campaignRevision);

  const data = { versionId: second.publishedVersionId, formId: form.content.formId, requestKey: randomUUID(),
    pageUrl: `${store}/sale?private=1`, values: { email: 'contact@example.test', name: 'Олена' } };
  const submit = (input, origin = store) => http.post(`${publicBase}/zero-block/${candidate.id}/submit`).set('Origin', origin).send(input);
  await submit(data, 'https://other.example').expect(403);
  await submit({ ...data, versionId: first.publishedVersionId }).expect(409);
  await submit({ ...data, values: { email: 'contact@example.test' } }).expect(422);
  const accepted = (await submit(data).expect(201)).body.data;
  const repeated = (await submit(data).expect(200)).body.data;
  assert.equal(repeated.submissionId, accepted.submissionId);
  assert.equal(repeated.reward.href, accepted.reward.href);
  const attachment = await http.get(accepted.reward.href).expect(200);
  assert.match(attachment.headers['content-disposition'], /^attachment/u);
  assert.match(attachment.headers['cache-control'], /no-store/u);
  assert.equal(attachment.text, bytes.toString());
  await submit({ ...data, values: { ...data.values, name: 'Інша' } }).expect(409);

  const paused = (await admin('post', `${base}/${draft.widgetId}/pause`).send(revisions(second)).expect(200)).body.data;
  await resolve().expect(200, { data: null });
  await admin('delete', `${base}/${draft.widgetId}`).send(revisions(second)).expect(409);
  await admin('delete', `${base}/${draft.widgetId}`).send(revisions(paused)).expect(204);
  await admin('get', `${base}/${draft.widgetId}`).expect(404);
  await admin('get', '/api/popup-banners').expect(200, { data: [] });
  const contacts = (await admin('get', `${base}/contacts`).query({ campaignId: draft.widgetId }).expect(200)).body.data;
  assert.equal(contacts.total, 1);
  assert.equal(contacts.items[0].deleted, true);
  assert.ok(contacts.items[0].fields.some((field) => field.value === 'Олена'));
  const { rows: [stored] } = await pool.query('SELECT campaign_type, zero_block FROM popup_banner_campaigns WHERE id = $1', [draft.widgetId]);
  assert.deepEqual(stored, { campaign_type: 'block', zero_block: true });
});

test('the real Horoshop publisher stores a byte-addressed Zero Block storefront module', async () => {
  const release = (await admin('post', '/api/horoshop-widgets/releases').expect(201)).body.data;
  const loaderPath = new URL(/src="([^"]+)"/u.exec(release.embedCode)[1]).pathname;
  const loader = (await http.get(loaderPath).expect(200)).text;
  const sources = [...new Set(loader.match(/\/api\/public\/horoshop-widgets\/assets\/[a-f0-9]{96}\.js/gu))];
  const scripts = await Promise.all(sources.map((path) => http.get(path).expect(200)));
  const popup = scripts.find((script) => script.text.includes('__mtPopupBannersLoaded'));
  assert.ok(popup);
  const asset = JSON.parse(/const zeroBlockRuntimeAsset = (\{[^\n]+\});/u.exec(popup.text)[1]);
  const runtimePath = asset.path;
  const runtime = await http.get(runtimePath).set('Origin', store).expect(200);
  assert.equal(runtime.headers['access-control-allow-origin'], '*');
  assert.equal(createHash('sha384').update(runtime.text).digest('hex'), /([a-f0-9]{96})\.js/u.exec(runtimePath)[1]);
  assert.equal(`sha384-${createHash('sha384').update(runtime.text).digest('base64')}`, asset.integrity);
  assert.match(popup.text, /dependency\.integrity = zeroBlockRuntimeAsset\.integrity/u);
  assert.match(runtime.text, /createZeroBlockRuntime/u);
});

test('parallel library deletion and publication cannot leave a visible banner with missing media', async () => {
  const draft = (await admin('post', base).send({ name: 'Одночасна публікація' }).expect(201)).body.data;
  const png = await sharp({ create: { width: 20, height: 20, channels: 4, background: '#5545eb' } }).png().toBuffer();
  const media = (await admin('post', '/api/popup-banners/image').set('Content-Type', 'image/png').send(png).expect(201)).body.data;
  const image = createElement('image');
  image.content.resourceId = media.id;
  draft.document.elements = [image];
  const saved = (await save(draft).expect(200)).body.data;
  const [result, deleted] = await Promise.all([
    publish(saved),
    admin('post', '/api/media/bulk-delete').send({ ids: [media.id] })
  ]);
  assert.equal(deleted.status, 200);
  if (result.status === 200) {
    const preserved = await http.get(`${publicBase}/zero-block/media/${media.id}`).expect(200);
    assert.equal(preserved.headers['content-type'], 'image/webp');
  } else {
    assert.equal(result.status, 422, JSON.stringify(result.body));
    assert.equal(result.body.error.code, 'ZERO_BLOCK_RESOURCE_MISSING');
    assert.equal((await admin('get', `${base}/${draft.widgetId}`).expect(200)).body.data.publishedVersionId, null);
  }
});

test('daily and session caps form one AND slot with timezone, UTM and suppression', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const state = createRuleState({ storage, shopId: 'store' });
  const instant = Date.parse('2026-11-27T21:59:30Z');
  const url = `${store}/sale?utm_source=mail`;
  state.visit(url, instant);
  const rules = validateRuleSet({ schemaVersion: 1, rules: [
    { type: 'url', include: ['/sale'], exclude: ['/sale/private'] },
    { type: 'device', value: 'mobile' },
    { type: 'utm', params: { utm_source: 'mail' } },
    { type: 'session_frequency', max: 1, dailyMax: 1 },
    { type: 'suppression', actions: ['submit'] }
  ] });
  const context = (now, changes = {}) => ({
    ...state.context('campaign', now), timezone: 'Europe/Kyiv', storage, shopId: 'store', campaignId: 'campaign',
    now, url, device: 'mobile', viewportWidth: 390, ...changes
  });
  assert.equal(evaluateRules(rules, context(instant, { device: 'desktop' })), false);
  assert.equal(evaluateRules(rules, context(instant)), true);
  assert.equal(recordImpression(rules, context(instant)), true);
  assert.equal(evaluateRules(rules, context(instant + 60_000)), false, 'midnight does not reset the session cap');
  assert.equal(state.visit(url, instant + 31 * 60_000), true);
  assert.equal(evaluateRules(rules, context(instant + 31 * 60_000)), true);
  assert.equal(state.complete('campaign', 'submit', instant + 31 * 60_000), true);
  assert.equal(evaluateRules(rules, context(instant + 31 * 60_000)), false);
});
