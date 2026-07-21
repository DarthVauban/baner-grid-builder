import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { buildUtm, cleanText, cleanUrl } from '../applications/application.service.js';
import { createPublicApplication } from '../applications/public.routes.js';
import {
  subscribeToPublicCatalogUpdates
} from './catalog.events.js';
import { storefrontProductPathForRequest } from './storefront.domain.js';
import {
  appendStorefrontProductFilters,
  attachPublicCatalogProductListDetails,
  catalogProductSnapshot,
  loadStorefrontProductFilters,
  loadPublicProduct,
  normalizeStorefrontCharacteristicFilters,
  productConditions,
  productSelect,
  serializePublicCatalogProduct
} from './catalog.service.js';
import { normalizeProductCardTheme, normalizeProductPageTheme, normalizeStorefrontTheme } from './storefront.theme.js';

const router = Router();

const listSchema = z.object({
  search: z.string().trim().max(120).default(''),
  condition: z.enum(['all', ...productConditions]).default('all'),
  availability: z.enum(['all', 'in_stock', 'incoming', 'unavailable']).default('all'),
  brandId: z.string().uuid().optional(),
  priceMin: z.coerce.number().min(0).optional(),
  priceMax: z.coerce.number().min(0).optional(),
  characteristics: z.string().trim().max(12000).default(''),
  sort: z.enum(['updated_desc', 'name_asc', 'price_asc', 'price_desc']).default('updated_desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(6).max(48).default(24)
});
const identifierSchema = z.string().trim().min(1).max(260);
const storefrontApplicationSchema = z.object({
  values: z.record(z.string(), z.unknown()).default({}),
  context: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().trim().max(160).optional().default(''),
  honeypot: z.string().trim().max(200).optional().default('')
});

const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Забагато спроб. Спробуйте пізніше.' } }
});

const sortSql = {
  updated_desc: 'product.updated_at DESC',
  name_asc: 'lower(product.name) ASC',
  price_asc: 'product.price_uah ASC, lower(product.name) ASC',
  price_desc: 'product.price_uah DESC, lower(product.name) ASC'
};

function publicOrigin(req) {
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const candidate = forwardedHost ? `${forwardedProto}://${forwardedHost}` : `${req.protocol}://${req.get('host')}`;
  try { return new URL(candidate).origin; } catch { return ''; }
}

function buildFilters(input) {
  const params = [];
  const where = ["product.publication_status = 'PUBLISHED'"];
  const terms = input.search.toLocaleLowerCase('uk-UA').split(/\s+/).filter(Boolean);
  for (const term of terms) {
    params.push(`%${term}%`);
    const index = params.length;
    where.push(`(lower(product.name) LIKE $${index} OR lower(product.product_code) LIKE $${index})`);
  }
  if (input.condition !== 'all') {
    params.push(input.condition);
    where.push(`product.condition = $${params.length}`);
  }
  if (input.availability === 'in_stock') where.push('product.stock_count > 0');
  if (input.availability === 'incoming') where.push('product.stock_count = 0 AND product.incoming_count > 0');
  if (input.availability === 'unavailable') where.push('product.stock_count = 0 AND product.incoming_count = 0');
  if (input.includeStorefrontFilters) appendStorefrontProductFilters(input, params, where);
  return { params, whereSql: `WHERE ${where.join(' AND ')}` };
}

async function loadStorefrontSettings() {
  const result = await query(
    `SELECT selected_form_public_id, public_origin, storefront_theme, product_card_theme, product_page_theme, updated_at
     FROM used_smartphone_storefront_settings
     WHERE id = TRUE`
  );
  const row = result.rows[0] || {};
  return {
    selectedFormPublicId: row.selected_form_public_id || null,
    publicOrigin: row.public_origin || '',
    storefrontTheme: normalizeStorefrontTheme(row.storefront_theme),
    productCardTheme: normalizeProductCardTheme(row.product_card_theme),
    productPageTheme: normalizeProductPageTheme(row.product_page_theme),
    updatedAt: row.updated_at || null
  };
}

router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const sendUpdate = (payload) => res.write(`event: storefront\ndata: ${JSON.stringify(payload)}\n\n`);
  const unsubscribe = subscribeToPublicCatalogUpdates(sendUpdate);
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
  heartbeat.unref();
  res.write('event: connected\ndata: {}\n\n');
  req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
});

router.get('/settings', asyncHandler(async (req, res) => {
  res.json({ data: await loadStorefrontSettings() });
}));

router.get('/products', asyncHandler(async (req, res) => {
  const input = parseInput(listSchema, {
    search: String(req.query.search || ''),
    condition: req.query.condition || 'all',
    availability: req.query.availability || 'all',
    brandId: req.query.brandId || undefined,
    priceMin: req.query.priceMin || undefined,
    priceMax: req.query.priceMax || undefined,
    characteristics: String(req.query.characteristics || ''),
    sort: req.query.sort || 'updated_desc',
    page: req.query.page || 1,
    pageSize: req.query.pageSize || 24
  });
  const characteristicFilters = normalizeStorefrontCharacteristicFilters(input.characteristics);
  const baseFilters = buildFilters({ ...input, includeStorefrontFilters: false });
  const { params, whereSql } = buildFilters({ ...input, characteristicFilters, includeStorefrontFilters: true });
  const totalResult = await query(`SELECT COUNT(*)::INTEGER AS count FROM used_smartphone_products AS product ${whereSql}`, params);
  const offset = (input.page - 1) * input.pageSize;
  const result = await query(
    `${productSelect}
     ${whereSql}
     ORDER BY ${sortSql[input.sort]}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, input.pageSize, offset]
  );
  const items = result.rows.map((row) => serializePublicCatalogProduct(row));
  await attachPublicCatalogProductListDetails(items, { query }, { publicOnly: true });
  const filters = await loadStorefrontProductFilters(baseFilters.whereSql, baseFilters.params);
  const total = Number(totalResult.rows[0]?.count || 0);
  res.json({ data: {
    items,
    filters,
    total,
    page: input.page,
    pageSize: input.pageSize,
    pageCount: Math.max(1, Math.ceil(total / input.pageSize))
  } });
}));

router.get('/products/:identifier', asyncHandler(async (req, res) => {
  const identifier = parseInput(identifierSchema, req.params.identifier);
  const product = await loadPublicProduct(identifier);
  if (!product) throw new AppError(404, 'STOREFRONT_PRODUCT_NOT_FOUND', 'Товар не знайдено або не опубліковано.');
  res.json({ data: product });
}));

router.post('/products/:identifier/applications', submitLimiter, asyncHandler(async (req, res) => {
  const identifier = parseInput(identifierSchema, req.params.identifier);
  const input = parseInput(storefrontApplicationSchema, req.body);
  const [settings, product] = await Promise.all([
    loadStorefrontSettings(),
    loadPublicProduct(identifier)
  ]);
  if (!product) throw new AppError(404, 'STOREFRONT_PRODUCT_NOT_FOUND', 'Товар не знайдено або не опубліковано.');
  if (product.availability.status === 'unavailable') {
    throw new AppError(409, 'STOREFRONT_PRODUCT_UNAVAILABLE', 'Товар зараз недоступний для заявки.');
  }
  if (!settings.selectedFormPublicId) {
    throw new AppError(422, 'STOREFRONT_FORM_NOT_CONFIGURED', 'Для вітрини ще не обрано форму заявок.');
  }
  const requestPublicOrigin = publicOrigin(req);
  const origin = req.isStandaloneStorefront ? requestPublicOrigin : settings.publicOrigin || requestPublicOrigin;
  const sourceUrl = cleanUrl(new URL(storefrontProductPathForRequest(req, product), `${origin}/`).toString());
  const context = {
    ...input.context,
    sourceUrl,
    canonicalUrl: sourceUrl,
    pageTitle: cleanText(product.name, 500),
    referrer: cleanUrl(input.context.referrer || ''),
    ...buildUtm(input.context)
  };
  const domain = sourceUrl ? new URL(sourceUrl).hostname : '';
  const result = await createPublicApplication({
    publicId: settings.selectedFormPublicId,
    input: {
      values: input.values,
      product: {},
      context,
      idempotencyKey: input.idempotencyKey,
      honeypot: input.honeypot
    },
    req,
    productOverride: catalogProductSnapshot(product, { origin, sourceUrl, domain }),
    contextOverride: context,
    source: 'storefront_catalog',
    historyComment: 'Заявку створено з публічної вітрини каталогу'
  });
  if (result.status === 204) return res.status(204).end();
  res.status(result.status).json({ data: result.data });
}));

export default router;
