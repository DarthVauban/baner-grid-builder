import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://auth-rate-limit-tests';
process.env.JWT_SECRET = 'test-only-jwt-secret-at-least-32-characters';
process.env.COOKIE_SECURE = 'false';
process.env.APP_BUILD_SHA = 'test-build-sha';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');

before(async () => {
  await runMigrations();
});

after(async () => {
  await pool.end();
});

test('auth attempt limiting returns 429 without blocking session checks or mobile polling', async () => {
  const officeIp = '198.51.100.60';

  for (let attempt = 0; attempt < 60; attempt += 1) {
    await request(app)
      .post('/api/auth/login/2fa')
      .set('X-Forwarded-For', officeIp)
      .send({})
      .expect(422);
  }

  const limited = await request(app)
    .post('/api/auth/login/2fa')
    .set('X-Forwarded-For', officeIp)
    .send({})
    .expect(429);
  assert.equal(limited.body.error.code, 'TOO_MANY_REQUESTS');

  await request(app)
    .get('/api/auth/me')
    .set('X-Forwarded-For', officeIp)
    .expect(401);

  await request(app)
    .post('/api/auth/login/mobile/status')
    .set('X-Forwarded-For', officeIp)
    .send({})
    .expect(422);

  await request(app)
    .post('/api/auth/login/mobile/cancel')
    .set('X-Forwarded-For', officeIp)
    .send({})
    .expect(422);

  await request(app)
    .get('/api/health')
    .set('X-Forwarded-For', officeIp)
    .expect(200);
});
