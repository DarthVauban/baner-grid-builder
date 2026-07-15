import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://catalog-tests';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.COOKIE_SECURE = 'false';
process.env.CATALOG_MEDIA_DIR = path.join(os.tmpdir(), 'mt-catalog-media-tests');
process.env.ADMIN_NAME = 'Catalog Admin';
process.env.ADMIN_EMAIL = 'catalog-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');

const admin = request.agent(app);
const tinyWebp = Buffer.from('524946460000000057454250', 'hex');

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  await admin.post('/api/auth/login').send({ email: 'catalog-admin@test.local', password: 'AdminPassword123!' }).expect(200);
});

after(async () => pool.end());

test('catalog products publish to storefront, import stock updates, and create applications from storefront', async () => {
  const catalog = await admin.get('/api/users/tool-catalog').expect(200);
  const catalogTool = catalog.body.data.tools.find((item) => item.toolId === 'used_smartphones_catalog');
  assert.equal(catalogTool.accessible, true);

  const media = await admin.post('/api/catalog/media')
    .set('Content-Type', 'image/webp')
    .set('X-File-Name', 'catalog-test.png')
    .send(tinyWebp)
    .expect(201);
  assert.match(media.body.data.url, /^\/media\/catalog\/.+\.webp$/);
  assert.equal(media.body.data.mimeType, 'image/webp');

  const created = await admin.post('/api/catalog/products').send({
    name: 'iPhone 13 128GB Midnight',
    condition: 'USED',
    stockCount: 1,
    incomingCount: 0,
    priceUah: 18999,
    publicationStatus: 'DRAFT',
    slug: '',
    brandId: null,
    mainImageUrl: '',
    gallery: [],
    shortDescription: 'Tested used smartphone.',
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
    internalNotes: 'Private note'
  }).expect(201);
  assert.equal(created.body.data.productCode, 'SM-000001');
  assert.equal(created.body.data.publicationStatus, 'DRAFT');

  await admin.patch(`/api/catalog/products/${created.body.data.id}/publication-status`).send({
    status: 'PUBLISHED',
    expectedVersion: created.body.data.version
  }).expect(422);

  const updated = await admin.put(`/api/catalog/products/${created.body.data.id}`).send({
    ...created.body.data,
    brandId: null,
    mainImageUrl: 'https://example.com/iphone-13.webp',
    gallery: [],
    description: '<h2 onclick="alert(1)">Specs</h2><style>.note{color:red}</style><p><a href="javascript:alert(1)">bad link</a></p><script>window.__catalogTest = true;</script>',
    publicationStatus: 'PUBLISHED',
    expectedVersion: created.body.data.version
  }).expect(200);
  assert.equal(updated.body.data.publicationStatus, 'PUBLISHED');
  assert.equal(updated.body.data.version, 2);

  const publicList = await request(app).get('/api/storefront/products?search=iPhone').expect(200);
  assert.equal(publicList.body.data.total, 1);
  assert.equal(publicList.body.data.items[0].productCode, 'SM-000001');
  assert.equal(Object.hasOwn(publicList.body.data.items[0], 'stockCount'), false);
  assert.equal(Object.hasOwn(publicList.body.data.items[0], 'descriptionHtml'), false);
  assert.equal(Object.hasOwn(publicList.body.data.items[0], 'internalNotes'), false);

  const publicProduct = await request(app).get(`/api/storefront/products/${updated.body.data.slug}`).expect(200);
  assert.equal(publicProduct.body.data.name, 'iPhone 13 128GB Midnight');
  assert.match(publicProduct.body.data.descriptionHtml, /Specs/);
  assert.doesNotMatch(publicProduct.body.data.descriptionHtml, /script|onclick|javascript:/i);
  assert.match(publicProduct.body.data.descriptionCss, /color:red/);
  assert.match(publicProduct.body.data.descriptionJs, /__catalogTest/);
  assert.equal(Object.hasOwn(publicProduct.body.data, 'internalNotes'), false);

  const duplicatePreview = await admin.post('/api/catalog/imports/preview').send({
    rows: [
      { 'Назва': 'iPhone 13 128GB Midnight', 'Статус': 'Вживаний', 'Залишок': 2, 'В дорозі': 1, 'Ціна': 17999 },
      { 'Назва': 'iPhone 13 128GB Midnight', 'Статус': 'Вживаний', 'Залишок': 3, 'В дорозі': 0, 'Ціна': 16999 }
    ]
  }).expect(200);
  assert.equal(duplicatePreview.body.data.summary.conflict, 2);

  const importResult = await admin.post('/api/catalog/imports/commit').send({
    rows: [
      { 'Назва': 'iPhone 13 128GB Midnight', 'Статус': 'Вживаний', 'Залишок': 4, 'В дорозі': 2, 'Ціна': 17500 },
      { 'Назва': 'Samsung Galaxy S22', 'Статус': 'Відновлений', 'Залишок': 0, 'В дорозі': 5, 'Ціна': 21000 }
    ],
    importNew: true,
    updateExisting: true
  }).expect(201);
  assert.equal(importResult.body.data.summary.update, 1);
  assert.equal(importResult.body.data.summary.create, 1);

  const productAfterImport = await admin.get(`/api/catalog/products/${created.body.data.id}`).expect(200);
  assert.equal(productAfterImport.body.data.stockCount, 4);
  assert.equal(productAfterImport.body.data.incomingCount, 2);
  assert.equal(productAfterImport.body.data.priceUah, 17500);
  assert.equal(productAfterImport.body.data.publicationStatus, 'PUBLISHED');

  await admin.post('/api/forms/banks').send({
    label: 'Mono Bank',
    value: 'mono',
    active: true,
    sortOrder: 1
  }).expect(201);
  const form = await admin.post('/api/forms').send({
    name: 'Storefront credit',
    title: 'Leave a request',
    description: '',
    buttonText: 'Send',
    successMessage: 'Done',
    settings: {},
    styles: {}
  }).expect(201);
  await admin.patch(`/api/forms/${form.body.data.id}/publish`).expect(200);
  await admin.patch('/api/catalog/storefront-settings').send({
    selectedFormPublicId: form.body.data.publicId,
    publicOrigin: 'https://storefront.test'
  }).expect(200);

  const submitted = await request(app).post(`/api/storefront/products/${updated.body.data.slug}/applications`).send({
    values: {
      first_name: 'Olena',
      last_name: 'Buyer',
      phone: '+380501112233',
      bank: 'mono'
    },
    context: {
      sourceUrl: `https://storefront.test${updated.body.data.publicPath}`,
      utm_source: 'catalog'
    },
    idempotencyKey: 'catalog-product-application-1'
  }).expect(201);
  assert.equal(submitted.body.data.number, '00001');

  const applications = await admin.get('/api/applications?search=00001').expect(200);
  assert.equal(applications.body.data.total, 1);
  assert.equal(applications.body.data.items[0].source, 'storefront_catalog');
  assert.equal(applications.body.data.items[0].product.title, 'iPhone 13 128GB Midnight');
  assert.equal(applications.body.data.items[0].product.productCode, 'SM-000001');
  assert.equal(applications.body.data.items[0].product.externalProductId, created.body.data.id);

  const unavailable = await admin.put(`/api/catalog/products/${created.body.data.id}`).send({
    ...productAfterImport.body.data,
    brandId: null,
    gallery: productAfterImport.body.data.gallery || [],
    stockCount: 0,
    incomingCount: 0,
    expectedVersion: productAfterImport.body.data.version
  }).expect(200);
  assert.equal(unavailable.body.data.availability.status, 'unavailable');

  await request(app).post(`/api/storefront/products/${unavailable.body.data.slug}/applications`).send({
    values: {
      first_name: 'Olena',
      last_name: 'Buyer',
      phone: '+380501112233',
      bank: 'mono'
    },
    context: {
      sourceUrl: `https://storefront.test${unavailable.body.data.publicPath}`
    },
    idempotencyKey: 'catalog-product-unavailable-application'
  }).expect(409);
});
