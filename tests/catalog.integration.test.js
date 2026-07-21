import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://catalog-tests';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.COOKIE_SECURE = 'false';
delete process.env.STOREFRONT_ORIGIN;
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

  const defaultDirectories = await admin.get('/api/catalog/brand-directories').expect(200);
  assert.equal(defaultDirectories.body.data.some((directory) => directory.label === 'Бренди смартфонів'), true);

  const brandDirectory = await admin.post('/api/catalog/brand-directories').send({
    label: 'Виробники смартфонів',
    description: 'Тестовий довідник брендів',
    active: true,
    sortOrder: 0
  }).expect(201);
  const bulkBrands = await admin.post('/api/catalog/brands/bulk').send({
    directoryId: brandDirectory.body.data.id,
    labels: ['Xiaomi', 'Apple', 'Samsung', 'Apple']
  }).expect(201);
  assert.equal(bulkBrands.body.data.created.length, 3);
  const duplicateBulkBrands = await admin.post('/api/catalog/brands/bulk').send({
    directoryId: brandDirectory.body.data.id,
    labels: ['Apple', 'Google']
  }).expect(201);
  assert.equal(duplicateBulkBrands.body.data.created.length, 1);
  assert.deepEqual(duplicateBulkBrands.body.data.skipped, ['Apple']);
  const directoryBrands = await admin.get(`/api/catalog/brands?directoryId=${brandDirectory.body.data.id}`).expect(200);
  assert.deepEqual(directoryBrands.body.data.map((brand) => brand.label), ['Apple', 'Google', 'Samsung', 'Xiaomi']);
  const appleBrand = directoryBrands.body.data.find((brand) => brand.label === 'Apple');
  assert.equal(appleBrand.directoryId, brandDirectory.body.data.id);

  const media = await admin.post('/api/catalog/media')
    .set('Content-Type', 'image/webp')
    .set('X-File-Name', 'catalog-test.png')
    .send(tinyWebp)
    .expect(201);
  assert.match(media.body.data.url, /^\/media\/catalog\/.+\.webp$/);
  assert.equal(media.body.data.mimeType, 'image/webp');
  await admin.get(media.body.data.url)
    .expect(200)
    .expect('Content-Type', /image\/webp/);

  const appleBrandWithLogo = await admin.patch(`/api/catalog/brands/${appleBrand.id}`).send({
    directoryId: appleBrand.directoryId,
    label: appleBrand.label,
    logoUrl: media.body.data.url,
    active: appleBrand.active,
    sortOrder: appleBrand.sortOrder
  }).expect(200);
  assert.equal(appleBrandWithLogo.body.data.logoUrl, media.body.data.url);

  const jsonMedia = await admin.post('/api/catalog/media').send({
    webpBase64: tinyWebp.toString('base64'),
    webpName: 'catalog-json.webp',
    originalName: 'catalog-json.png',
    originalMimeType: 'image/png'
  }).expect(201);
  assert.match(jsonMedia.body.data.url, /^\/media\/catalog\/.+\.webp$/);
  assert.equal(jsonMedia.body.data.originalUrl, '');

  const fourMegabyteWebp = Buffer.alloc(4 * 1024 * 1024);
  tinyWebp.copy(fourMegabyteWebp);
  const acceptedLargeMedia = await admin.post('/api/catalog/media')
    .set('Content-Type', 'image/webp')
    .set('X-File-Name', 'large-but-allowed.webp')
    .send(fourMegabyteWebp)
    .expect(201);
  assert.equal(acceptedLargeMedia.body.data.size, fourMegabyteWebp.length);

  const tooLargeWebp = Buffer.alloc((5 * 1024 * 1024) + 1);
  tinyWebp.copy(tooLargeWebp);
  const mediaTooLarge = await admin.post('/api/catalog/media')
    .set('Content-Type', 'image/webp')
    .set('X-File-Name', 'too-large.webp')
    .send(tooLargeWebp)
    .expect(413);
  assert.match(mediaTooLarge.body.error.message, /5/);

  const created = await admin.post('/api/catalog/products').send({
    name: 'iPhone 13 128GB Midnight',
    condition: 'USED',
    stockCount: 1,
    incomingCount: 0,
    priceUah: 18999,
    publicationStatus: 'DRAFT',
    slug: '',
    brandId: appleBrand.id,
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
  assert.equal(created.body.data.brand.directoryId, brandDirectory.body.data.id);
  assert.equal(created.body.data.brand.logoUrl, media.body.data.url);

  await admin.patch(`/api/catalog/products/${created.body.data.id}/publication-status`).send({
    status: 'PUBLISHED',
    expectedVersion: created.body.data.version
  }).expect(422);

  const updated = await admin.put(`/api/catalog/products/${created.body.data.id}`).send({
    ...created.body.data,
    brandId: appleBrand.id,
    mainImageUrl: 'https://example.com/iphone-13.webp',
    gallery: [],
    description: '.tab .content{color:blue}<section id="specs" data-product-section="details"><h2 onclick="alert(1)">Specs</h2></section><style>.note{color:red}</style><p><a href="javascript:alert(1)">bad link</a></p><script>window.__catalogTest = true;</script>',
    seoTitle: 'Certified iPhone 13 128GB',
    seoDescription: 'Buy a tested iPhone 13 from Mobile Trend.',
    socialDescription: 'Tested iPhone 13 ready to order.',
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
  assert.equal(publicProduct.body.data.brand.logoUrl, media.body.data.url);
  assert.match(publicProduct.body.data.descriptionHtml, /Specs/);
  assert.match(publicProduct.body.data.descriptionHtml, /<section id="specs" data-product-section="details">/);
  assert.doesNotMatch(publicProduct.body.data.descriptionHtml, /\.tab \.content/);
  assert.doesNotMatch(publicProduct.body.data.descriptionHtml, /script|onclick|javascript:/i);
  assert.match(publicProduct.body.data.descriptionCss, /\.tab \.content/);
  assert.match(publicProduct.body.data.descriptionCss, /color:red/);
  assert.match(publicProduct.body.data.descriptionJs, /__catalogTest/);
  assert.equal(publicProduct.body.data.seoTitle, 'Certified iPhone 13 128GB');
  assert.equal(publicProduct.body.data.seoDescription, 'Buy a tested iPhone 13 from Mobile Trend.');
  assert.equal(publicProduct.body.data.socialDescription, 'Tested iPhone 13 ready to order.');
  assert.equal(Object.hasOwn(publicProduct.body.data, 'internalNotes'), false);

  const template = await admin.post('/api/catalog/characteristic-templates').send({
    label: 'Smartphone basics',
    description: 'Core buyer-facing specs',
    active: true,
    sortOrder: 1,
    fields: [
      { key: 'storage', label: 'Storage', type: 'select', unit: 'GB', options: ['128', '256'], required: true, filterable: true, isModifier: true, sortOrder: 0 },
      { key: 'battery_health', label: 'Battery health', type: 'number', unit: '%', options: [], required: false, filterable: true, sortOrder: 1 },
      { key: 'colors', label: 'Colors', type: 'multiselect', unit: '', options: ['Midnight', 'Green', 'Blue'], required: false, filterable: true, isModifier: true, sortOrder: 2 },
      { key: 'shell_color', label: 'Shell color', type: 'color', unit: '', options: [], required: false, filterable: true, sortOrder: 3 },
      { key: 'face_id', label: 'Face ID', type: 'boolean', unit: '', options: [], required: false, filterable: false, sortOrder: 4 }
    ]
  }).expect(201);
  assert.equal(template.body.data.fields.length, 5);
  assert.deepEqual(template.body.data.fields.map((field) => field.key), ['storage', 'battery_health', 'colors', 'shell_color', 'face_id']);

  const laptopTemplate = await admin.post('/api/catalog/characteristic-templates').send({
    label: 'Laptop basics',
    description: 'Independent laptop specs',
    active: true,
    sortOrder: 2,
    fields: [
      { key: 'storage', label: 'Storage', type: 'number', unit: 'GB', options: [], required: false, filterable: true, sortOrder: 0 },
      { key: 'ignored_manual_key', label: 'Процесор', type: 'text', unit: '', options: [], required: false, filterable: true, sortOrder: 1 }
    ]
  }).expect(201);
  assert.deepEqual(laptopTemplate.body.data.fields.map((field) => field.key), ['storage', 'protsesor']);

  const productWithCharacteristics = await admin.put(`/api/catalog/products/${created.body.data.id}/characteristics`).send({
    templateId: template.body.data.id,
    expectedVersion: updated.body.data.version,
    values: {
      storage: '128',
      battery_health: 91,
      colors: ['Midnight'],
      shell_color: { name: 'Graphite', hex: '#222222' },
      face_id: true
    }
  }).expect(200);
  assert.equal(productWithCharacteristics.body.data.version, 3);

  const savedCharacteristics = await admin.get(`/api/catalog/products/${created.body.data.id}/characteristics`).expect(200);
  assert.equal(savedCharacteristics.body.data.templateId, template.body.data.id);
  assert.equal(savedCharacteristics.body.data.values.storage, '128');
  assert.equal(savedCharacteristics.body.data.values.battery_health, 91);
  assert.deepEqual(savedCharacteristics.body.data.values.colors, ['Midnight']);
  assert.deepEqual(savedCharacteristics.body.data.values.shell_color, { name: 'Graphite', hex: '#222222' });
  assert.equal(savedCharacteristics.body.data.values.face_id, true);

  const publicProductWithCharacteristics = await request(app).get(`/api/storefront/products/${updated.body.data.slug}`).expect(200);
  assert.equal(publicProductWithCharacteristics.body.data.characteristics.templateId, template.body.data.id);
  assert.deepEqual(
    publicProductWithCharacteristics.body.data.characteristics.items.map((item) => [item.key, item.displayValue]),
    [
      ['storage', '128 GB'],
      ['battery_health', '91 %'],
      ['colors', 'Midnight'],
      ['shell_color', 'Graphite'],
      ['face_id', 'Так']
    ]
  );

  const variant = await admin.post('/api/catalog/products').send({
    name: 'iPhone 13 256GB Green',
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
      colors: ['Green'],
      shell_color: { name: 'Green', hex: '#00aa66' },
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
    publicStorageParameter.options.map((option) => [option.label, option.selected, option.compatible, option.product?.slug || null]),
    [
      ['128 GB', true, true, updated.body.data.slug],
      ['256 GB', false, false, variant.body.data.slug]
    ]
  );
  const publicColorParameter = publicProductWithModifications.body.data.modifications.parameters.find((parameter) => parameter.key === 'colors');
  assert.ok(publicColorParameter);
  assert.deepEqual(
    publicColorParameter.options.map((option) => [option.label, option.selected, option.compatible, option.product?.slug || null, option.product?.mainImageUrl || null]),
    [
      ['Midnight', true, true, updated.body.data.slug, 'https://example.com/iphone-13.webp'],
      ['Green', false, false, variant.body.data.slug, 'https://example.com/iphone-13-256.webp']
    ]
  );

  const publicGroupedList = await request(app).get('/api/storefront/products?search=iPhone').expect(200);
  assert.equal(publicGroupedList.body.data.total, 2);
  assert.deepEqual(
    publicGroupedList.body.data.items.map((item) => item.productCode).sort(),
    ['SM-000001', 'SM-000002']
  );

  const storefrontFilters = await request(app)
    .get(`/api/storefront/products?brandId=${appleBrand.id}&priceMin=18000&priceMax=19000&characteristics=${encodeURIComponent(JSON.stringify({ storage: ['128'] }))}`)
    .expect(200);
  assert.equal(storefrontFilters.body.data.total, 1);
  assert.equal(storefrontFilters.body.data.items[0].productCode, 'SM-000001');
  assert.equal(
    storefrontFilters.body.data.items[0].characteristics.items.find((item) => item.key === 'storage').displayValue,
    '128 GB'
  );
  assert.equal(storefrontFilters.body.data.items[0].modifications.parameters.length, 2);
  const storageFilter = storefrontFilters.body.data.filters.characteristics.find((filter) => filter.key === 'storage');
  assert.ok(storageFilter);
  assert.deepEqual(storageFilter.options.map((option) => [option.value, option.label, option.count]), [
    ['128', '128 GB', 1],
    ['256', '256 GB', 1]
  ]);

  const publicDraftChildVariant = await request(app).get(`/api/storefront/products/${variant.body.data.slug}`).expect(200);
  assert.equal(publicDraftChildVariant.body.data.productCode, 'SM-000002');
  assert.equal(publicDraftChildVariant.body.data.modifications.mainProductId, created.body.data.id);
  const publicDraftStorageParameter = publicDraftChildVariant.body.data.modifications.parameters.find((parameter) => parameter.key === 'storage');
  assert.ok(publicDraftStorageParameter);
  assert.deepEqual(
    publicDraftStorageParameter.options.map((option) => [option.label, option.selected, option.compatible, option.product?.slug || null]),
    [
      ['128 GB', false, false, updated.body.data.slug],
      ['256 GB', true, true, variant.body.data.slug]
    ]
  );
  const publicDraftColorParameter = publicDraftChildVariant.body.data.modifications.parameters.find((parameter) => parameter.key === 'colors');
  assert.ok(publicDraftColorParameter);
  assert.deepEqual(
    publicDraftColorParameter.options.map((option) => [option.label, option.selected, option.compatible, option.product?.slug || null]),
    [
      ['Midnight', false, false, updated.body.data.slug],
      ['Green', true, true, variant.body.data.slug]
    ]
  );

  await admin.put(`/api/catalog/characteristic-templates/${template.body.data.id}`).send({
    label: 'Smartphone basics',
    description: 'Core buyer-facing specs',
    active: true,
    sortOrder: 1,
    fields: [
      { key: 'colors', label: 'Colors', type: 'multiselect', unit: '', options: ['Midnight', 'Green', 'Blue'], required: false, filterable: true, isModifier: true, sortOrder: 0 },
      { key: 'storage', label: 'Storage', type: 'select', unit: 'GB', options: ['128', '256'], required: true, filterable: true, isModifier: true, sortOrder: 1 },
      { key: 'battery_health', label: 'Battery health', type: 'number', unit: '%', options: [], required: false, filterable: true, sortOrder: 2 },
      { key: 'shell_color', label: 'Shell color', type: 'color', unit: '', options: [], required: false, filterable: true, sortOrder: 3 },
      { key: 'face_id', label: 'Face ID', type: 'boolean', unit: '', options: [], required: false, filterable: false, sortOrder: 4 }
    ]
  }).expect(200);

  const publicAfterTemplateReorder = await request(app).get(`/api/storefront/products/${updated.body.data.slug}`).expect(200);
  assert.deepEqual(
    publicAfterTemplateReorder.body.data.characteristics.items.map((item) => item.key),
    ['colors', 'storage', 'battery_health', 'shell_color', 'face_id']
  );
  const storageAfterTemplateReorder = publicAfterTemplateReorder.body.data.modifications.parameters.find((parameter) => parameter.key === 'storage');
  assert.ok(storageAfterTemplateReorder);
  assert.deepEqual(
    storageAfterTemplateReorder.options.map((option) => [option.label, option.product?.slug || null]),
    [
      ['128 GB', updated.body.data.slug],
      ['256 GB', variant.body.data.slug]
    ]
  );
  const colorAfterTemplateReorder = publicAfterTemplateReorder.body.data.modifications.parameters.find((parameter) => parameter.key === 'colors');
  assert.ok(colorAfterTemplateReorder);
  assert.deepEqual(
    colorAfterTemplateReorder.options.map((option) => [option.label, option.product?.slug || null]),
    [
      ['Midnight', updated.body.data.slug],
      ['Green', variant.body.data.slug]
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

  async function createDeleteGroupProduct(name) {
    return admin.post('/api/catalog/products').send({
      name,
      condition: 'USED',
      stockCount: 1,
      incomingCount: 0,
      priceUah: 1000,
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
    }).expect(201);
  }

  const promoteMain = await createDeleteGroupProduct('Delete group promote main');
  const promoteChild = await createDeleteGroupProduct('Delete group promote child');
  const promotedGroup = await admin.put(`/api/catalog/products/${promoteMain.body.data.id}/modifications`).send({
    groupId: null,
    groupLabel: 'Delete group promote',
    mainProductId: promoteMain.body.data.id,
    productIds: [promoteMain.body.data.id, promoteChild.body.data.id],
    expectedVersion: promoteMain.body.data.version
  }).expect(200);

  await admin.delete(`/api/catalog/products/${promoteMain.body.data.id}`).send({
    expectedVersion: promotedGroup.body.data.version,
    groupAction: 'promote',
    newMainProductId: promoteChild.body.data.id
  }).expect(204);

  const archivedPromoteMain = await admin.get(`/api/catalog/products/${promoteMain.body.data.id}`).expect(200);
  assert.equal(archivedPromoteMain.body.data.publicationStatus, 'ARCHIVED');
  const promotedChild = await admin.get(`/api/catalog/products/${promoteChild.body.data.id}`).expect(200);
  assert.equal(promotedChild.body.data.publicationStatus, 'DRAFT');
  const promotedCatalog = await admin.get('/api/catalog/products?search=Delete%20group%20promote&pageSize=25').expect(200);
  const promotedChildRow = promotedCatalog.body.data.items.find((item) => item.id === promoteChild.body.data.id);
  assert.equal(promotedChildRow.modificationGroup.isMain, true);
  assert.equal(promotedChildRow.modificationGroup.childCount, 0);

  const disbandMain = await createDeleteGroupProduct('Delete group disband main');
  const disbandChild = await createDeleteGroupProduct('Delete group disband child');
  const disbandGroup = await admin.put(`/api/catalog/products/${disbandMain.body.data.id}/modifications`).send({
    groupId: null,
    groupLabel: 'Delete group disband',
    mainProductId: disbandMain.body.data.id,
    productIds: [disbandMain.body.data.id, disbandChild.body.data.id],
    expectedVersion: disbandMain.body.data.version
  }).expect(200);

  await admin.delete(`/api/catalog/products/${disbandMain.body.data.id}`).send({
    expectedVersion: disbandGroup.body.data.version,
    groupAction: 'disband'
  }).expect(204);

  const disbandCatalog = await admin.get('/api/catalog/products?search=Delete%20group%20disband&pageSize=25').expect(200);
  const disbandChildRow = disbandCatalog.body.data.items.find((item) => item.id === disbandChild.body.data.id);
  assert.equal(disbandChildRow.publicationStatus, 'DRAFT');
  assert.equal(disbandChildRow.modificationGroup, undefined);

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
    publicOrigin: 'javascript:alert(1)'
  }).expect(422);
  const savedStorefrontSettings = await admin.patch('/api/catalog/storefront-settings').send({
    selectedFormPublicId: form.body.data.publicId,
    publicOrigin: 'https://used.example.test/catalog/'
  }).expect(200);
  assert.equal(savedStorefrontSettings.body.data.storefrontTheme.typography.bodyFontFamily, 'Inter');
  assert.equal(savedStorefrontSettings.body.data.storefrontTheme.header.logoUrl, '');
  assert.equal(savedStorefrontSettings.body.data.productCardTheme.button.label, 'Купити');
  assert.equal(savedStorefrontSettings.body.data.productPageTheme.layout.galleryWidth, 50);
  assert.equal(savedStorefrontSettings.body.data.productPageTheme.gallery.imageScale, 72);

  const storefrontTheme = structuredClone(savedStorefrontSettings.body.data.storefrontTheme);
  const productCardTheme = structuredClone(savedStorefrontSettings.body.data.productCardTheme);
  const productPageTheme = structuredClone(savedStorefrontSettings.body.data.productPageTheme);
  storefrontTheme.typography.bodyFontFamily = 'Unbounded';
  storefrontTheme.typography.headingFontFamily = 'Unbounded';
  storefrontTheme.typography.headingWeight = 900;
  storefrontTheme.layout.columnsDesktop = 5;
  storefrontTheme.header.logoUrl = '/media/catalog/storefront-logo.webp';
  storefrontTheme.header.logoLink = 'https://mobiletrend.com.ua';
  storefrontTheme.header.logoHeight = 54;
  storefrontTheme.filters.titleColor = '#102030';
  storefrontTheme.filters.activeColor = '#405060';
  storefrontTheme.filters.mobileButtonBackground = '#708090';
  productCardTheme.button.label = 'Замовити';
  productCardTheme.contentOrder = ['image', 'title', 'badge', 'brand', 'meta'];
  productCardTheme.image.fit = 'contain';
  productPageTheme.layout.galleryWidth = 45;
  productPageTheme.gallery.imageScale = 64;
  productPageTheme.gallery.showCounter = false;
  productPageTheme.button.label = 'Замовити смартфон';
  productPageTheme.tabs.descriptionLabel = 'Детальний огляд';

  await admin.patch('/api/catalog/storefront-settings').send({ storefrontTheme, productCardTheme, productPageTheme }).expect(200);
  const publicStorefrontSettings = await request(app).get('/api/storefront/settings').expect(200);
  assert.equal(publicStorefrontSettings.body.data.selectedFormPublicId, form.body.data.publicId);
  assert.equal(publicStorefrontSettings.body.data.publicOrigin, 'https://used.example.test');
  assert.equal(publicStorefrontSettings.body.data.storefrontTheme.typography.bodyFontFamily, 'Unbounded');
  assert.equal(publicStorefrontSettings.body.data.storefrontTheme.typography.headingWeight, 900);
  assert.equal(publicStorefrontSettings.body.data.storefrontTheme.layout.columnsDesktop, 5);
  assert.equal(publicStorefrontSettings.body.data.storefrontTheme.header.logoUrl, '/media/catalog/storefront-logo.webp');
  assert.equal(publicStorefrontSettings.body.data.storefrontTheme.header.logoLink, 'https://mobiletrend.com.ua');
  assert.equal(publicStorefrontSettings.body.data.storefrontTheme.header.logoHeight, 54);
  assert.equal(publicStorefrontSettings.body.data.storefrontTheme.filters.titleColor, '#102030');
  assert.equal(publicStorefrontSettings.body.data.storefrontTheme.filters.activeColor, '#405060');
  assert.equal(publicStorefrontSettings.body.data.storefrontTheme.filters.mobileButtonBackground, '#708090');
  assert.equal(publicStorefrontSettings.body.data.productCardTheme.button.label, 'Замовити');
  assert.deepEqual(publicStorefrontSettings.body.data.productCardTheme.contentOrder, ['image', 'title', 'badge', 'brand', 'meta']);
  assert.equal(publicStorefrontSettings.body.data.productPageTheme.layout.galleryWidth, 45);
  assert.equal(publicStorefrontSettings.body.data.productPageTheme.gallery.imageScale, 64);
  assert.equal(publicStorefrontSettings.body.data.productPageTheme.gallery.showCounter, false);
  assert.equal(publicStorefrontSettings.body.data.productPageTheme.button.label, 'Замовити смартфон');
  assert.equal(publicStorefrontSettings.body.data.productPageTheme.tabs.descriptionLabel, 'Детальний огляд');

  const submitted = await request(app)
    .post(`/api/storefront/products/${updated.body.data.slug}/applications`)
    .set('Host', 'used.example.test')
    .set('x-forwarded-proto', 'https')
    .send({
      values: {
        first_name: 'Olena',
        last_name: 'Buyer',
        phone: '+380501112233',
        bank: 'mono'
      },
      context: {
        sourceUrl: 'https://used.example.test/',
        pageTitle: 'Mobile Trend — смартфони',
        utm_source: 'catalog'
      },
      idempotencyKey: 'catalog-product-application-1'
    })
    .expect(201);
  assert.equal(submitted.body.data.number, '00001');

  const applications = await admin.get('/api/applications?search=00001').expect(200);
  assert.equal(applications.body.data.total, 1);
  assert.equal(applications.body.data.items[0].source, 'storefront_catalog');
  assert.equal(applications.body.data.items[0].product.title, 'iPhone 13 128GB Midnight');
  assert.equal(applications.body.data.items[0].product.productCode, 'SM-000001');
  assert.equal(applications.body.data.items[0].product.externalProductId, created.body.data.id);
  assert.equal(applications.body.data.items[0].sourceUrl, `https://used.example.test/smartphones/${updated.body.data.slug}`);
  assert.equal(applications.body.data.items[0].pageTitle, 'iPhone 13 128GB Midnight');

  await request(app)
    .post(`/api/catalog/preview/products/${updated.body.data.slug}/applications`)
    .send({ values: {}, context: {}, idempotencyKey: 'anonymous-preview-application' })
    .expect(401);

  const previewSubmitted = await admin
    .post(`/api/catalog/preview/products/${updated.body.data.slug}/applications`)
    .set('x-forwarded-host', 'panel.test')
    .set('x-forwarded-proto', 'https')
    .send({
      values: {
        first_name: 'Test',
        last_name: 'Customer',
        phone: '+380509998877',
        bank: 'mono'
      },
      context: {
        sourceUrl: 'https://panel.test/catalog/preview/storefront',
        pageTitle: 'Mobile Trend — смартфони'
      },
      idempotencyKey: 'catalog-preview-application-1'
    })
    .expect(201);
  assert.equal(previewSubmitted.body.data.number, '00002');

  const previewApplications = await admin.get('/api/applications?search=00002').expect(200);
  assert.equal(previewApplications.body.data.total, 1);
  assert.equal(previewApplications.body.data.items[0].source, 'storefront_catalog_preview');
  assert.equal(previewApplications.body.data.items[0].product.title, 'iPhone 13 128GB Midnight');
  assert.equal(previewApplications.body.data.items[0].product.productCode, 'SM-000001');
  assert.equal(previewApplications.body.data.items[0].sourceUrl, `https://panel.test/catalog/preview/storefront/smartphones/${updated.body.data.slug}`);
  assert.equal(previewApplications.body.data.items[0].pageTitle, 'iPhone 13 128GB Midnight');

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
