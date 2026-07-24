import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://photo-parser-integration-tests';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.COOKIE_SECURE = 'false';
process.env.CATALOG_MEDIA_DIR = path.join(os.tmpdir(), 'mt-photo-parser-media-tests');
process.env.ADMIN_NAME = 'Photo Parser Admin';
process.env.ADMIN_EMAIL = 'photo-parser-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool, query } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');
const {
  processPhotoParserRun,
  recoverInterruptedPhotoParserRuns
} = await import('../src/modules/catalog/photo-parser.service.js');

const admin = request.agent(app);

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  await admin.post('/api/auth/login')
    .send({ email: 'photo-parser-admin@test.local', password: 'AdminPassword123!' })
    .expect(200);
});

after(async () => pool.end());

function productInput(name) {
  return {
    name,
    condition: 'USED',
    stockCount: 1,
    incomingCount: 0,
    priceUah: 10000,
    popularityPosition: 0,
    publicationStatus: 'DRAFT',
    slug: '',
    brandId: null,
    mainImageUrl: '',
    gallery: [],
    shortDescription: '',
    description: '',
    seoTitle: '',
    seoDescription: '',
    socialDescription: '',
    bodyCondition: '',
    displayCondition: '',
    batteryHealth: '',
    warranty: '',
    includedAccessories: '',
    diagnostics: {},
    internalNotes: ''
  };
}

test('photo parser API queues only products with URLs and isolates per-image failures', async () => {
  await request(app).get('/api/catalog/photo-parser/products').expect(401);
  await request(app).delete('/api/catalog/photo-parser/errors').expect(401);

  const adapters = await admin.get('/api/catalog/photo-parser/adapters').expect(200);
  assert.deepEqual(
    adapters.body.data.filter((adapter) => adapter.source === 'builtin').map((adapter) => adapter.name),
    ['Rozetka', 'COMFY', 'ALLO', 'Foxtrot']
  );
  await admin.delete('/api/catalog/photo-parser/adapters/builtin-rozetka').expect(404);

  const customAdapter = await admin.post('/api/catalog/photo-parser/adapters').send({
    name: 'Example Store',
    storeUrl: 'https://shop.example.com',
    gallerySelector: '.product-gallery img',
    fallback: false
  }).expect(201);
  assert.equal(customAdapter.body.data.host, 'shop.example.com');

  const withUrl = await admin.post('/api/catalog/products').send(productInput('Parser Phone One')).expect(201);
  const archivedWithoutUrl = await admin
    .post('/api/catalog/products')
    .send(productInput('Parser Phone Without URL'))
    .expect(201);
  await admin
    .delete(`/api/catalog/products/${archivedWithoutUrl.body.data.id}`)
    .send({ expectedVersion: archivedWithoutUrl.body.data.version })
    .expect(204);
  await admin
    .patch(`/api/catalog/photo-parser/products/${archivedWithoutUrl.body.data.id}/source-url`)
    .send({ sourceUrl: 'https://shop.example.com/products/archived-phone' })
    .expect(404);
  const savedUrl = await admin
    .patch(`/api/catalog/photo-parser/products/${withUrl.body.data.id}/source-url`)
    .send({ sourceUrl: 'shop.example.com/products/phone-one' })
    .expect(200);
  assert.equal(savedUrl.body.data.sourceUrl, 'https://shop.example.com/products/phone-one');

  const missingProducts = await admin
    .get('/api/catalog/photo-parser/products?photoStatus=missing&pageSize=10')
    .expect(200);
  assert.equal(missingProducts.body.data.total, 1);
  assert.equal(missingProducts.body.data.summary.withPhotos, 0);
  assert.equal(missingProducts.body.data.summary.withoutPhotos, 1);
  assert.equal(
    missingProducts.body.data.items.find((item) => item.id === withUrl.body.data.id).sourceUrl,
    'https://shop.example.com/products/phone-one'
  );

  const batch = await admin.post('/api/catalog/photo-parser/batches').send({
    search: 'Parser Phone',
    photoStatus: 'missing'
  }).expect(201);
  assert.equal(batch.body.data.requestedCount, 1);
  assert.equal(batch.body.data.items[0].productId, withUrl.body.data.id);

  const runResult = await query(
    'SELECT * FROM used_smartphone_photo_parser_runs WHERE batch_id = $1',
    [batch.body.data.id]
  );
  const run = runResult.rows[0];
  const redPng = await sharp({
    create: { width: 500, height: 500, channels: 3, background: '#c92a2a' }
  }).png().toBuffer();
  const bluePng = await sharp({
    create: { width: 540, height: 480, channels: 3, background: '#2459c4' }
  }).png().toBuffer();
  let storageAttempts = 0;
  const processed = await processPhotoParserRun(run, {
    scrape: async () => ({
      title: 'Parser Phone One',
      pageUrl: run.source_url,
      adapterId: customAdapter.body.data.id,
      diagnostics: {
        candidates: 4,
        selectorMatches: 3,
        selectorImages: 3,
        downloaded: 3
      },
      images: [
        { sourceUrl: 'https://cdn.example.com/red.png', buffer: redPng },
        { sourceUrl: 'https://cdn.example.com/blue.png', buffer: bluePng },
        { sourceUrl: 'https://cdn.example.com/broken.png', buffer: Buffer.from('broken') }
      ],
      errors: [{
        sourceUrl: 'https://cdn.example.com/missing.png',
        stage: 'download',
        message: 'HTTP 404'
      }]
    }),
    saveAsset: async ({ webpBuffer }) => {
      storageAttempts += 1;
      const metadata = await sharp(webpBuffer).metadata();
      assert.equal(metadata.format, 'webp');
      if (storageAttempts === 1) throw new Error('Temporary storage error');
      return {
        url: `/media/catalog/parser-${storageAttempts}.webp`,
        filename: `parser-${storageAttempts}.webp`,
        size: webpBuffer.length,
        mimeType: 'image/webp'
      };
    }
  });
  assert.equal(processed.status, 'partial');
  assert.equal(processed.savedCount, 1);
  assert.equal(processed.errors.length, 3);
  assert.deepEqual(processed.errors.map((error) => error.stage).sort(), ['convert', 'download', 'storage']);

  const completedBatch = await admin
    .get(`/api/catalog/photo-parser/batches/${batch.body.data.id}`)
    .expect(200);
  assert.equal(completedBatch.body.data.status, 'completed');
  assert.equal(completedBatch.body.data.counts.partial, 1);
  assert.equal(completedBatch.body.data.items[0].savedCount, 1);

  await query(
    `UPDATE used_smartphone_photo_parser_batches
     SET status = 'running', completed_at = NULL
     WHERE id = $1`,
    [batch.body.data.id]
  );
  const activeAfterFailure = await admin
    .get('/api/catalog/photo-parser/batches/active')
    .expect(200);
  assert.equal(activeAfterFailure.body.data, null);

  await query(
    `UPDATE used_smartphone_photo_parser_batches
     SET status = 'running', completed_at = NULL
     WHERE id = $1`,
    [batch.body.data.id]
  );
  const repairedBatch = await admin
    .get(`/api/catalog/photo-parser/batches/${batch.body.data.id}`)
    .expect(200);
  assert.equal(repairedBatch.body.data.status, 'completed');
  assert.ok(repairedBatch.body.data.completedAt);

  await query(
    `UPDATE used_smartphone_photo_parser_batches
     SET status = 'running', completed_at = NULL
     WHERE id = $1`,
    [batch.body.data.id]
  );
  await recoverInterruptedPhotoParserRuns();
  const recoveredStatus = await query(
    `SELECT status, completed_at
     FROM used_smartphone_photo_parser_batches
     WHERE id = $1`,
    [batch.body.data.id]
  );
  assert.equal(recoveredStatus.rows[0].status, 'completed');
  assert.ok(recoveredStatus.rows[0].completed_at);

  const product = await admin.get(`/api/catalog/products/${withUrl.body.data.id}`).expect(200);
  assert.equal(product.body.data.mainImageUrl, '/media/catalog/parser-2.webp');
  assert.equal(product.body.data.gallery.length, 1);
  const parserAudit = await query(
    `SELECT changes
     FROM used_smartphone_audit_log
     WHERE product_id = $1 AND action = 'photo_parser_import'
     ORDER BY created_at DESC
     LIMIT 1`,
    [withUrl.body.data.id]
  );
  assert.deepEqual(parserAudit.rows[0].changes.fields, ['mainImageUrl', 'gallery']);
  assert.equal(parserAudit.rows[0].changes.before.mainImageUrl, '');
  assert.equal(parserAudit.rows[0].changes.after.mainImageUrl, '/media/catalog/parser-2.webp');
  assert.equal(parserAudit.rows[0].changes.after.gallery[0].url, '/media/catalog/parser-2.webp');

  const errors = await admin.get('/api/catalog/photo-parser/errors?search=Parser Phone').expect(200);
  assert.equal(errors.body.data.total, 1);
  assert.equal(errors.body.data.items[0].errors.length, 3);

  const presentProducts = await admin
    .get('/api/catalog/photo-parser/products?photoStatus=present&pageSize=10')
    .expect(200);
  assert.equal(presentProducts.body.data.total, 1);
  assert.equal(presentProducts.body.data.items[0].photoCount, 1);
  assert.equal(presentProducts.body.data.items[0].latestRun.status, 'partial');

  const cleared = await admin.delete('/api/catalog/photo-parser/errors').expect(200);
  assert.equal(cleared.body.data.clearedCount, 1);
  const errorsAfterClear = await admin.get('/api/catalog/photo-parser/errors').expect(200);
  assert.equal(errorsAfterClear.body.data.total, 0);
  const productsAfterClear = await admin
    .get('/api/catalog/photo-parser/products?photoStatus=present&pageSize=10')
    .expect(200);
  assert.equal(productsAfterClear.body.data.items[0].latestRun, null);
  const clearedAgain = await admin.delete('/api/catalog/photo-parser/errors').expect(200);
  assert.equal(clearedAgain.body.data.clearedCount, 0);

  await admin.post('/api/catalog/photo-parser/batches').send({
    search: 'Without URL',
    photoStatus: 'missing'
  }).expect(422);

  await admin.delete(`/api/catalog/photo-parser/adapters/${customAdapter.body.data.id}`).expect(204);
});
