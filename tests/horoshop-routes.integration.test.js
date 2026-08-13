import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://horoshop-routes-tests';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.COOKIE_SECURE = 'false';
process.env.ADMIN_NAME = 'Horoshop Admin';
process.env.ADMIN_EMAIL = 'horoshop-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');

const admin = request.agent(app);

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  await admin.post('/api/auth/login').send({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD
  }).expect(200);
});

after(async () => {
  await pool.end();
});

test('Horoshop integration state is admin-only, non-cacheable and never contains credentials', async () => {
  await request(app).get('/api/admin/integrations/horoshop').expect(401);
  const response = await admin.get('/api/admin/integrations/horoshop').expect(200);
  assert.match(response.headers['cache-control'], /no-store/u);
  assert.deepEqual(response.body.data, {
    configured: false,
    status: 'disconnected',
    storeDomain: '',
    pollingIntervalMinutes: null,
    lastSyncAt: null,
    lastError: null,
    counts: { categories: 0, products: 0, modifications: 0 },
    latestRun: null
  });
  assert.equal(JSON.stringify(response.body).includes('password'), false);
  assert.equal(JSON.stringify(response.body).includes('token'), false);
  assert.equal(JSON.stringify(response.body).includes('encryptedCredentials'), false);
});
