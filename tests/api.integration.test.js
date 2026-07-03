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
  assert.equal(registration.body.data.role, 'content_manager');

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

  const initialPermissions = await admin.get('/api/admin/permissions').expect(200);
  assert.equal(
    initialPermissions.body.data.find((item) => (
      item.role === 'editor' && item.resource === 'product_tables'
    )).canViewAll,
    true
  );

  const directory = await admin.get('/api/admin/directory?page=1&pageSize=10').expect(200);
  assert.equal(directory.body.data.page, 1);
  assert.equal(directory.body.data.pageSize, 10);
  assert.ok(directory.body.data.summary.total >= 2);
  assert.ok(directory.body.data.items.some((candidate) => candidate.email === 'admin@test.local'));

  const users = await admin.get('/api/admin/users?status=pending').expect(200);
  const pendingUser = users.body.data.find((user) => user.email === 'user@test.local');
  assert.ok(pendingUser);

  await admin
    .patch(`/api/admin/users/${pendingUser.id}/status`)
    .send({ status: 'approved' })
    .expect(200)
    .expect((response) => assert.equal(response.body.data.status, 'approved'));

  await admin
    .patch(`/api/admin/users/${pendingUser.id}/role`)
    .send({ role: 'editor' })
    .expect(200)
    .expect((response) => assert.equal(response.body.data.role, 'editor'));
  await admin
    .patch(`/api/admin/users/${pendingUser.id}/role`)
    .send({ role: 'content_manager' })
    .expect(200);

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

  const privateGrids = await secondUser.get('/api/grids?search=Updated').expect(200);
  assert.equal(privateGrids.body.data.length, 0);
  const privateBanners = await secondUser.get('/api/banners?search=Sale').expect(200);
  assert.equal(privateBanners.body.data.length, 0);

  await admin
    .patch('/api/admin/permissions')
    .send({ role: 'content_manager', resource: 'banner_grids', canViewAll: true })
    .expect(200);
  await admin
    .patch('/api/admin/permissions')
    .send({ role: 'content_manager', resource: 'saved_banners', canViewAll: true })
    .expect(200);

  const sharedGrids = await secondUser.get('/api/grids?search=Updated').expect(200);
  assert.equal(sharedGrids.body.data.length, 1);
  assert.equal(sharedGrids.body.data[0].isOwner, false);
  assert.equal(sharedGrids.body.data[0].owner.name, 'Test User');

  const sharedBanners = await secondUser.get('/api/banners?search=Sale').expect(200);
  assert.equal(sharedBanners.body.data.length, 1);
  assert.equal(sharedBanners.body.data[0].isOwner, false);
  assert.equal(sharedBanners.body.data[0].owner.name, 'Test User');

  const tableData = {
    activeSheet: 'Товари',
    sheets: [{
      name: 'Товари',
      headers: ['Назва товару', 'Колір'],
      showCompletedStatus: true,
      showUploadedStatus: true,
      rows: [
        { sourceIndex: 1, values: ['Смартфон', 'Чорний'], completed: false, uploaded: false },
        { sourceIndex: 2, values: ['Навушники', 'Білі'], completed: true, uploaded: true }
      ]
    }]
  };
  const createdTable = await user
    .post('/api/product-tables')
    .send({ name: 'Характеристики товарів', fileName: 'products.xlsx', data: tableData })
    .expect(201);
  assert.equal(createdTable.body.data.rowCount, 2);
  assert.equal(createdTable.body.data.data.sheets[0].rows[1].completed, true);
  assert.equal(createdTable.body.data.data.sheets[0].rows[1].uploaded, true);
  assert.equal(createdTable.body.data.data.sheets[0].showCompletedStatus, true);
  assert.equal(createdTable.body.data.data.sheets[0].showUploadedStatus, true);

  const tableId = createdTable.body.data.id;
  const tableList = await user.get('/api/product-tables?search=Характеристики').expect(200);
  assert.equal(tableList.body.data.length, 1);
  assert.equal(Object.hasOwn(tableList.body.data[0], 'data'), false);

  const updatedTableData = structuredClone(tableData);
  updatedTableData.sheets[0].rows[0].completed = true;
  updatedTableData.sheets[0].rows[0].uploaded = true;
  await user
    .put(`/api/product-tables/${tableId}`)
    .send({ name: 'Готові характеристики', fileName: 'products.xlsx', data: updatedTableData })
    .expect(200)
    .expect((response) => {
      assert.equal(response.body.data.name, 'Готові характеристики');
      assert.equal(response.body.data.data.sheets[0].rows[0].completed, true);
      assert.equal(response.body.data.data.sheets[0].rows[0].uploaded, true);
    });

  await secondUser.get(`/api/product-tables/${tableId}`).expect(404);
  const privateTables = await secondUser.get('/api/product-tables').expect(200);
  assert.equal(privateTables.body.data.length, 0);

  await admin
    .patch('/api/admin/permissions')
    .send({ role: 'content_manager', resource: 'product_tables', canViewAll: true })
    .expect(200);
  const sharedTables = await secondUser.get('/api/product-tables').expect(200);
  assert.equal(sharedTables.body.data.length, 1);
  assert.equal(sharedTables.body.data[0].isOwner, false);
  await secondUser
    .get(`/api/product-tables/${tableId}`)
    .expect(200)
    .expect((response) => assert.equal(response.body.data.isOwner, false));

  await secondUser.get(`/api/grids/${gridId}`).expect(200);
  await secondUser.get(`/api/banners/${createdBanner.body.data.id}`).expect(200);
  await secondUser
    .put(`/api/grids/${gridId}`)
    .send({ name: 'Forbidden update', shareDescription: '', banners: [bannerData] })
    .expect(404);
  await secondUser.delete(`/api/grids/${gridId}`).expect(404);
  await secondUser.delete(`/api/banners/${createdBanner.body.data.id}`).expect(404);
  await secondUser
    .put(`/api/product-tables/${tableId}`)
    .send({ name: 'Forbidden table update', fileName: 'products.xlsx', data: updatedTableData })
    .expect(404);
  await secondUser.delete(`/api/product-tables/${tableId}`).expect(404);

  await request(app).get('/api/grids').expect(401);
  await user.delete(`/api/grids/${gridId}`).expect(204);
  await user.delete(`/api/banners/${createdBanner.body.data.id}`).expect(204);
  await user.delete(`/api/product-tables/${tableId}`).expect(204);
  await user.get(`/api/product-tables/${tableId}`).expect(404);
});
