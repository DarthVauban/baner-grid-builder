import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://banner-builder-tests';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.COOKIE_SECURE = 'false';
process.env.ADMIN_NAME = 'Test Admin';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
});

after(async () => {
  await pool.end();
});

test('approval flow and shared banner storage work through REST API', async () => {
  const registration = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Test User', email: 'user@test.local', password: 'UserPassword123!' })
    .expect(201);

  assert.equal(registration.body.data.status, 'pending');

  await request(app)
    .post('/api/auth/login')
    .send({ email: 'user@test.local', password: 'UserPassword123!' })
    .expect(403)
    .expect((response) => assert.equal(response.body.error.code, 'ACCOUNT_PENDING'));

  const admin = request.agent(app);
  const adminLogin = await admin
    .post('/api/auth/login')
    .send({ email: 'admin@test.local', password: 'AdminPassword123!' })
    .expect(200);
  assert.equal(adminLogin.body.data.role, 'admin');

  const users = await admin.get('/api/admin/users?status=pending').expect(200);
  const pendingUser = users.body.data.find((user) => user.email === 'user@test.local');
  assert.ok(pendingUser);

  await admin
    .patch(`/api/admin/users/${pendingUser.id}/status`)
    .send({ status: 'approved' })
    .expect(200)
    .expect((response) => assert.equal(response.body.data.status, 'approved'));

  const user = request.agent(app);
  await user
    .post('/api/auth/login')
    .send({ email: 'user@test.local', password: 'UserPassword123!' })
    .expect(200);

  const bannerData = {
    title: 'Sale -20%',
    endDate: '2026-12-31',
    endTime: '20:00',
    imageUrl: 'https://example.com/banner.jpg',
    targetUrl: 'https://example.com/sale',
    disableWhenExpired: true
  };

  const createdBanner = await user
    .post('/api/banners')
    .send({ name: 'Sale banner', banner: bannerData })
    .expect(201);
  assert.equal(createdBanner.body.data.banner.title, 'Sale -20%');

  const createdGrid = await user
    .post('/api/grids')
    .send({ name: 'Main grid', shareDescription: 'Campaign', banners: [bannerData] })
    .expect(201);
  assert.equal(createdGrid.body.data.banners.length, 1);

  const gridId = createdGrid.body.data.id;
  await user
    .put(`/api/grids/${gridId}`)
    .send({ name: 'Updated grid', shareDescription: 'Updated', banners: [bannerData] })
    .expect(200)
    .expect((response) => assert.equal(response.body.data.name, 'Updated grid'));

  const grids = await user.get('/api/grids?search=Updated').expect(200);
  assert.equal(grids.body.data.length, 1);
  assert.equal(grids.body.data[0].isOwner, true);
  assert.equal(grids.body.data[0].owner.name, 'Test User');

  await request(app)
    .post('/api/auth/register')
    .send({ name: 'Second User', email: 'second@test.local', password: 'SecondPassword123!' })
    .expect(201);

  const pendingUsers = await admin.get('/api/admin/users?status=pending').expect(200);
  const secondPendingUser = pendingUsers.body.data.find((candidate) => candidate.email === 'second@test.local');
  assert.ok(secondPendingUser);

  await admin
    .patch(`/api/admin/users/${secondPendingUser.id}/status`)
    .send({ status: 'approved' })
    .expect(200);

  const secondUser = request.agent(app);
  await secondUser
    .post('/api/auth/login')
    .send({ email: 'second@test.local', password: 'SecondPassword123!' })
    .expect(200);

  const sharedGrids = await secondUser.get('/api/grids?search=Updated').expect(200);
  assert.equal(sharedGrids.body.data.length, 1);
  assert.equal(sharedGrids.body.data[0].isOwner, false);
  assert.equal(sharedGrids.body.data[0].owner.name, 'Test User');

  const sharedBanners = await secondUser.get('/api/banners?search=Sale').expect(200);
  assert.equal(sharedBanners.body.data.length, 1);
  assert.equal(sharedBanners.body.data[0].isOwner, false);
  assert.equal(sharedBanners.body.data[0].owner.name, 'Test User');

  await secondUser.get(`/api/grids/${gridId}`).expect(200);
  await secondUser.get(`/api/banners/${createdBanner.body.data.id}`).expect(200);
  await secondUser
    .put(`/api/grids/${gridId}`)
    .send({ name: 'Forbidden update', shareDescription: '', banners: [bannerData] })
    .expect(404);
  await secondUser.delete(`/api/grids/${gridId}`).expect(404);
  await secondUser.delete(`/api/banners/${createdBanner.body.data.id}`).expect(404);

  await request(app).get('/api/grids').expect(401);
  await user.delete(`/api/grids/${gridId}`).expect(204);
  await user.delete(`/api/banners/${createdBanner.body.data.id}`).expect(204);
});
