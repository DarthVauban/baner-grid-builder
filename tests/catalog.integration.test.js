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

  const jsonMedia = await admin.post('/api/catalog/media').send({
    webpBase64: tinyWebp.toString('base64'),
    webpName: 'catalog-json.webp',
    originalName: 'catalog-json.png',
    originalMimeType: 'image/png'
  }).expect(201);
  assert.match(jsonMedia.body.data.url, /^\/media\/catalog\/.+\.webp$/);
  assert.equal(jsonMedia.body.data.originalUrl, '');

  const tooLargeWebp = Buffer.concat([Buffer.from('524946460000000057454250', 'hex'), Buffer.alloc((3 * 1024 * 1024) + 1)]);
  const mediaTooLarge = await admin.post('/api/catalog/media')
    .set('Content-Type', 'image/webp')
    .set('X-File-Name', 'too-large.webp')
    .send(tooLargeWebp)
    .expect(413);
  assert.match(mediaTooLarge.body.error.message, /3/);

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
    description: '.tab .content{color:blue}<h2 onclick="alert(1)">Specs</h2><style>.note{color:red}</style><p><a href="javascript:alert(1)">bad link</a></p><script>window.__catalogTest = true;</script>',
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
  assert.doesNotMatch(publicProduct.body.data.descriptionHtml, /\.tab \.content/);
  assert.doesNotMatch(publicProduct.body.data.descriptionHtml, /script|onclick|javascript:/i);
  assert.match(publicProduct.body.data.descriptionCss, /\.tab \.content/);
  assert.match(publicProduct.body.data.descriptionCss, /color:red/);
  assert.match(publicProduct.body.data.descriptionJs, /__catalogTest/);
  assert.equal(Object.hasOwn(publicProduct.body.data, 'internalNotes'), false);

  const template = await admin.post('/api/catalog/characteristic-templates').send({
    label: 'Smartphone basics',
    description: 'Core buyer-facing specs',
    active: true,
    sortOrder: 1,
    fields: [
      { key: 'storage', label: 'Storage', type: 'select', unit: 'GB', options: ['128', '256'], required: true, filterable: true, isModifier: true, sortOrder: 0 },
      { key: 'battery_health', label: 'Battery health', type: 'number', unit: '%', options: [], required: false, filterable: true, sortOrder: 1 },
      { key: 'colors', label: 'Colors', type: 'multiselect', unit: '', options: ['Midnight', 'Blue'], required: false, filterable: true, isModifier: true, sortOrder: 2 },
      { key: 'face_id', label: 'Face ID', type: 'boolean', unit: '', options: [], required: false, filterable: false, sortOrder: 3 }
    ]
  }).expect(201);
  assert.equal(template.body.data.fields.length, 4);

  const productWithCharacteristics = await admin.put(`/api/catalog/products/${created.body.data.id}/characteristics`).send({
    templateId: template.body.data.id,
    expectedVersion: updated.body.data.version,
    values: {
      storage: '128',
      battery_health: 91,
      colors: ['Midnight'],
      face_id: true
    }
  }).expect(200);
  assert.equal(productWithCharacteristics.body.data.version, 3);

  const savedCharacteristics = await admin.get(`/api/catalog/products/${created.body.data.id}/characteristics`).expect(200);
  assert.equal(savedCharacteristics.body.data.templateId, template.body.data.id);
  assert.equal(savedCharacteristics.body.data.values.storage, '128');
  assert.equal(savedCharacteristics.body.data.values.battery_health, 91);
  assert.deepEqual(savedCharacteristics.body.data.values.colors, ['Midnight']);
  assert.equal(savedCharacteristics.body.data.values.face_id, true);

  const publicProductWithCharacteristics = await request(app).get(`/api/storefront/products/${updated.body.data.slug}`).expect(200);
  assert.equal(publicProductWithCharacteristics.body.data.characteristics.templateId, template.body.data.id);
  assert.deepEqual(
    publicProductWithCharacteristics.body.data.characteristics.items.map((item) => [item.key, item.displayValue]),
    [
      ['storage', '128 GB'],
      ['battery_health', '91 %'],
      ['colors', 'Midnight'],
      ['face_id', 'Так']
    ]
  );

  const variant = await admin.post('/api/catalog/products').send({
    name: 'iPhone 13 256GB Midnight',
    condition: 'USED',
    stockCount: 1,
    incomingCount: 0,
    priceUah: 20999,
    publicationStatus: 'DRAFT',
    slug: '',
    brandId: null,
    mainImageUrl: 'https://example.com/iphone-13-256.webp',
    gallery: [],
    shortDescription: 'Storage variant.',
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
  }).expect(201);

  const variantWithCharacteristics = await admin.put(`/api/catalog/products/${variant.body.data.id}/characteristics`).send({
    templateId: template.body.data.id,
    expectedVersion: variant.body.data.version,
    values: {
      storage: '256',
      battery_health: 88,
      colors: ['Midnight'],
      face_id: true
    }
  }).expect(200);
  assert.equal(variantWithCharacteristics.body.data.version, 2);

  const productWithModifications = await admin.put(`/api/catalog/products/${created.body.data.id}/modifications`).send({
    groupId: null,
    groupLabel: 'iPhone 13 Midnight',
    mainProductId: created.body.data.id,
    productIds: [created.body.data.id, variant.body.data.id],
    expectedVersion: productWithCharacteristics.body.data.version
  }).expect(200);
  assert.equal(productWithModifications.body.data.version, 4);

  const savedModifications = await admin.get(`/api/catalog/products/${created.body.data.id}/modifications`).expect(200);
  assert.equal(savedModifications.body.data.groupLabel, 'iPhone 13 Midnight');
  assert.equal(savedModifications.body.data.mainProductId, created.body.data.id);
  assert.deepEqual(savedModifications.body.data.items.map((item) => item.id), [created.body.data.id, variant.body.data.id]);
  assert.equal(savedModifications.body.data.parameters[0].currentValueLabel, '128 GB');

  const publicProductWithModifications = await request(app).get(`/api/storefront/products/${updated.body.data.slug}`).expect(200);
  assert.equal(publicProductWithModifications.body.data.modifications.groupLabel, 'iPhone 13 Midnight');
  const publicStorageParameter = publicProductWithModifications.body.data.modifications.parameters.find((parameter) => parameter.key === 'storage');
  assert.ok(publicStorageParameter);
  assert.deepEqual(
    publicStorageParameter.options.map((option) => [option.label, option.selected, option.product?.slug || null]),
    [
      ['128 GB', true, updated.body.data.slug],
      ['256 GB', false, variant.body.data.slug]
    ]
  );
  const publicColorParameter = publicProductWithModifications.body.data.modifications.parameters.find((parameter) => parameter.key === 'colors');
  assert.ok(publicColorParameter);
  assert.deepEqual(
    publicColorParameter.options.map((option) => [option.label, option.selected, option.product?.slug || null, option.product?.mainImageUrl || null]),
    [
      ['Midnight', true, updated.body.data.slug, 'https://example.com/iphone-13.webp']
    ]
  );

  const publicDraftChildVariant = await request(app).get(`/api/storefront/products/${variant.body.data.slug}`).expect(200);
  assert.equal(publicDraftChildVariant.body.data.productCode, 'SM-000002');
  assert.equal(publicDraftChildVariant.body.data.modifications.mainProductId, created.body.data.id);
  const publicDraftStorageParameter = publicDraftChildVariant.body.data.modifications.parameters.find((parameter) => parameter.key === 'storage');
  assert.ok(publicDraftStorageParameter);
  assert.deepEqual(
    publicDraftStorageParameter.options.map((option) => [option.label, option.selected, option.product?.slug || null]),
    [
      ['128 GB', false, updated.body.data.slug],
      ['256 GB', true, variant.body.data.slug]
    ]
  );

  const groupedCatalogList = await admin.get('/api/catalog/products?search=iPhone&pageSize=25').expect(200);
  const groupedMain = groupedCatalogList.body.data.items.find((item) => item.id === created.body.data.id);
  assert.equal(groupedMain.modificationGroup.isMain, true);
  assert.equal(groupedMain.modificationGroup.childCount, 1);
  assert.equal(groupedMain.modificationChildren[0].id, variant.body.data.id);

  await admin.delete(`/api/catalog/products/${variant.body.data.id}`).send({
    expectedVersion: variantWithCharacteristics.body.data.version
  }).expect(204);

  const archivedVariant = await admin.get(`/api/catalog/products/${variant.body.data.id}`).expect(200);
  assert.equal(archivedVariant.body.data.publicationStatus, 'ARCHIVED');

  const catalogAfterVariantDelete = await admin.get('/api/catalog/products?search=iPhone&pageSize=25').expect(200);
  assert.equal(catalogAfterVariantDelete.body.data.items.some((item) => item.id === variant.body.data.id), false);
  const mainAfterVariantDelete = catalogAfterVariantDelete.body.data.items.find((item) => item.id === created.body.data.id);
  assert.equal(mainAfterVariantDelete.modificationGroup.childCount, 0);

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
