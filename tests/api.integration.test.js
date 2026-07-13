import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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

async function registerAndVerify(input) {
  const registration = await request(app)
    .post('/api/auth/register')
    .send(input)
    .expect(202);
  assert.match(registration.body.data.devCode, /^\d{6}$/);
  const verified = await request(app)
    .post('/api/auth/register/verify')
    .send({ email: input.email, code: registration.body.data.devCode })
    .expect(201);
  return verified;
}

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(secret) {
  const normalized = secret.replace(/\s+/g, '').replace(/=+$/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (const char of normalized) {
    const index = base32Alphabet.indexOf(char);
    assert.notEqual(index, -1);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function currentTotpCode(secret) {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, '0');
}

test('approval flow and shared banner storage work through REST API', async () => {
  const registration = await registerAndVerify({
    firstName: 'Test', lastName: 'User', email: 'user@test.local',
    password: 'UserPassword123!', avatarDataUrl: 'data:image/png;base64,AA=='
  });

  assert.equal(registration.body.data.status, 'approved');
  assert.equal(registration.body.data.role, 'content_manager');
  assert.equal(registration.body.data.firstName, 'Test');
  assert.equal(registration.body.data.lastName, 'User');
  assert.equal(registration.body.data.twoFactorEnabled, false);
  assert.ok(registration.headers['set-cookie']?.some((cookie) => cookie.startsWith('mt_session=')));
  assert.match(registration.body.data.avatarUrl, /^\/api\/users\/.+\/avatar\?v=/);

  await request(app)
    .post('/api/auth/login')
    .send({ email: 'user@test.local', password: 'UserPassword123!' })
    .expect(200);

  const admin = request.agent(app);
  const adminLogin = await admin
    .post('/api/auth/login')
    .send({ email: 'admin@test.local', password: 'AdminPassword123!' })
    .expect(200);
  assert.equal(adminLogin.body.data.role, 'admin');
  await admin.get(registration.body.data.avatarUrl).expect(200).expect('Content-Type', /image\/png/);

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

  const initialIntegrations = await admin.get('/api/admin/integrations').expect(200);
  assert.equal(initialIntegrations.body.data.mailtrap.configured, false);
  await admin
    .put('/api/admin/integrations/mailtrap')
    .send({
      senderEmail: 'hello@mt-panel.sbs',
      senderName: 'MT Panel',
      token: 'mailtrap_test_token_1234567890'
    })
    .expect(200)
    .expect((response) => {
      assert.equal(response.body.data.configured, true);
      assert.equal(response.body.data.senderEmail, 'hello@mt-panel.sbs');
      assert.equal(response.body.data.domain, 'mt-panel.sbs');
      assert.equal(Object.hasOwn(response.body.data, 'token'), false);
    });
  const storedIntegration = await pool.query(
    'SELECT public_config, secret_ciphertext FROM integration_settings WHERE key = $1',
    ['mailtrap']
  );
  assert.equal(storedIntegration.rows[0].public_config.senderEmail, 'hello@mt-panel.sbs');
  assert.notEqual(storedIntegration.rows[0].secret_ciphertext, 'mailtrap_test_token_1234567890');
  await admin.delete(`/api/admin/users/${adminLogin.body.data.id}`).expect(400)
    .expect((response) => assert.equal(response.body.error.code, 'SELF_DELETE'));
  const disposable = await registerAndVerify({
    name: 'Disposable User',
    email: 'delete-me@test.local',
    password: 'DeletePassword123!'
  });
  await admin.delete(`/api/admin/users/${disposable.body.data.id}`).expect(204);
  await request(app)
    .post('/api/auth/login')
    .send({ email: 'delete-me@test.local', password: 'DeletePassword123!' })
    .expect(401);

  const users = await admin.get('/api/admin/users?status=approved').expect(200);
  const pendingUser = users.body.data.find((user) => user.email === 'user@test.local');
  assert.ok(pendingUser);

  await admin
    .patch(`/api/admin/users/${pendingUser.id}/status`)
    .send({ status: 'rejected' })
    .expect(200)
    .expect((response) => assert.equal(response.body.data.status, 'rejected'));
  await request(app)
    .post('/api/auth/login')
    .send({ email: 'user@test.local', password: 'UserPassword123!' })
    .expect(403)
    .expect((response) => assert.equal(response.body.error.code, 'ACCOUNT_REJECTED'));
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
  await admin
    .put(`/api/admin/users/${pendingUser.id}/tool-access`)
    .send({ tools: ['banner_grid', 'blog_publications', 'product_selection', 'product_tables'] })
    .expect(200);

  const user = request.agent(app);
  await user
    .post('/api/auth/login')
    .send({ email: 'user@test.local', password: 'UserPassword123!' })
    .expect(200);

  const profile = await user.put('/api/users/profile').send({
    firstName: 'Test', lastName: 'User', email: 'user@test.local',
    department: 'Marketing', position: 'Editor', avatarDataUrl: 'data:image/webp;base64,AA=='
  }).expect(200);
  assert.equal(profile.body.data.department, 'Marketing');
  assert.equal(profile.body.data.position, 'Editor');
  assert.match(profile.body.data.avatarUrl, /^\/api\/users\/.+\/avatar\?v=/);
  await user.get(profile.body.data.avatarUrl).expect(200).expect('Content-Type', /image\/webp/);
  await user.put('/api/users/profile/password').send({
    currentPassword: 'WrongPassword123!', newPassword: 'UpdatedPassword123!'
  }).expect(422).expect((response) => assert.equal(response.body.error.code, 'INVALID_CURRENT_PASSWORD'));
  await user.put('/api/users/profile/password').send({
    currentPassword: 'UserPassword123!', newPassword: 'UpdatedPassword123!'
  }).expect(204);
  await request(app).post('/api/auth/login')
    .send({ email: 'user@test.local', password: 'UserPassword123!' }).expect(401);
  await request(app).post('/api/auth/login')
    .send({ email: 'user@test.local', password: 'UpdatedPassword123!' }).expect(200);

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

  const secondRegistration = await registerAndVerify({ name: 'Second User', email: 'second@test.local', password: 'SecondPassword123!' });
  assert.equal(secondRegistration.body.data.status, 'approved');

  const approvedUsers = await admin.get('/api/admin/users?status=approved').expect(200);
  const secondPendingUser = approvedUsers.body.data.find((candidate) => candidate.email === 'second@test.local');
  assert.ok(secondPendingUser);

  const secondUser = request.agent(app);
  await secondUser
    .post('/api/auth/login')
    .send({ email: 'second@test.local', password: 'SecondPassword123!' })
    .expect(200);

  const defaultToolAccess = await secondUser.get('/api/users/tool-access').expect(200);
  assert.deepEqual(defaultToolAccess.body.data, []);

  await admin.put(`/api/admin/users/${secondPendingUser.id}/tool-access`).send({ tools: [] }).expect(200);
  await secondUser.get('/api/grids').expect(403)
    .expect((response) => assert.equal(response.body.error.code, 'TOOL_ACCESS_DENIED'));
  await admin.put(`/api/admin/users/${secondPendingUser.id}/tool-access`).send({
    tools: ['banner_grid', 'blog_publications', 'product_selection', 'product_tables'],
    canManageToolAccess: true
  }).expect(200);
  await secondUser.get('/api/admin/directory?page=1&pageSize=10').expect(200);
  await secondUser.get('/api/admin/integrations').expect(403);
  await secondUser.put(`/api/admin/users/${pendingUser.id}/tool-access`).send({
    tools: ['banner_grid', 'blog_publications', 'product_selection', 'product_tables'],
    requiresTwoFactorTools: ['banner_grid']
  }).expect(403).expect((response) => assert.equal(response.body.error.code, 'PRIMARY_ADMIN_REQUIRED'));
  await secondUser.patch(`/api/admin/users/${pendingUser.id}/role`).send({ role: 'editor' }).expect(403);
  await admin.put(`/api/admin/users/${secondPendingUser.id}/tool-access`).send({
    tools: ['banner_grid', 'blog_publications', 'product_selection', 'product_tables'],
    canManageToolAccess: false
  }).expect(200);

  const initialTwoFactorStatus = await secondUser.get('/api/users/profile/2fa').expect(200);
  assert.equal(initialTwoFactorStatus.body.data.enabled, false);
  const twoFactorSetup = await secondUser.post('/api/users/profile/2fa/setup').expect(200);
  assert.match(twoFactorSetup.body.data.qrCodeDataUrl, /^data:image\/png;base64,/);
  assert.equal(twoFactorSetup.body.data.issuer, 'MT Panel');
  const secondUserTotpSecret = twoFactorSetup.body.data.manualKey.replace(/\s+/g, '');
  const twoFactorConfirm = await secondUser
    .post('/api/users/profile/2fa/confirm')
    .send({ code: currentTotpCode(secondUserTotpSecret) })
    .expect(200);
  assert.equal(twoFactorConfirm.body.data.user.twoFactorEnabled, true);
  assert.equal(twoFactorConfirm.body.data.recoveryCodes.length, 10);
  const directoryAfterTwoFactor = await admin.get('/api/admin/directory?search=second@test.local').expect(200);
  assert.equal(directoryAfterTwoFactor.body.data.items[0].twoFactorEnabled, true);

  await secondUser.post('/api/auth/logout').expect(204);
  const secondUserChallenge = await secondUser
    .post('/api/auth/login')
    .send({ email: 'second@test.local', password: 'SecondPassword123!' })
    .expect(202);
  assert.equal(secondUserChallenge.body.data.twoFactorRequired, true);
  await secondUser
    .post('/api/auth/login/2fa')
    .send({
      challengeToken: secondUserChallenge.body.data.challengeToken,
      code: `${currentTotpCode(secondUserTotpSecret)}1`
    })
    .expect(422);
  await secondUser
    .post('/api/auth/login/2fa')
    .send({
      challengeToken: secondUserChallenge.body.data.challengeToken,
      code: currentTotpCode(secondUserTotpSecret)
    })
    .expect(200)
    .expect((response) => assert.equal(response.body.data.twoFactorEnabled, true));

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

  const securityUpdate = await admin.put(`/api/admin/users/${pendingUser.id}/tool-access`).send({
    tools: ['banner_grid', 'blog_publications', 'product_selection', 'product_tables'],
    canManageToolAccess: false,
    requiresTwoFactorTools: ['banner_grid']
  }).expect(200);
  assert.deepEqual(securityUpdate.body.data.requiresTwoFactorTools, ['banner_grid']);

  const blockedCatalog = await user.get('/api/users/tool-catalog').expect(200);
  const blockedBannerTool = blockedCatalog.body.data.tools.find((tool) => tool.toolId === 'banner_grid');
  assert.equal(blockedBannerTool.granted, true);
  assert.equal(blockedBannerTool.accessible, false);
  assert.equal(blockedBannerTool.blockedByTwoFactor, true);
  await user.get('/api/grids').expect(403)
    .expect((response) => assert.equal(response.body.error.code, 'TOOL_2FA_REQUIRED'));
  await admin.get('/api/grids').expect(403)
    .expect((response) => assert.equal(response.body.error.code, 'TOOL_2FA_REQUIRED'));
  await secondUser.get('/api/grids').expect(200);
});
