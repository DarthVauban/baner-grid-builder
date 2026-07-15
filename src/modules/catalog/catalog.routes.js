import { Router, raw } from 'express';
import { z } from 'zod';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import { publishChatUpdates } from '../chat/chat.events.js';
import { canSaveCatalogSourceJs, prepareCatalogDescription } from './catalog.content.js';
import {
  publishCatalogUpdates,
  publishPublicCatalogUpdate,
  subscribeToCatalogUpdates
} from './catalog.events.js';
import { saveCatalogMediaAsset } from './catalog.media.js';
import {
  analyzeImportRows,
  catalogToolId,
  commitImportRows,
  conditionLabels,
  generateProductCode,
  getCatalogRecipientIds,
  loadCatalogProduct,
  loadPreviewProduct,
  logCatalogAudit,
  makeUniqueSlug,
  normalizeProductName,
  productConditions,
  productSelect,
  publicationStatuses,
  publicationStatusLabels,
  serializeBrand,
  serializeCatalogProduct,
  serializePublicCatalogProduct,
  validatePublicationReady
} from './catalog.service.js';

const router = Router();
router.use(requireAuth, requireToolAccess(catalogToolId));

const idSchema = z.string().uuid();
const listSchema = z.object({
  search: z.string().trim().max(120).default(''),
  condition: z.enum(['all', ...productConditions]).default('all'),
  status: z.enum(['all', ...publicationStatuses]).default('all'),
  availability: z.enum(['all', 'in_stock', 'incoming', 'unavailable']).default('all'),
  sort: z.enum(['updated_desc', 'name_asc', 'price_asc', 'price_desc', 'stock_asc', 'stock_desc']).default('updated_desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25)
});
const galleryItemSchema = z.object({
  url: z.string().trim().max(4000),
  alt: z.string().trim().max(240).default('')
});
const productInputSchema = z.object({
  name: z.string().trim().min(1).max(240),
  condition: z.enum(productConditions),
  stockCount: z.coerce.number().int().min(0).default(0),
  incomingCount: z.coerce.number().int().min(0).default(0),
  priceUah: z.coerce.number().min(0).max(99999999).default(0),
  publicationStatus: z.enum(publicationStatuses).default('DRAFT'),
  slug: z.string().trim().max(260).default(''),
  brandId: z.string().uuid().nullable().optional(),
  mainImageUrl: z.string().trim().max(4000).default(''),
  gallery: z.array(galleryItemSchema).max(20).default([]),
  shortDescription: z.string().trim().max(1200).default(''),
  description: z.string().trim().max(12000).default(''),
  seoTitle: z.string().trim().max(240).default(''),
  seoDescription: z.string().trim().max(500).default(''),
  socialDescription: z.string().trim().max(500).default(''),
  bodyCondition: z.string().trim().max(120).default(''),
  displayCondition: z.string().trim().max(120).default(''),
  batteryHealth: z.string().trim().max(120).default(''),
  warranty: z.string().trim().max(160).default(''),
  includedAccessories: z.string().trim().max(3000).default(''),
  diagnostics: z.record(z.string(), z.unknown()).default({}),
  internalNotes: z.string().trim().max(6000).default('')
});
const updateProductSchema = productInputSchema.extend({
  expectedVersion: z.coerce.number().int().min(1)
});
const statusSchema = z.object({
  status: z.enum(publicationStatuses),
  expectedVersion: z.coerce.number().int().min(1)
});
const brandInputSchema = z.object({
  label: z.string().trim().min(1).max(160),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(-9999).max(9999).default(0)
});
const importPreviewSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).max(5000).default([])
});
const importCommitSchema = importPreviewSchema.extend({
  importNew: z.boolean().default(true),
  updateExisting: z.boolean().default(true)
});
const settingsSchema = z.object({
  selectedFormPublicId: z.string().uuid().nullable().optional(),
  publicOrigin: z.string().trim().max(500).default('')
});
const mediaUploadSchema = z.object({
  webpBase64: z.string().min(1),
  webpName: z.string().trim().max(240).default('catalog-photo.webp'),
  originalBase64: z.string().optional().default(''),
  originalName: z.string().trim().max(240).optional().default(''),
  originalMimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']).optional().default('image/webp')
});
const mediaPatchSchema = z.object({
  mainImageUrl: z.string().trim().max(4000).default(''),
  gallery: z.array(galleryItemSchema).max(20).default([]),
  expectedVersion: z.coerce.number().int().min(1)
});

const sortSql = {
  updated_desc: 'product.updated_at DESC',
  name_asc: 'lower(product.name) ASC, product.created_at DESC',
  price_asc: 'product.price_uah ASC, lower(product.name) ASC',
  price_desc: 'product.price_uah DESC, lower(product.name) ASC',
  stock_asc: 'product.stock_count ASC, lower(product.name) ASC',
  stock_desc: 'product.stock_count DESC, lower(product.name) ASC'
};

function uniqueViolation(error) {
  return error?.code === '23505' || /duplicate key/i.test(String(error?.message || ''));
}

function productParams(input, normalizedName, slug, userId, descriptionContent) {
  return [
    input.name,
    normalizedName,
    input.condition,
    input.stockCount,
    input.incomingCount,
    input.priceUah,
    input.publicationStatus,
    slug,
    input.brandId || null,
    input.mainImageUrl,
    JSON.stringify(input.gallery),
    input.shortDescription,
    input.description,
    descriptionContent.safeHtml,
    descriptionContent.css,
    descriptionContent.js,
    descriptionContent.hasJs,
    input.seoTitle,
    input.seoDescription,
    input.socialDescription,
    input.bodyCondition,
    input.displayCondition,
    input.batteryHealth,
    input.warranty,
    input.includedAccessories,
    JSON.stringify(input.diagnostics),
    input.internalNotes,
    userId
  ];
}

function assertPublishable(input) {
  if (input.publicationStatus === 'PUBLISHED') validatePublicationReady(input);
}

function prepareProductDescription(input, user, previousDescription = '') {
  const descriptionContent = prepareCatalogDescription(input.description || '');
  const sourceChanged = String(input.description || '') !== String(previousDescription || '');
  if (sourceChanged && descriptionContent.hasJs && !canSaveCatalogSourceJs(user)) {
    throw new AppError(403, 'CATALOG_SOURCE_JS_FORBIDDEN', 'Збереження JavaScript у джерелі опису доступне лише адміністратору каталогу.');
  }
  return { ...descriptionContent, sourceChanged };
}

function bufferFromBase64(value) {
  const source = String(value || '');
  const base64 = source.includes(',') ? source.split(',').pop() : source;
  return Buffer.from(base64 || '', 'base64');
}

function serializeMedia(row) {
  return {
    id: row.id,
    productId: row.product_id || null,
    url: row.url,
    originalUrl: row.original_url || '',
    mimeType: row.mime_type || 'image/webp',
    originalMimeType: row.original_mime_type || '',
    size: Number(row.size_bytes || 0),
    originalSize: Number(row.original_size_bytes || 0),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    alt: row.alt || '',
    role: row.role || 'gallery',
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeGalleryValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function syncProductMedia(db, productId, input, actorId) {
  const items = [];
  if (input.mainImageUrl) items.push({ url: input.mainImageUrl, alt: input.name || '', role: 'main', sortOrder: 0 });
  input.gallery.forEach((item, index) => {
    if (item.url) items.push({ url: item.url, alt: item.alt || '', role: 'gallery', sortOrder: index + 1 });
  });
  await db.query('DELETE FROM used_smartphone_product_media WHERE product_id = $1', [productId]);
  for (const item of items) {
    const updated = await db.query(
      `UPDATE used_smartphone_product_media
       SET product_id = $2,
           alt = $3,
           role = $4,
           sort_order = $5,
           updated_at = NOW()
       WHERE url = $1 AND product_id IS NULL
       RETURNING *`,
      [item.url, productId, item.alt, item.role, item.sortOrder]
    );
    if (updated.rows[0]) continue;
    await db.query(
      `INSERT INTO used_smartphone_product_media (
         product_id, url, alt, role, sort_order, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [productId, item.url, item.alt, item.role, item.sortOrder, actorId]
    );
  }
}

function buildProductFilters(input) {
  const params = [];
  const where = [];
  const terms = input.search.toLocaleLowerCase('uk-UA').split(/\s+/).filter(Boolean);
  for (const term of terms) {
    params.push(`%${term}%`);
    const index = params.length;
    where.push(`(lower(product.name) LIKE $${index} OR lower(product.product_code) LIKE $${index} OR lower(product.slug) LIKE $${index})`);
  }
  if (input.condition !== 'all') {
    params.push(input.condition);
    where.push(`product.condition = $${params.length}`);
  }
  if (input.status !== 'all') {
    params.push(input.status);
    where.push(`product.publication_status = $${params.length}`);
  }
  if (input.availability === 'in_stock') where.push('product.stock_count > 0');
  if (input.availability === 'incoming') where.push('product.stock_count = 0 AND product.incoming_count > 0');
  if (input.availability === 'unavailable') where.push('product.stock_count = 0 AND product.incoming_count = 0');
  return { params, whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '' };
}

async function loadSettings(db = { query }) {
  const result = await db.query(
    `SELECT selected_form_public_id, public_origin, updated_at
     FROM used_smartphone_storefront_settings
     WHERE id = TRUE`
  );
  const row = result.rows[0] || {};
  return {
    selectedFormPublicId: row.selected_form_public_id || null,
    publicOrigin: row.public_origin || '',
    updatedAt: row.updated_at || null
  };
}

function publicWasTouched(previousStatus, nextStatus) {
  return previousStatus === 'PUBLISHED' || nextStatus === 'PUBLISHED';
}

router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const sendUpdate = (payload) => res.write(`event: catalog\ndata: ${JSON.stringify(payload)}\n\n`);
  const unsubscribe = subscribeToCatalogUpdates(req.user.id, sendUpdate);
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
  heartbeat.unref();
  res.write('event: connected\ndata: {}\n\n');
  req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
});

router.post('/media', raw({ type: 'image/webp', limit: '8mb' }), asyncHandler(async (req, res) => {
  const contentType = String(req.get('content-type') || '').toLowerCase();
  let asset;
  if (contentType.startsWith('image/webp')) {
    asset = await saveCatalogMediaAsset({
      webpBuffer: req.body,
      webpName: req.get('x-file-name') || 'catalog-photo.webp'
    });
  } else if (contentType.startsWith('application/json')) {
    const input = parseInput(mediaUploadSchema, req.body);
    asset = await saveCatalogMediaAsset({
      webpBuffer: bufferFromBase64(input.webpBase64),
      webpName: input.webpName,
      originalBuffer: input.originalBase64 ? bufferFromBase64(input.originalBase64) : null,
      originalName: input.originalName,
      originalMimeType: input.originalMimeType
    });
  } else {
    throw new AppError(415, 'CATALOG_MEDIA_UNSUPPORTED_TYPE', 'Завантажуйте фото у форматі WebP.');
  }
  const inserted = await query(
    `INSERT INTO used_smartphone_product_media (
       url, original_url, storage_key, original_storage_key, mime_type,
       original_mime_type, size_bytes, original_size_bytes, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      asset.url,
      asset.originalUrl,
      asset.filename,
      asset.originalFilename,
      asset.mimeType,
      asset.originalMimeType,
      asset.size,
      asset.originalSize,
      req.user.id
    ]
  );
  res.status(201).json({ data: serializeMedia(inserted.rows[0]) });
}));

router.get('/summary', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT
       COUNT(*)::INTEGER AS total,
       COUNT(*) FILTER (WHERE publication_status = 'DRAFT')::INTEGER AS draft,
       COUNT(*) FILTER (WHERE publication_status = 'PUBLISHED')::INTEGER AS published,
       COUNT(*) FILTER (WHERE publication_status = 'HIDDEN')::INTEGER AS hidden,
       COUNT(*) FILTER (WHERE publication_status = 'ARCHIVED')::INTEGER AS archived,
       COUNT(*) FILTER (WHERE stock_count > 0)::INTEGER AS in_stock,
       COUNT(*) FILTER (WHERE stock_count = 0 AND incoming_count > 0)::INTEGER AS incoming,
       COUNT(*) FILTER (WHERE stock_count = 0 AND incoming_count = 0)::INTEGER AS unavailable
     FROM used_smartphone_products`
  );
  const row = result.rows[0] || {};
  res.json({ data: {
    total: Number(row.total || 0),
    byStatus: {
      draft: Number(row.draft || 0),
      published: Number(row.published || 0),
      hidden: Number(row.hidden || 0),
      archived: Number(row.archived || 0)
    },
    byAvailability: {
      inStock: Number(row.in_stock || 0),
      incoming: Number(row.incoming || 0),
      unavailable: Number(row.unavailable || 0)
    }
  } });
}));

router.get('/brands', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT *
     FROM used_smartphone_brands
     ORDER BY active DESC, sort_order, lower(label)`
  );
  res.json({ data: result.rows.map(serializeBrand) });
}));

router.post('/brands', asyncHandler(async (req, res) => {
  const input = parseInput(brandInputSchema, req.body);
  try {
    const result = await query(
      `INSERT INTO used_smartphone_brands (label, active, sort_order)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.label, input.active, input.sortOrder]
    );
    res.status(201).json({ data: serializeBrand(result.rows[0]) });
  } catch (error) {
    if (uniqueViolation(error)) throw new AppError(409, 'CATALOG_BRAND_EXISTS', 'Бренд з такою назвою вже існує.');
    throw error;
  }
}));

router.patch('/brands/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(brandInputSchema.partial(), req.body);
  const current = await query('SELECT * FROM used_smartphone_brands WHERE id = $1', [id]);
  if (!current.rows[0]) throw new AppError(404, 'CATALOG_BRAND_NOT_FOUND', 'Бренд не знайдено.');
  const next = { ...serializeBrand(current.rows[0]), ...input };
  try {
    const result = await query(
      `UPDATE used_smartphone_brands
       SET label = $1, active = $2, sort_order = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [next.label, next.active, next.sortOrder, id]
    );
    res.json({ data: serializeBrand(result.rows[0]) });
  } catch (error) {
    if (uniqueViolation(error)) throw new AppError(409, 'CATALOG_BRAND_EXISTS', 'Бренд з такою назвою вже існує.');
    throw error;
  }
}));

router.get('/products', asyncHandler(async (req, res) => {
  const input = parseInput(listSchema, {
    search: String(req.query.search || ''),
    condition: req.query.condition || 'all',
    status: req.query.status || 'all',
    availability: req.query.availability || 'all',
    sort: req.query.sort || 'updated_desc',
    page: req.query.page || 1,
    pageSize: req.query.pageSize || 25
  });
  const { params, whereSql } = buildProductFilters(input);
  const totalResult = await query(`SELECT COUNT(*)::INTEGER AS count FROM used_smartphone_products AS product ${whereSql}`, params);
  const offset = (input.page - 1) * input.pageSize;
  const products = await query(
    `${productSelect}
     ${whereSql}
     ORDER BY ${sortSql[input.sort]}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, input.pageSize, offset]
  );
  const total = Number(totalResult.rows[0]?.count || 0);
  res.json({ data: {
    items: products.rows.map((row) => serializeCatalogProduct(row)),
    total,
    page: input.page,
    pageSize: input.pageSize,
    pageCount: Math.max(1, Math.ceil(total / input.pageSize))
  } });
}));

router.get('/preview/settings', asyncHandler(async (req, res) => {
  res.json({ data: { ...await loadSettings(), preview: true } });
}));

router.get('/preview/products', asyncHandler(async (req, res) => {
  const input = parseInput(listSchema, {
    search: String(req.query.search || ''),
    condition: req.query.condition || 'all',
    status: req.query.status || 'all',
    availability: req.query.availability || 'all',
    sort: req.query.sort || 'updated_desc',
    page: req.query.page || 1,
    pageSize: req.query.pageSize || 25
  });
  const filters = buildProductFilters(input);
  const whereSql = filters.whereSql
    ? `${filters.whereSql} AND product.publication_status <> 'ARCHIVED'`
    : "WHERE product.publication_status <> 'ARCHIVED'";
  const totalResult = await query(`SELECT COUNT(*)::INTEGER AS count FROM used_smartphone_products AS product ${whereSql}`, filters.params);
  const offset = (input.page - 1) * input.pageSize;
  const result = await query(
    `${productSelect}
     ${whereSql}
     ORDER BY ${sortSql[input.sort]}
     LIMIT $${filters.params.length + 1} OFFSET $${filters.params.length + 2}`,
    [...filters.params, input.pageSize, offset]
  );
  const total = Number(totalResult.rows[0]?.count || 0);
  res.json({ data: {
    items: result.rows.map((row) => serializePublicCatalogProduct(row)),
    total,
    page: input.page,
    pageSize: input.pageSize,
    pageCount: Math.max(1, Math.ceil(total / input.pageSize))
  } });
}));

router.get('/preview/products/:identifier', asyncHandler(async (req, res) => {
  const identifier = parseInput(z.string().trim().min(1).max(260), req.params.identifier);
  const product = await loadPreviewProduct(identifier);
  if (!product) throw new AppError(404, 'CATALOG_PREVIEW_PRODUCT_NOT_FOUND', 'Товар не знайдено або він архівований.');
  res.json({ data: product });
}));

router.get('/products/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const product = await loadCatalogProduct(id);
  if (!product) throw new AppError(404, 'CATALOG_PRODUCT_NOT_FOUND', 'Товар не знайдено.');
  res.json({ data: product });
}));

router.get('/products/:id/media', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const product = await query('SELECT id FROM used_smartphone_products WHERE id = $1', [id]);
  if (!product.rows[0]) throw new AppError(404, 'CATALOG_PRODUCT_NOT_FOUND', 'Товар не знайдено.');
  const result = await query(
    `SELECT *
     FROM used_smartphone_product_media
     WHERE product_id = $1
     ORDER BY role = 'main' DESC, sort_order, created_at`,
    [id]
  );
  res.json({ data: result.rows.map(serializeMedia) });
}));

router.patch('/products/:id/media', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(mediaPatchSchema, req.body);
  const client = await pool.connect();
  let product;
  let recipients = [];
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM used_smartphone_products WHERE id = $1 FOR UPDATE', [id]);
    if (!current.rows[0]) throw new AppError(404, 'CATALOG_PRODUCT_NOT_FOUND', 'Товар не знайдено.');
    if (Number(current.rows[0].version) !== input.expectedVersion) {
      throw new AppError(409, 'CATALOG_PRODUCT_VERSION_CONFLICT', 'Товар уже оновлено іншим користувачем. Відкрийте актуальну версію.');
    }
    await client.query(
      `UPDATE used_smartphone_products
       SET main_image_url = $1,
           gallery = $2::JSONB,
           updated_by = $3,
           updated_at = NOW(),
           version = version + 1
       WHERE id = $4`,
      [input.mainImageUrl, JSON.stringify(input.gallery), req.user.id, id]
    );
    await syncProductMedia(client, id, {
      name: current.rows[0].name,
      mainImageUrl: input.mainImageUrl,
      gallery: input.gallery
    }, req.user.id);
    await logCatalogAudit(client, {
      productId: id,
      actorId: req.user.id,
      action: 'media_update',
      changes: { galleryCount: input.gallery.length, hasMainImage: Boolean(input.mainImageUrl) }
    });
    recipients = await getCatalogRecipientIds(client);
    product = await loadCatalogProduct(id, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  publishCatalogUpdates(recipients, { type: 'media_updated', productId: id });
  if (product.publicationStatus === 'PUBLISHED') publishPublicCatalogUpdate({ type: 'media_updated', productId: id });
  res.json({ data: product });
}));

router.delete('/products/:id/media/:mediaId', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const mediaId = parseInput(idSchema, req.params.mediaId);
  const client = await pool.connect();
  let product;
  let recipients = [];
  try {
    await client.query('BEGIN');
    const media = await client.query(
      'SELECT * FROM used_smartphone_product_media WHERE id = $1 AND product_id = $2 FOR UPDATE',
      [mediaId, id]
    );
    if (!media.rows[0]) throw new AppError(404, 'CATALOG_MEDIA_NOT_FOUND', 'Медіа не знайдено.');
    const current = await client.query('SELECT * FROM used_smartphone_products WHERE id = $1 FOR UPDATE', [id]);
    if (!current.rows[0]) throw new AppError(404, 'CATALOG_PRODUCT_NOT_FOUND', 'Товар не знайдено.');
    const gallery = normalizeGalleryValue(current.rows[0].gallery);
    const nextGallery = gallery.filter((item) => item?.url !== media.rows[0].url);
    const nextMainImageUrl = current.rows[0].main_image_url === media.rows[0].url ? '' : current.rows[0].main_image_url;
    await client.query(
      `UPDATE used_smartphone_products
       SET main_image_url = $1,
           gallery = $2::JSONB,
           updated_by = $3,
           updated_at = NOW(),
           version = version + 1
       WHERE id = $4`,
      [nextMainImageUrl, JSON.stringify(nextGallery), req.user.id, id]
    );
    await client.query('DELETE FROM used_smartphone_product_media WHERE id = $1', [mediaId]);
    await logCatalogAudit(client, {
      productId: id,
      actorId: req.user.id,
      action: 'media_delete',
      changes: { url: media.rows[0].url }
    });
    recipients = await getCatalogRecipientIds(client);
    product = await loadCatalogProduct(id, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  publishCatalogUpdates(recipients, { type: 'media_deleted', productId: id });
  if (product.publicationStatus === 'PUBLISHED') publishPublicCatalogUpdate({ type: 'media_deleted', productId: id });
  res.status(204).end();
}));

router.post('/products', asyncHandler(async (req, res) => {
  const input = parseInput(productInputSchema, req.body);
  const normalizedName = normalizeProductName(input.name);
  if (!normalizedName) throw new AppError(422, 'CATALOG_NAME_INVALID', 'Вкажіть коректну назву товару.');
  const client = await pool.connect();
  let product;
  let recipients = [];
  try {
    await client.query('BEGIN');
    const productCode = await generateProductCode(client);
    const slug = await makeUniqueSlug(input.slug || input.name, null, client, productCode.toLowerCase());
    const descriptionContent = prepareProductDescription(input, req.user);
    assertPublishable({ ...input, slug });
    const created = await client.query(
      `INSERT INTO used_smartphone_products (
         product_code, name, normalized_name, condition, stock_count, incoming_count,
         price_uah, publication_status, slug, brand_id, main_image_url, gallery,
         short_description, description, description_safe_html, description_css, description_js,
         description_has_js, description_source_updated_at, description_source_updated_by,
         seo_title, seo_description, social_description,
         body_condition, display_condition, battery_health, warranty, included_accessories,
         diagnostics, internal_notes, created_by, updated_by
       ) VALUES (
         $29, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::JSONB,
         $12, $13, $14, $15, $16, $17, NOW(), $28,
         $18, $19, $20, $21, $22, $23, $24, $25,
         $26::JSONB, $27, $28, $28
       )
       RETURNING id`,
      [...productParams(input, normalizedName, slug, req.user.id, descriptionContent), productCode]
    );
    await syncProductMedia(client, created.rows[0].id, input, req.user.id);
    await logCatalogAudit(client, {
      productId: created.rows[0].id,
      actorId: req.user.id,
      action: 'create',
      changes: { name: input.name, condition: input.condition, publicationStatus: input.publicationStatus }
    });
    if (input.description) {
      await logCatalogAudit(client, {
        productId: created.rows[0].id,
        actorId: req.user.id,
        action: 'description_source_create',
        changes: { hasJs: descriptionContent.hasJs, hasCss: Boolean(descriptionContent.css) }
      });
    }
    recipients = await getCatalogRecipientIds(client);
    product = await loadCatalogProduct(created.rows[0].id, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (uniqueViolation(error)) throw new AppError(409, 'CATALOG_PRODUCT_EXISTS', 'Товар з такою назвою і станом або публічним шляхом уже існує.');
    throw error;
  } finally {
    client.release();
  }
  publishCatalogUpdates(recipients, { type: 'product_created', productId: product.id });
  if (product.publicationStatus === 'PUBLISHED') publishPublicCatalogUpdate({ type: 'product_published', productId: product.id });
  res.status(201).json({ data: product });
}));

router.put('/products/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(updateProductSchema, req.body);
  const normalizedName = normalizeProductName(input.name);
  if (!normalizedName) throw new AppError(422, 'CATALOG_NAME_INVALID', 'Вкажіть коректну назву товару.');
  const client = await pool.connect();
  let product;
  let recipients = [];
  let previousStatus = '';
  try {
    await client.query('BEGIN');
    const currentResult = await client.query('SELECT * FROM used_smartphone_products WHERE id = $1 FOR UPDATE', [id]);
    const current = currentResult.rows[0];
    if (!current) throw new AppError(404, 'CATALOG_PRODUCT_NOT_FOUND', 'Товар не знайдено.');
    previousStatus = current.publication_status;
    if (Number(current.version) !== input.expectedVersion) {
      throw new AppError(409, 'CATALOG_PRODUCT_VERSION_CONFLICT', 'Товар уже оновлено іншим користувачем. Відкрийте актуальну версію.');
    }
    const slug = await makeUniqueSlug(input.slug || input.name, id, client, current.product_code.toLowerCase());
    const descriptionContent = prepareProductDescription(input, req.user, current.description);
    assertPublishable({ ...input, slug });
    await client.query(
      `UPDATE used_smartphone_products
       SET name = $1,
           normalized_name = $2,
           condition = $3,
           stock_count = $4,
           incoming_count = $5,
           price_uah = $6,
           publication_status = $7,
           slug = $8,
           brand_id = $9,
           main_image_url = $10,
           gallery = $11::JSONB,
           short_description = $12,
           description = $13,
           description_safe_html = $14,
           description_css = $15,
           description_js = $16,
           description_has_js = $17,
           description_source_updated_at = CASE WHEN $29 THEN NOW() ELSE description_source_updated_at END,
           description_source_updated_by = CASE WHEN $29 THEN $28 ELSE description_source_updated_by END,
           seo_title = $18,
           seo_description = $19,
           social_description = $20,
           body_condition = $21,
           display_condition = $22,
           battery_health = $23,
           warranty = $24,
           included_accessories = $25,
           diagnostics = $26::JSONB,
           internal_notes = $27,
           updated_by = $28,
           updated_at = NOW(),
           version = version + 1
       WHERE id = $30`,
      [...productParams(input, normalizedName, slug, req.user.id, descriptionContent), descriptionContent.sourceChanged, id]
    );
    await syncProductMedia(client, id, input, req.user.id);
    await logCatalogAudit(client, {
      productId: id,
      actorId: req.user.id,
      action: 'update',
      changes: { previousStatus, publicationStatus: input.publicationStatus }
    });
    if (descriptionContent.sourceChanged) {
      await logCatalogAudit(client, {
        productId: id,
        actorId: req.user.id,
        action: 'description_source_update',
        changes: { hasJs: descriptionContent.hasJs, hasCss: Boolean(descriptionContent.css) }
      });
    }
    recipients = await getCatalogRecipientIds(client);
    product = await loadCatalogProduct(id, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (uniqueViolation(error)) throw new AppError(409, 'CATALOG_PRODUCT_EXISTS', 'Товар з такою назвою і станом або публічним шляхом уже існує.');
    throw error;
  } finally {
    client.release();
  }
  publishCatalogUpdates(recipients, { type: 'product_updated', productId: id });
  publishChatUpdates(recipients, { type: 'entity', entityType: 'catalog_product', entityId: id, senderId: req.user.id });
  if (publicWasTouched(previousStatus, product.publicationStatus)) {
    publishPublicCatalogUpdate({ type: 'product_updated', productId: id });
  }
  res.json({ data: product });
}));

router.patch('/products/:id/publication-status', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(statusSchema, req.body);
  const client = await pool.connect();
  let product;
  let recipients = [];
  let previousStatus = '';
  try {
    await client.query('BEGIN');
    const currentResult = await client.query('SELECT * FROM used_smartphone_products WHERE id = $1 FOR UPDATE', [id]);
    const current = currentResult.rows[0];
    if (!current) throw new AppError(404, 'CATALOG_PRODUCT_NOT_FOUND', 'Товар не знайдено.');
    previousStatus = current.publication_status;
    if (Number(current.version) !== input.expectedVersion) {
      throw new AppError(409, 'CATALOG_PRODUCT_VERSION_CONFLICT', 'Товар уже оновлено іншим користувачем. Відкрийте актуальну версію.');
    }
    if (input.status === 'PUBLISHED') {
      validatePublicationReady({
        name: current.name,
        condition: current.condition,
        priceUah: current.price_uah,
        mainImageUrl: current.main_image_url,
        slug: current.slug
      });
    }
    await client.query(
      `UPDATE used_smartphone_products
       SET publication_status = $1,
           updated_by = $2,
           updated_at = NOW(),
           version = version + 1
       WHERE id = $3`,
      [input.status, req.user.id, id]
    );
    await logCatalogAudit(client, {
      productId: id,
      actorId: req.user.id,
      action: 'publication_status',
      changes: { previousStatus, publicationStatus: input.status }
    });
    recipients = await getCatalogRecipientIds(client);
    product = await loadCatalogProduct(id, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  publishCatalogUpdates(recipients, { type: 'publication_status', productId: id, status: input.status });
  publishChatUpdates(recipients, { type: 'entity', entityType: 'catalog_product', entityId: id, senderId: req.user.id });
  if (publicWasTouched(previousStatus, input.status)) {
    publishPublicCatalogUpdate({ type: 'publication_status', productId: id, status: input.status });
  }
  res.json({ data: product });
}));

router.post('/imports/preview', asyncHandler(async (req, res) => {
  const input = parseInput(importPreviewSchema, req.body);
  const preview = await analyzeImportRows(input.rows);
  res.json({ data: preview });
}));

router.post('/imports/commit', asyncHandler(async (req, res) => {
  const input = parseInput(importCommitSchema, req.body);
  const client = await pool.connect();
  let result;
  let recipients = [];
  try {
    await client.query('BEGIN');
    result = await commitImportRows(input.rows, input, req.user.id, client);
    recipients = await getCatalogRecipientIds(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  publishCatalogUpdates(recipients, { type: 'import_committed', importId: result.importId });
  const publicRows = result.rows.filter((row) => row.currentPublicationStatus === 'PUBLISHED');
  if (publicRows.length) publishPublicCatalogUpdate({ type: 'import_committed', importId: result.importId });
  res.status(201).json({ data: result });
}));

router.get('/imports', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT imports.*, users.name AS created_by_name
     FROM used_smartphone_imports AS imports
     LEFT JOIN users ON users.id = imports.created_by
     ORDER BY imports.created_at DESC
     LIMIT 50`
  );
  res.json({ data: result.rows.map((row) => ({
    id: row.id,
    createdBy: row.created_by ? { id: row.created_by, name: row.created_by_name || '' } : null,
    options: row.options || {},
    summary: row.summary || {},
    createdAt: row.created_at
  })) });
}));

router.get('/storefront-settings', asyncHandler(async (req, res) => {
  res.json({ data: await loadSettings() });
}));

router.patch('/storefront-settings', asyncHandler(async (req, res) => {
  const input = parseInput(settingsSchema, req.body);
  if (input.selectedFormPublicId) {
    const form = await query(
      'SELECT public_id FROM application_forms WHERE public_id = $1 AND status = $2',
      [input.selectedFormPublicId, 'published']
    );
    if (!form.rows[0]) throw new AppError(422, 'CATALOG_FORM_NOT_PUBLISHED', 'Оберіть опубліковану форму заявок.');
  }
  const result = await query(
    `UPDATE used_smartphone_storefront_settings
     SET selected_form_public_id = $1,
         public_origin = $2,
         updated_by = $3,
         updated_at = NOW()
     WHERE id = TRUE
     RETURNING selected_form_public_id, public_origin, updated_at`,
    [input.selectedFormPublicId || null, input.publicOrigin, req.user.id]
  );
  publishPublicCatalogUpdate({ type: 'settings_updated' });
  res.json({ data: {
    selectedFormPublicId: result.rows[0].selected_form_public_id || null,
    publicOrigin: result.rows[0].public_origin || '',
    updatedAt: result.rows[0].updated_at
  } });
}));

router.get('/meta', (req, res) => {
  res.json({ data: {
    conditions: productConditions.map((value) => ({ value, label: conditionLabels[value] })),
    publicationStatuses: publicationStatuses.map((value) => ({ value, label: publicationStatusLabels[value] }))
  } });
});

export default router;
