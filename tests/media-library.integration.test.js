import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';

const mediaDir = await mkdtemp(path.join(os.tmpdir(), 'mt-media-library-tests-'));

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://media-library-tests';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.COOKIE_SECURE = 'false';
process.env.CATALOG_MEDIA_DIR = mediaDir;
process.env.ADMIN_NAME = 'Media Admin';
process.env.ADMIN_EMAIL = 'media-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');

const admin = request.agent(app);

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  await admin.post('/api/auth/login').send({ email: 'media-admin@test.local', password: 'AdminPassword123!' }).expect(200);
});

after(async () => {
  await pool.end();
  await rm(mediaDir, { recursive: true, force: true });
});

test('media library converts, lists, updates, serves and deletes uploaded images', async () => {
  const png = await sharp({
    create: { width: 3000, height: 1000, channels: 3, background: '#ffe101' }
  }).png().toBuffer();

  const uploaded = await admin.post('/api/media')
    .set('Content-Type', 'image/png')
    .set('X-File-Name', encodeURIComponent('Широкий банер.png'))
    .send(png)
    .expect(201);

  assert.equal(uploaded.body.data.mimeType, 'image/webp');
  assert.equal(uploaded.body.data.name, 'Широкий банер.png');
  assert.equal(uploaded.body.data.width, 2400);
  assert.equal(uploaded.body.data.height, 800);
  assert.equal(uploaded.body.data.originalSize, png.length);
  assert.match(uploaded.body.data.url, /^\/media\/catalog\/library\/.+\.webp$/);

  const served = await admin.get(uploaded.body.data.url).expect(200).expect('Content-Type', /image\/webp/);
  const metadata = await sharp(served.body).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 2400);
  assert.equal(metadata.height, 800);

  const list = await admin.get('/api/media?search=банер&page=1&pageSize=10').expect(200);
  assert.equal(list.body.data.total, 1);
  assert.equal(list.body.data.items[0].id, uploaded.body.data.id);

  const updated = await admin.patch(`/api/media/${uploaded.body.data.id}`).send({
    name: 'Hero banner.webp',
    altText: 'Головний банер статті'
  }).expect(200);
  assert.equal(updated.body.data.name, 'Hero banner.webp');
  assert.equal(updated.body.data.altText, 'Головний банер статті');

  await admin.delete(`/api/media/${uploaded.body.data.id}`).expect(204);
  await admin.get(uploaded.body.data.url).expect(404);
  const empty = await admin.get('/api/media').expect(200);
  assert.equal(empty.body.data.total, 0);
});

test('media library rejects invalid image payloads', async () => {
  const response = await admin.post('/api/media')
    .set('Content-Type', 'image/png')
    .set('X-File-Name', 'broken.png')
    .send(Buffer.from('not-an-image'))
    .expect(415);
  assert.equal(response.body.error.code, 'MEDIA_UNSUPPORTED_IMAGE');
});
