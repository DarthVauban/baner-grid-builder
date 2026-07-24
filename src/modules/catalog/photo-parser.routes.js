import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import sharp from 'sharp';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import { publishCatalogUpdates } from './catalog.events.js';
import { catalogToolId, logCatalogAudit } from './catalog.service.js';
import {
  hostMatches,
  loadPhotoParserAdapters,
  normalizeHttpUrl,
  sanitizePhotoParserAdapterInput,
  serializePhotoParserAdapter
} from './photo-parser.adapters.js';
import { scrapePhotoParserProduct } from './photo-parser.browser.js';
import {
  createPhotoParserBatch,
  findActivePhotoParserBatch,
  loadPhotoParserBatch,
  serializePhotoParserRun
} from './photo-parser.service.js';

const router = Router();
router.use(requireAuth, requireToolAccess(catalogToolId));

const idSchema = z.string().uuid();
const listSchema = z.object({
  search: z.string().trim().max(120).default(''),
  photoStatus: z.enum(['all', 'present', 'missing']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(50)
});
const sourceUrlSchema = z.object({
  sourceUrl: z.string().trim().max(4000).default('')
});
const batchSchema = z.object({
  search: z.string().trim().max(120).default(''),
  photoStatus: z.enum(['all', 'present', 'missing']).default('all')
});
const adapterSchema = z.object({
  id: z.string().trim().max(80).optional(),
  name: z.string().trim().min(2).max(80),
  storeUrl: z.string().trim().min(1).max(500),
  gallerySelector: z.string().trim().min(1).max(1000),
  fallback: z.boolean().default(false)
});
const adapterTestSchema = adapterSchema.extend({
  productUrl: z.string().trim().min(1).max(4000)
});
const errorListSchema = z.object({
  search: z.string().trim().max(120).default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25)
});

const adapterTestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Забагато перевірок селектора. Спробуйте пізніше.' } }
});

function productListInput(req) {
  return parseInput(listSchema, {
    search: String(req.query.search || ''),
    photoStatus: req.query.photoStatus || 'all',
    page: req.query.page || 1,
    pageSize: req.query.pageSize || 50
  });
}

function appendProductFilters(input, params, where) {
  where.push(`product.publication_status <> 'ARCHIVED'`);
  const terms = input.search.toLocaleLowerCase('uk-UA').split(/\s+/).filter(Boolean);
  for (const term of terms) {
    params.push(`%${term}%`);
    where.push(`(lower(product.name) LIKE $${params.length} OR lower(product.product_code) LIKE $${params.length})`);
  }
  if (input.photoStatus === 'present') where.push(`product.main_image_url <> ''`);
  if (input.photoStatus === 'missing') where.push(`product.main_image_url = ''`);
}

async function latestRunsForProducts(productIds) {
  if (!productIds.length) return new Map();
  const placeholders = productIds.map((_, index) => `$${index + 1}`).join(', ');
  const result = await query(
    `SELECT *
     FROM used_smartphone_photo_parser_runs
     WHERE product_id IN (${placeholders})
     ORDER BY product_id, created_at DESC`,
    productIds
  );
  const latest = new Map();
  for (const row of result.rows) {
    if (!latest.has(row.product_id)) latest.set(row.product_id, serializePhotoParserRun(row));
  }
  return latest;
}

router.get('/products', asyncHandler(async (req, res) => {
  const input = productListInput(req);
  const params = [];
  const where = [];
  appendProductFilters(input, params, where);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [countResult, summaryResult] = await Promise.all([
    query(`SELECT COUNT(*)::INTEGER AS count FROM used_smartphone_products AS product ${whereSql}`, params),
    query(
      `SELECT
         COUNT(*)::INTEGER AS total,
         COALESCE(SUM(CASE WHEN main_image_url <> '' THEN 1 ELSE 0 END), 0)::INTEGER AS with_photos,
         COALESCE(SUM(CASE WHEN main_image_url = '' THEN 1 ELSE 0 END), 0)::INTEGER AS without_photos
       FROM used_smartphone_products
       WHERE publication_status <> 'ARCHIVED'`
    )
  ]);
  const total = Number(countResult.rows[0]?.count || 0);
  const offset = (input.page - 1) * input.pageSize;
  const products = await query(
    `SELECT product.id, product.product_code, product.name, product.main_image_url,
            product.gallery, product.photo_parser_url, product.updated_at
     FROM used_smartphone_products AS product
     ${whereSql}
     ORDER BY lower(product.name), product.created_at
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, input.pageSize, offset]
  );
  const latestRuns = await latestRunsForProducts(products.rows.map((row) => row.id));
  const summary = summaryResult.rows[0] || {};
  res.json({
    data: {
      items: products.rows.map((row) => {
        const photos = new Set(
          (Array.isArray(row.gallery) ? row.gallery : [])
            .map((item) => item?.url)
            .filter(Boolean)
        );
        if (row.main_image_url) photos.add(row.main_image_url);
        return {
          id: row.id,
          productCode: row.product_code,
          name: row.name,
          mainImageUrl: row.main_image_url || '',
          photoCount: photos.size,
          sourceUrl: row.photo_parser_url || '',
          latestRun: latestRuns.get(row.id) || null,
          updatedAt: row.updated_at
        };
      }),
      summary: {
        total: Number(summary.total || 0),
        withPhotos: Number(summary.with_photos || 0),
        withoutPhotos: Number(summary.without_photos || 0)
      },
      total,
      page: input.page,
      pageSize: input.pageSize,
      pageCount: Math.max(1, Math.ceil(total / input.pageSize))
    }
  });
}));

router.patch('/products/:id/source-url', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(sourceUrlSchema, req.body);
  const sourceUrl = input.sourceUrl ? normalizeHttpUrl(input.sourceUrl, 'Посилання на товар').href : '';
  const result = await query(
    `UPDATE used_smartphone_products
     SET photo_parser_url = $2,
         updated_by = $3,
         updated_at = NOW()
     WHERE id = $1
       AND publication_status <> 'ARCHIVED'
     RETURNING id, photo_parser_url`,
    [id, sourceUrl, req.user.id]
  );
  if (!result.rows[0]) throw new AppError(404, 'CATALOG_PRODUCT_NOT_FOUND', 'Товар не знайдено.');
  await logCatalogAudit({ query }, {
    productId: id,
    actorId: req.user.id,
    action: 'photo_parser_url_update',
    changes: { sourceUrl }
  });
  res.json({ data: { productId: id, sourceUrl } });
}));

router.get('/adapters', asyncHandler(async (req, res) => {
  res.json({ data: await loadPhotoParserAdapters() });
}));

router.post('/adapters/test', adapterTestLimiter, asyncHandler(async (req, res) => {
  const input = parseInput(adapterTestSchema, req.body);
  const existingAdapters = await loadPhotoParserAdapters();
  const existing = input.id
    ? existingAdapters.find((adapter) => adapter.id === input.id && adapter.source === 'custom')
    : null;
  const draft = sanitizePhotoParserAdapterInput(input, existing);
  const productUrl = normalizeHttpUrl(input.productUrl, 'Тестова сторінка товару');
  if (!hostMatches(productUrl.hostname, draft.host)) {
    throw new AppError(422, 'PHOTO_PARSER_TEST_HOST_MISMATCH', `Тестовий товар має бути на домені ${draft.host}.`);
  }
  const result = await scrapePhotoParserProduct({
    url: productUrl.href,
    adapter: { ...draft, strict: true, fallback: false },
    maxImages: 12
  });
  const images = [];
  const errors = [...result.errors];
  for (const image of result.images.slice(0, 12)) {
    try {
      const pipeline = sharp(image.buffer, {
        failOn: 'error',
        limitInputPixels: 40_000_000,
        sequentialRead: true
      });
      const metadata = await pipeline.metadata();
      const preview = await sharp(image.buffer, {
        failOn: 'error',
        limitInputPixels: 40_000_000,
        sequentialRead: true
      })
        .rotate()
        .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 76 })
        .toBuffer();
      images.push({
        sourceUrl: image.sourceUrl,
        preview: `data:image/webp;base64,${preview.toString('base64')}`,
        width: Number(metadata.width || 0),
        height: Number(metadata.height || 0)
      });
    } catch (error) {
      errors.push({
        sourceUrl: image.sourceUrl,
        stage: 'preview',
        message: error?.message || 'Не вдалося створити попередній перегляд'
      });
    }
  }
  if (!images.length) {
    throw new AppError(422, 'PHOTO_PARSER_TEST_EMPTY', 'Селектор не повернув придатних фотографій.');
  }
  res.json({
    data: {
      title: result.title,
      host: draft.host,
      selectorMatches: Number(result.diagnostics.selectorMatches || 0),
      selectorImages: Number(result.diagnostics.selectorImages || 0),
      candidates: Number(result.diagnostics.candidates || images.length),
      images,
      errors
    }
  });
}));

router.post('/adapters', asyncHandler(async (req, res) => {
  const input = parseInput(adapterSchema, req.body);
  const adapter = sanitizePhotoParserAdapterInput(input);
  const duplicate = await query(
    `SELECT id, name
     FROM used_smartphone_photo_parser_adapters
     WHERE source = 'custom' AND lower(host) = lower($1)
     LIMIT 1`,
    [adapter.host]
  );
  if (duplicate.rows[0]) {
    throw new AppError(409, 'PHOTO_PARSER_ADAPTER_EXISTS', `Для домену ${adapter.host} уже існує адаптер «${duplicate.rows[0].name}».`);
  }
  const result = await query(
    `INSERT INTO used_smartphone_photo_parser_adapters (
       id, source, name, host, store_url, gallery_selector, strict, fallback,
       enabled, sort_order, created_by, updated_by
     ) VALUES ($1, 'custom', $2, $3, $4, $5, TRUE, $6, TRUE, $7, $8, $8)
     RETURNING *`,
    [
      adapter.id,
      adapter.name,
      adapter.host,
      adapter.storeUrl,
      adapter.gallerySelector,
      adapter.fallback,
      adapter.sortOrder,
      req.user.id
    ]
  );
  await logCatalogAudit({ query }, {
    actorId: req.user.id,
    action: 'photo_parser_adapter_create',
    changes: { adapterId: adapter.id, name: adapter.name, host: adapter.host }
  });
  res.status(201).json({ data: serializePhotoParserAdapter(result.rows[0]) });
}));

router.put('/adapters/:id', asyncHandler(async (req, res) => {
  const adapterId = String(req.params.id || '').trim();
  const input = parseInput(adapterSchema, req.body);
  const existingResult = await query(
    `SELECT *
     FROM used_smartphone_photo_parser_adapters
     WHERE id = $1 AND source = 'custom'`,
    [adapterId]
  );
  const existingRow = existingResult.rows[0];
  if (!existingRow) throw new AppError(404, 'PHOTO_PARSER_ADAPTER_NOT_FOUND', 'Користувацький адаптер не знайдено.');
  const existing = serializePhotoParserAdapter(existingRow);
  const adapter = sanitizePhotoParserAdapterInput(input, existing);
  const duplicate = await query(
    `SELECT id, name
     FROM used_smartphone_photo_parser_adapters
     WHERE source = 'custom' AND lower(host) = lower($1) AND id <> $2
     LIMIT 1`,
    [adapter.host, adapterId]
  );
  if (duplicate.rows[0]) {
    throw new AppError(409, 'PHOTO_PARSER_ADAPTER_EXISTS', `Для домену ${adapter.host} уже існує адаптер «${duplicate.rows[0].name}».`);
  }
  const result = await query(
    `UPDATE used_smartphone_photo_parser_adapters
     SET name = $2,
         host = $3,
         store_url = $4,
         gallery_selector = $5,
         fallback = $6,
         updated_by = $7,
         updated_at = NOW()
     WHERE id = $1 AND source = 'custom'
     RETURNING *`,
    [
      adapterId,
      adapter.name,
      adapter.host,
      adapter.storeUrl,
      adapter.gallerySelector,
      adapter.fallback,
      req.user.id
    ]
  );
  await logCatalogAudit({ query }, {
    actorId: req.user.id,
    action: 'photo_parser_adapter_update',
    changes: { adapterId, name: adapter.name, host: adapter.host }
  });
  res.json({ data: serializePhotoParserAdapter(result.rows[0]) });
}));

router.patch('/adapters/:id/toggle', asyncHandler(async (req, res) => {
  const adapterId = String(req.params.id || '').trim();
  const result = await query(
    `UPDATE used_smartphone_photo_parser_adapters
     SET enabled = NOT enabled,
         updated_by = $2,
         updated_at = NOW()
     WHERE id = $1 AND source = 'custom'
     RETURNING *`,
    [adapterId, req.user.id]
  );
  if (!result.rows[0]) throw new AppError(404, 'PHOTO_PARSER_ADAPTER_NOT_FOUND', 'Користувацький адаптер не знайдено.');
  res.json({ data: serializePhotoParserAdapter(result.rows[0]) });
}));

router.delete('/adapters/:id', asyncHandler(async (req, res) => {
  const adapterId = String(req.params.id || '').trim();
  const result = await query(
    `DELETE FROM used_smartphone_photo_parser_adapters
     WHERE id = $1 AND source = 'custom'
     RETURNING id, name, host`,
    [adapterId]
  );
  if (!result.rows[0]) throw new AppError(404, 'PHOTO_PARSER_ADAPTER_NOT_FOUND', 'Користувацький адаптер не знайдено.');
  await logCatalogAudit({ query }, {
    actorId: req.user.id,
    action: 'photo_parser_adapter_delete',
    changes: { adapterId, name: result.rows[0].name, host: result.rows[0].host }
  });
  res.status(204).end();
}));

router.post('/batches', asyncHandler(async (req, res) => {
  const input = parseInput(batchSchema, req.body);
  const batch = await createPhotoParserBatch({ ...input, user: req.user });
  publishCatalogUpdates([req.user.id], { type: 'photo_parser_batch_created', batchId: batch.id });
  res.status(201).json({ data: batch });
}));

router.get('/batches/active', asyncHandler(async (req, res) => {
  res.json({ data: await findActivePhotoParserBatch(req.user) });
}));

router.get('/batches/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  res.json({ data: await loadPhotoParserBatch(id, req.user) });
}));

router.get('/errors', asyncHandler(async (req, res) => {
  const input = parseInput(errorListSchema, {
    search: String(req.query.search || ''),
    page: req.query.page || 1,
    pageSize: req.query.pageSize || 25
  });
  const params = [];
  const where = [
    `run.status IN ('partial', 'failed')`,
    `product.publication_status <> 'ARCHIVED'`
  ];
  if (input.search) {
    params.push(`%${input.search}%`);
    where.push(`(product.name ILIKE $${params.length} OR product.product_code ILIKE $${params.length} OR run.source_url ILIKE $${params.length})`);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS count
     FROM used_smartphone_photo_parser_runs AS run
     INNER JOIN used_smartphone_products AS product ON product.id = run.product_id
     ${whereSql}`,
    params
  );
  const total = Number(countResult.rows[0]?.count || 0);
  const offset = (input.page - 1) * input.pageSize;
  const result = await query(
    `SELECT run.*, product.product_code, product.name AS product_name, product.main_image_url
     FROM used_smartphone_photo_parser_runs AS run
     INNER JOIN used_smartphone_products AS product ON product.id = run.product_id
     ${whereSql}
     ORDER BY run.completed_at DESC, run.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, input.pageSize, offset]
  );
  res.json({
    data: {
      items: result.rows.map(serializePhotoParserRun),
      total,
      page: input.page,
      pageSize: input.pageSize,
      pageCount: Math.max(1, Math.ceil(total / input.pageSize))
    }
  });
}));

export default router;
