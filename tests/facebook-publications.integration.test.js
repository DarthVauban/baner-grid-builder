import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://facebook-publications-integration-tests';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.COOKIE_SECURE = 'false';
process.env.ADMIN_NAME = 'Facebook Publications Admin';
process.env.ADMIN_EMAIL = 'facebook-publications-admin@test.local';
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
    .send({ email: 'facebook-publications-admin@test.local', password: 'AdminPassword123!' })
    .expect(200);
});

after(async () => pool.end());

test('manual Facebook campaign keeps snapshots, optional post URL and rejected retry history', async () => {
  const kyiv = await admin.post('/api/facebook-publications/stores').send({
    code: 'KYIV-01',
    name: 'Mobile Trend Київ Центр',
    city: 'Київ',
    address: 'вул. Хрещатик, 1',
    notes: '',
    status: 'active'
  }).expect(201);
  const otherKyiv = await admin.post('/api/facebook-publications/stores').send({
    code: 'KYIV-02',
    name: 'Mobile Trend Київ Позняки',
    city: 'Київ',
    address: 'вул. Анни Ахматової, 14',
    notes: '',
    status: 'active'
  }).expect(201);
  const group = await admin.post('/api/facebook-publications/groups').send({
    name: 'Новини Києва',
    url: 'https://facebook.com/groups/kyiv.news/',
    city: 'Київ',
    defaultStoreId: kyiv.body.data.id,
    notes: 'Публікація у будні',
    advertisingPolicy: 'allowed',
    moderationRequired: true,
    recommendedIntervalDays: 14,
    status: 'active'
  }).expect(201);
  assert.equal(group.body.data.url, 'https://www.facebook.com/groups/kyiv.news');

  const image = await admin.post('/api/facebook-publications/assets')
    .set('Content-Type', 'image/png')
    .set('X-File-Name', encodeURIComponent('qr-banner.png'))
    .send(Buffer.from('fake-png-content'))
    .expect(201);
  assert.equal(image.body.data.fileName, 'qr-banner.png');

  const campaign = await admin.post('/api/facebook-publications/campaigns').send({
    title: 'Серпнева кампанія',
    promotion: 'до -15%',
    plannedDate: '2026-08-04',
    textVariants: ['Акція {{promotion}} у місті {{city}}. Адреса: {{address}}'],
    assetId: image.body.data.id,
    selections: [{ groupId: group.body.data.id, storeId: otherKyiv.body.data.id }]
  });
  assert.equal(campaign.status, 201, campaign.text);
  assert.equal(campaign.body.data.targets.length, 1);
  assert.equal(campaign.body.data.targets[0].address, 'вул. Анни Ахматової, 14');
  assert.equal(campaign.body.data.targets[0].renderedText, 'Акція до -15% у місті Київ. Адреса: вул. Анни Ахматової, 14');
  assert.ok(campaign.body.data.targets[0].warnings.some((warning) => warning.includes('модерацію')));

  const targetId = campaign.body.data.targets[0].id;
  const published = await admin.patch(`/api/facebook-publications/targets/${targetId}`).send({
    status: 'published',
    postUrl: '',
    note: 'Опубліковано вручну'
  }).expect(200);
  assert.equal(published.body.data.status, 'published');
  assert.equal(published.body.data.postUrl, '');
  assert.ok(published.body.data.publishedAt);

  const risk = await admin.get('/api/facebook-publications/risk-summary').expect(200);
  assert.equal(risk.body.data.lastFifteenMinutes, 1);

  const campaignList = await admin.get('/api/facebook-publications/campaigns').expect(200);
  assert.equal(campaignList.body.data.length, 1);
  assert.equal(campaignList.body.data[0].counts.published, 1);

  const groups = await admin.get('/api/facebook-publications/groups').expect(200);
  assert.ok(groups.body.data[0].lastPublishedAt);

  await admin.patch(`/api/facebook-publications/targets/${targetId}`).send({
    status: 'rejected',
    note: 'Модератор не прийняв пост'
  }).expect(200);
  const retry = await admin.post(`/api/facebook-publications/targets/${targetId}/retry`).expect(201);
  assert.equal(retry.body.data.status, 'not_started');
  assert.equal(retry.body.data.retryOfTargetId, targetId);

  const detail = await admin.get(`/api/facebook-publications/campaigns/${campaign.body.data.id}`).expect(200);
  assert.equal(detail.body.data.targets.length, 2);
  assert.ok(detail.body.data.targets.some((target) => target.status === 'rejected'));
  assert.ok(detail.body.data.targets.some((target) => target.retryOfTargetId === targetId));

  const history = await admin.get('/api/facebook-publications/history').expect(200);
  assert.equal(history.body.data.length, 2);

  const servedImage = await admin.get(`/api/facebook-publications/assets/${image.body.data.id}`).expect(200);
  assert.equal(servedImage.headers['content-type'], 'image/png');
  assert.equal(servedImage.body.toString(), 'fake-png-content');
});

test('XLSX-shaped stores and groups preview row errors and commit valid rows', async () => {
  const payload = {
    stores: [
      {
        'Код магазину': 'BILA-01',
        'Назва': 'Mobile Trend Біла Церква',
        'Місто': 'Біла Церква',
        'Адреса': 'вул. Ярослава Мудрого, 10',
        'Активний': 'Так'
      }
    ],
    groups: [
      {
        'Назва групи': 'Біла Церква Online',
        'Посилання': 'https://www.facebook.com/groups/bila.online',
        'Місто': 'Біла Церква',
        'Код магазину': 'BILA-01',
        'Реклама': 'Дозволена',
        'Модерація': 'Ні',
        'Частота, днів': '10',
        'Статус': 'Активна'
      },
      {
        'Назва групи': 'Некоректна група',
        'Посилання': 'https://example.com/not-facebook',
        'Місто': 'Біла Церква',
        'Код магазину': 'BILA-01'
      }
    ]
  };

  const preview = await admin.post('/api/facebook-publications/imports/preview').send(payload).expect(200);
  assert.equal(preview.body.data.stores.summary.create, 1);
  assert.equal(preview.body.data.groups.summary.create, 1);
  assert.equal(preview.body.data.groups.summary.error, 1);

  const committed = await admin.post('/api/facebook-publications/imports/commit').send(payload).expect(201);
  assert.equal(committed.body.data.stores.created, 1);
  assert.equal(committed.body.data.groups.created, 1);
  assert.equal(committed.body.data.groups.errors, 1);

  const importedGroups = await admin.get('/api/facebook-publications/groups?search=Біла').expect(200);
  assert.equal(importedGroups.body.data.length, 1);
  assert.equal(importedGroups.body.data[0].recommendedIntervalDays, 10);
});
