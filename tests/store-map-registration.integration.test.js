import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: 'pg-mem://store-map-registration-tests',
  JWT_SECRET: '0123456789abcdef0123456789abcdef', COOKIE_SECURE: 'false',
  ADMIN_NAME: 'Registration Admin', ADMIN_EMAIL: 'registration-admin@test.local', ADMIN_PASSWORD: 'AdminPassword123!' });
const { default: app } = await import('../src/app.js');
const { pool, query } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');
const admin = request.agent(app);
const base = '/api/store-map/registration';
const publicBase = '/api/public/store-map/registration';
const submission = () => ({ name: 'Магазин біля входу', city: 'Київ', address: 'Хрещатик, 1', hoursText: '09:00 - 20:00',
  latitude: 50.4502, longitude: 30.5235, comment: 'Перший поверх', confirmed: true,
  measurement: { latitude: 50.4501, longitude: 30.5234, accuracy: 7, observedAt: new Date().toISOString(), sampleCount: 4, durationMs: 60000, consistent: true } });
const newLink = async () => (await admin.post(`${base}/links`).send({ label: 'Київ' }).expect(201)).body.data;
const submit = (token, input = submission()) => request(app).post(publicBase).set('Authorization', `Bearer ${token}`).send(input);

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  await admin.post('/api/auth/login').send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }).expect(200);
});
after(async () => pool.end());

test('registration management requires authentication and store-map access; public links reveal no submission data', async () => {
  await request(app).post(`${base}/links`).send({}).expect(401);
  await request(app).get(`${base}/requests`).expect(401);
  await request(app).get('/store-map/location-preview').expect(401);
  const password = (await query('SELECT password_hash FROM users WHERE email = $1', [process.env.ADMIN_EMAIL])).rows[0].password_hash;
  await query("INSERT INTO users (name, email, password_hash, role, status) VALUES ('Manager', 'no-map@test.local', $1, 'manager', 'approved')", [password]);
  const manager = request.agent(app);
  await manager.post('/api/auth/login').send({ email: 'no-map@test.local', password: process.env.ADMIN_PASSWORD }).expect(200);
  await manager.get(`${base}/requests`).expect(403);
  await manager.post(`${base}/links`).send({}).expect(403);
  await manager.get('/store-map/location-preview').expect(403);
  await request(app).get(publicBase).expect(404);
  await request(app).get(publicBase).set('Authorization', `Bearer ${'a'.repeat(43)}`).expect(404);
  const preflight = await request(app).options(publicBase).set('Origin', 'https://other.example.test')
    .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'authorization,content-type').expect(204);
  assert.equal(preflight.headers['access-control-allow-origin'], undefined);
});

test('one-time registration keeps original location and only publishes an edited store on explicit approval', async () => {
  const link = await newLink();
  assert.match(link.token, /^[A-Za-z0-9_-]{43}$/);
  const storedLink = (await query('SELECT * FROM store_map_registration_links WHERE id = $1', [link.id])).rows[0];
  assert.notEqual(storedLink.token_hash, link.token);
  assert.equal(storedLink.token_hash.length, 64);
  const publicState = await request(app).get(publicBase).set('Authorization', `Bearer ${link.token}`).expect(200);
  assert.equal(publicState.headers['cache-control'], 'no-store');
  assert.equal(publicState.body.data.status, 'OPEN');
  assert.deepEqual(Object.keys(publicState.body.data).sort(), ['expiresAt', 'status']);
  const input = submission();
  await submit(link.token, { ...input, externalId: 'not-allowed' }).expect(422);
  await submit(link.token, { ...input, confirmed: false }).expect(422);
  await submit(link.token, { ...input, latitude: 91 }).expect(422);
  await submit(link.token, { ...input, measurement: { ...input.measurement, accuracy: 0 } }).expect(422);
  await submit(link.token, { ...input, measurement: { ...input.measurement, observedAt: new Date(Date.now() - 3600000).toISOString() } }).expect(422);
  await submit(link.token, { ...input, measurement: { ...input.measurement, observedAt: new Date(Date.now() + 3600000).toISOString() } }).expect(422);
  await submit(link.token, input).expect(201);
  await submit(link.token, input).expect(201);
  const submittedState = await request(app).get(publicBase).set('Authorization', `Bearer ${link.token}`).expect(200);
  assert.equal(submittedState.body.data.status, 'SUBMITTED');
  assert.equal((await request(app).get('/api/public/store-map')).body.data.points.length, 0);
  const feed = await admin.get(`${base}/requests?status=NEW&search=${encodeURIComponent('Київ')}`).expect(200);
  assert.equal(feed.body.data.total, 1);
  assert.equal(feed.body.data.pendingCount, 1);
  const item = feed.body.data.items[0];
  assert.deepEqual(item.measurement, input.measurement);
  assert.equal(item.submittedData.comment, input.comment);
  assert.equal(item.submittedData.latitude, input.latitude);
  assert.notEqual(item.latitude, item.measurement.latitude);
  const review = { version: item.version, name: 'Магазин після перевірки', city: input.city, address: 'Хрещатик, 1, вхід праворуч',
    hoursText: input.hoursText, latitude: 50.4503, longitude: 30.5236, reviewNote: 'Вхід перевірено' };
  await admin.post(`${base}/requests/${item.id}/approve`).send({ ...review, version: item.version + 1 }).expect(409);
  assert.equal((await request(app).get('/api/public/store-map')).body.data.points.length, 0);
  const approved = await admin.post(`${base}/requests/${item.id}/approve`).send(review).expect(200);
  assert.equal(approved.body.data.status, 'APPROVED');
  assert.equal(approved.headers['cache-control'], 'no-store');
  assert.equal(approved.body.data.version, item.version + 1);
  assert.ok(approved.body.data.reviewedBy);
  assert.ok(approved.body.data.reviewedAt);
  assert.equal(approved.body.data.reviewNote, review.reviewNote);
  assert.deepEqual(approved.body.data.measurement, input.measurement);
  assert.equal(approved.body.data.submittedData.name, input.name);
  assert.equal(approved.body.data.submittedData.latitude, input.latitude);
  const repeated = await admin.post(`${base}/requests/${item.id}/approve`).send(review).expect(200);
  assert.equal(repeated.body.data.pointId, approved.body.data.pointId);
  await admin.post(`${base}/requests/${item.id}/approve`).send({ ...review, name: 'Конкурентна зміна' }).expect(409);
  await admin.post(`${base}/requests/${item.id}/reject`).send({ version: 2 }).expect(409);
  const points = (await request(app).get('/api/public/store-map')).body.data.points;
  assert.equal(points.length, 1);
  assert.equal(points[0].id, approved.body.data.pointId);
  assert.equal(points[0].name, review.name);
  assert.equal(points[0].latitude, review.latitude);
  assert.equal(points[0].externalId, '');
  const links = await admin.get(`${base}/links`).expect(200);
  assert.ok(links.body.data[0].usedAt);
  assert.equal(JSON.stringify(links.body).includes(link.token), false);
  assert.equal(JSON.stringify(links.body).includes('token_hash'), false);
  await admin.post(`${base}/links/${link.id}/revoke`).expect(409);
});

test('expired and revoked links cannot be submitted; rejection never creates a public store', async () => {
  const revoked = await newLink();
  await admin.post(`${base}/links/${revoked.id}/revoke`).expect(204);
  await submit(revoked.token).expect(410);
  const expired = await newLink();
  await query('UPDATE store_map_registration_links SET expires_at = $1 WHERE id = $2', [new Date(Date.now() - 1000), expired.id]);
  await request(app).get(publicBase).set('Authorization', `Bearer ${expired.token}`).expect(410);
  await submit(expired.token).expect(410);
  const link = await newLink();
  await submit(link.token).expect(201);
  const feed = await admin.get(`${base}/requests?status=NEW`).expect(200);
  const item = feed.body.data.items[0];
  const rejected = await admin.post(`${base}/requests/${item.id}/reject`).send({ version: item.version, reviewNote: 'Потрібне уточнення адреси' }).expect(200);
  assert.equal(rejected.body.data.status, 'REJECTED');
  assert.equal(rejected.body.data.pointId, null);
  assert.equal(rejected.body.data.reviewNote, 'Потрібне уточнення адреси');
  await admin.post(`${base}/requests/${item.id}/reject`).send({ version: item.version, reviewNote: 'Потрібне уточнення адреси' }).expect(200);
  await admin.post(`${base}/requests/${item.id}/approve`).send({ ...submission(), version: rejected.body.data.version,
    measurement: undefined, confirmed: undefined, comment: undefined }).expect(409);
  assert.equal((await request(app).get('/api/public/store-map')).body.data.points.length, 1);
  assert.equal((await admin.get(`${base}/requests?status=NEW`)).body.data.pendingCount, 0);
  const details = await admin.get(`${base}/requests/${item.id}`).expect(200);
  assert.equal(details.body.data.status, 'REJECTED');
  await admin.get(`${base}/requests/not-a-uuid`).expect(422);
});
