import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://store-map-integration-tests';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.COOKIE_SECURE = 'false';
process.env.ADMIN_NAME = 'Store Map Admin';
process.env.ADMIN_EMAIL = 'store-map-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');

const admin = request.agent(app);

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  await admin
    .post('/api/auth/login')
    .send({ email: 'store-map-admin@test.local', password: 'AdminPassword123!' })
    .expect(200);
});

after(async () => pool.end());

test('store map CRUD, public feed, settings and embed script work through REST API', async () => {
  const created = await admin.post('/api/store-map/points').send({
    externalId: 'TT-001',
    name: 'м. Київ, Даринок',
    city: 'Київ',
    address: 'вул. Якова Гніздовського, 1А',
    hoursText: '08:00 - 19:30',
    publicationStatus: 'ACTIVE',
    openStatusOverride: 'TEMPORARILY_CLOSED',
    latitude: 50.45165,
    longitude: 30.63891
  }).expect(201);

  assert.equal(created.body.data.externalId, 'TT-001');
  assert.equal(created.body.data.openStatusOverride, 'TEMPORARILY_CLOSED');
  assert.equal(created.body.data.schedule.timezone, 'Europe/Kyiv');

  const publicData = await request(app).get('/api/public/store-map').expect(200);
  assert.equal(publicData.body.data.points.length, 1);
  assert.deepEqual(publicData.body.data.cities, ['Київ']);

  const currentSettings = await admin.get('/api/store-map/settings').expect(200);
  const safeSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 52"><path fill="#ffd500" d="M20 0C9 0 0 9 0 20c0 15 20 32 20 32s20-17 20-32C40 9 31 0 20 0z"/></svg>';
  const savedSettings = await admin.put('/api/store-map/settings').send({
    ...currentSettings.body.data,
    title: 'Наші магазини',
    markerSvg: safeSvg
  }).expect(200);
  assert.equal(savedSettings.body.data.markerSvg, safeSvg);

  await admin.put('/api/store-map/settings').send({
    ...savedSettings.body.data,
    markerSvg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
  }).expect(422);

  const embedScript = await request(app)
    .get('/api/public/store-map/embed.js')
    .set('Host', 'maps.example.test')
    .expect('Content-Type', /javascript/)
    .expect(200);
  assert.match(embedScript.text, /store-map\/widget/);
  assert.match(embedScript.text, /iframe/);

  await admin.delete(`/api/store-map/points/${created.body.data.id}`).expect(204);
  const afterDelete = await request(app).get('/api/public/store-map').expect(200);
  assert.equal(afterDelete.body.data.points.length, 0);
});

test('XLSX-shaped rows can be previewed and imported with row-level validation', async () => {
  const rows = [
    {
      'Назва магазину': 'м. Львів, Центр',
      'Адреса': 'просп. Свободи, 1',
      'Час роботи': '09:00 - 20:00',
      'Координати': 'https://www.google.com/maps?q=49.84195,24.03159',
      'Статус': 'Активний'
    },
    {
      'Назва магазину': 'Некоректна ТТ',
      'Адреса': 'невідома адреса',
      'Час роботи': '09:00 - 18:00',
      'Координати': '1111,1111',
      'Статус': 'Активний'
    }
  ];

  const preview = await admin.post('/api/store-map/imports/preview').send({ rows }).expect(200);
  assert.equal(preview.body.data.summary.total, 2);
  assert.equal(preview.body.data.summary.create, 1);
  assert.equal(preview.body.data.summary.error, 1);
  assert.equal(preview.body.data.rows[1].action, 'error');

  const imported = await admin.post('/api/store-map/imports/commit').send({
    rows,
    importNew: true,
    updateExisting: true
  }).expect(201);
  assert.equal(imported.body.data.summary.created, 1);
  assert.equal(imported.body.data.summary.error, 1);

  const publicData = await request(app).get('/api/public/store-map').expect(200);
  assert.equal(publicData.body.data.points.length, 1);
  assert.equal(publicData.body.data.points[0].city, 'Львів');
});
