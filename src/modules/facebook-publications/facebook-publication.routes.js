import { Router, raw } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import {
  analyzeFacebookPublicationImport,
  commitFacebookPublicationImport,
  createFacebookPublicationCampaign,
  facebookPublicationRiskSummary,
  facebookPublicationToolId,
  loadFacebookPublicationCampaign,
  normalizeFacebookGroupUrl,
  normalizeStoreCode,
  recordFacebookPublicationActivity,
  retryFacebookPublicationTarget,
  serializeFacebookPublicationAsset,
  serializeFacebookPublicationCampaign,
  serializeFacebookPublicationGroup,
  serializeFacebookPublicationStore,
  serializeFacebookPublicationTarget,
  updateFacebookPublicationTarget
} from './facebook-publication.service.js';

const router = Router();
router.use(requireAuth, requireToolAccess(facebookPublicationToolId));

const idSchema = z.string().uuid();
const searchSchema = z.object({
  search: z.string().trim().max(160).default(''),
  status: z.string().trim().max(40).default('')
});
const storeSchema = z.object({
  code: z.string().trim().min(1, 'Вкажіть код магазину.').max(80),
  name: z.string().trim().min(1, 'Вкажіть назву магазину.').max(200),
  city: z.string().trim().min(1, 'Вкажіть місто.').max(120),
  address: z.string().trim().min(1, 'Вкажіть адресу.').max(500),
  notes: z.string().max(4000).default(''),
  status: z.enum(['active', 'inactive']).default('active')
});
const groupSchema = z.object({
  name: z.string().trim().min(1, 'Вкажіть назву групи.').max(300),
  url: z.string().trim().min(1).max(2000),
  city: z.string().trim().min(1, 'Вкажіть місто.').max(120),
  defaultStoreId: z.string().uuid(),
  notes: z.string().max(4000).default(''),
  advertisingPolicy: z.enum(['allowed', 'forbidden', 'unknown']).default('unknown'),
  moderationRequired: z.boolean().default(false),
  recommendedIntervalDays: z.number().int().min(0).max(365).default(14),
  status: z.enum(['active', 'inactive', 'do_not_publish']).default('active')
});
const importSchema = z.object({
  stores: z.array(z.record(z.string(), z.unknown())).max(10000).default([]),
  groups: z.array(z.record(z.string(), z.unknown())).max(20000).default([])
}).refine((input) => input.stores.length > 0 || input.groups.length > 0, {
  message: 'Файл не містить магазинів або Facebook-груп.'
});
const campaignSchema = z.object({
  title: z.string().trim().min(1, 'Вкажіть назву кампанії.').max(200),
  promotion: z.string().trim().max(160).default(''),
  plannedDate: z.string().date(),
  textVariants: z.array(z.string().trim().min(1).max(5000)).min(1).max(10),
  assetId: z.string().uuid(),
  selections: z.array(z.object({
    groupId: z.string().uuid(),
    storeId: z.string().uuid()
  })).min(1).max(1000).transform((items) => [...new Map(items.map((item) => [item.groupId, item])).values()])
});
const targetUpdateSchema = z.object({
  status: z.enum(['not_started', 'published', 'pending_moderation', 'rejected', 'skipped']).optional(),
  renderedText: z.string().trim().min(1).max(5000).optional(),
  postUrl: z.string().trim().max(2000).optional(),
  note: z.string().max(4000).optional()
}).refine((input) => Object.keys(input).length > 0, { message: 'Немає змін для збереження.' });
const activitySchema = z.object({ activity: z.enum(['opened', 'copied', 'image_opened']) });
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function decodeFileName(value) {
  try {
    return decodeURIComponent(String(value || 'facebook-banner')).slice(0, 255);
  } catch {
    return 'facebook-banner';
  }
}

function validateOptionalPostUrl(value) {
  if (!value) return '';
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') throw new Error('protocol');
    return parsed.toString();
  } catch {
    throw new AppError(422, 'FACEBOOK_POST_URL_INVALID', 'Посилання на пост має бути коректним HTTPS URL.');
  }
}

router.get('/stores', asyncHandler(async (req, res) => {
  const input = parseInput(searchSchema, req.query);
  const result = await query(
    `SELECT * FROM facebook_publication_stores
     WHERE ($1 = '' OR name ILIKE '%' || $1 || '%' OR city ILIKE '%' || $1 || '%'
       OR address ILIKE '%' || $1 || '%' OR code ILIKE '%' || $1 || '%')
       AND ($2 = '' OR status = $2)
     ORDER BY lower(city), lower(name)`,
    [input.search, input.status]
  );
  res.json({ data: result.rows.map(serializeFacebookPublicationStore) });
}));

router.post('/stores', requireRole('admin'), asyncHandler(async (req, res) => {
  const input = parseInput(storeSchema, req.body);
  const normalizedCode = normalizeStoreCode(input.code);
  const existing = await query('SELECT id FROM facebook_publication_stores WHERE normalized_code = $1', [normalizedCode]);
  if (existing.rows[0]) throw new AppError(409, 'FACEBOOK_STORE_CODE_EXISTS', 'Магазин із таким кодом уже існує.');
  const result = await query(
    `INSERT INTO facebook_publication_stores (
       code, normalized_code, name, city, address, notes, status, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [input.code, normalizedCode, input.name, input.city, input.address, input.notes, input.status, req.user.id]
  );
  res.status(201).json({ data: serializeFacebookPublicationStore(result.rows[0]) });
}));

router.put('/stores/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(storeSchema, req.body);
  const result = await query(
    `UPDATE facebook_publication_stores
     SET code = $2, normalized_code = $3, name = $4, city = $5,
         address = $6, notes = $7, status = $8, updated_at = NOW()
     WHERE id = $1
       AND NOT EXISTS (
         SELECT 1 FROM facebook_publication_stores AS duplicate
         WHERE duplicate.normalized_code = $3 AND duplicate.id <> $1
       )
     RETURNING *`,
    [id, input.code, normalizeStoreCode(input.code), input.name, input.city,
      input.address, input.notes, input.status]
  );
  if (!result.rows[0]) throw new AppError(409, 'FACEBOOK_STORE_UPDATE_CONFLICT', 'Магазин не знайдено або такий код уже використовується.');
  res.json({ data: serializeFacebookPublicationStore(result.rows[0]) });
}));

router.delete('/stores/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const references = await query(
    `SELECT
       (SELECT COUNT(*) FROM facebook_publication_groups WHERE default_store_id = $1)::INTEGER AS groups,
       (SELECT COUNT(*) FROM facebook_publication_targets WHERE store_id = $1)::INTEGER AS targets`,
    [id]
  );
  if (Number(references.rows[0]?.groups || 0) || Number(references.rows[0]?.targets || 0)) {
    throw new AppError(409, 'FACEBOOK_STORE_IN_USE', 'Магазин використовується групами або історією. Змініть його статус на «Неактивний».');
  }
  const result = await query('DELETE FROM facebook_publication_stores WHERE id = $1', [id]);
  if (!result.rowCount) throw new AppError(404, 'FACEBOOK_STORE_NOT_FOUND', 'Магазин не знайдено.');
  res.status(204).end();
}));

router.get('/groups', asyncHandler(async (req, res) => {
  const input = parseInput(searchSchema, req.query);
  const result = await query(
    `SELECT groups.*, stores.id AS store_id, stores.code AS store_code,
            stores.name AS store_name, stores.city AS store_city,
            stores.address AS store_address, stores.status AS store_status,
            last_publication.last_published_at
     FROM facebook_publication_groups AS groups
     JOIN facebook_publication_stores AS stores ON stores.id = groups.default_store_id
     LEFT JOIN (
       SELECT group_id, MAX(published_at) AS last_published_at
       FROM facebook_publication_targets
       WHERE status = 'published'
       GROUP BY group_id
     ) AS last_publication ON last_publication.group_id = groups.id
     WHERE ($1 = '' OR groups.name ILIKE '%' || $1 || '%' OR groups.city ILIKE '%' || $1 || '%'
       OR stores.name ILIKE '%' || $1 || '%' OR groups.url ILIKE '%' || $1 || '%')
       AND ($2 = '' OR groups.status = $2)
     ORDER BY lower(groups.city), lower(groups.name)`,
    [input.search, input.status]
  );
  res.json({ data: result.rows.map(serializeFacebookPublicationGroup) });
}));

router.post('/groups', requireRole('admin'), asyncHandler(async (req, res) => {
  const input = parseInput(groupSchema, req.body);
  const normalizedUrl = normalizeFacebookGroupUrl(input.url);
  const store = await query('SELECT id FROM facebook_publication_stores WHERE id = $1', [input.defaultStoreId]);
  if (!store.rows[0]) throw new AppError(422, 'FACEBOOK_STORE_NOT_FOUND', 'Вибраний магазин не знайдено.');
  const existing = await query('SELECT id FROM facebook_publication_groups WHERE normalized_url = $1', [normalizedUrl]);
  if (existing.rows[0]) throw new AppError(409, 'FACEBOOK_GROUP_URL_EXISTS', 'Група з таким посиланням уже існує.');
  const result = await query(
    `INSERT INTO facebook_publication_groups (
       name, url, normalized_url, city, default_store_id, notes,
       advertising_policy, moderation_required, recommended_interval_days, status, created_by
     ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [input.name, normalizedUrl, input.city, input.defaultStoreId, input.notes,
      input.advertisingPolicy, input.moderationRequired, input.recommendedIntervalDays, input.status, req.user.id]
  );
  const loaded = await query(
    `SELECT groups.*, stores.id AS store_id, stores.code AS store_code,
            stores.name AS store_name, stores.city AS store_city,
            stores.address AS store_address, stores.status AS store_status,
            NULL AS last_published_at
     FROM facebook_publication_groups AS groups
     JOIN facebook_publication_stores AS stores ON stores.id = groups.default_store_id
     WHERE groups.id = $1`,
    [result.rows[0].id]
  );
  res.status(201).json({ data: serializeFacebookPublicationGroup(loaded.rows[0]) });
}));

router.put('/groups/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(groupSchema, req.body);
  const normalizedUrl = normalizeFacebookGroupUrl(input.url);
  const result = await query(
    `UPDATE facebook_publication_groups
     SET name = $2, url = $3, normalized_url = $3, city = $4,
         default_store_id = $5, notes = $6, advertising_policy = $7,
         moderation_required = $8, recommended_interval_days = $9,
         status = $10, updated_at = NOW()
     WHERE id = $1
       AND EXISTS (SELECT 1 FROM facebook_publication_stores WHERE id = $5)
       AND NOT EXISTS (
         SELECT 1 FROM facebook_publication_groups AS duplicate
         WHERE duplicate.normalized_url = $3 AND duplicate.id <> $1
       )
     RETURNING id`,
    [id, input.name, normalizedUrl, input.city, input.defaultStoreId, input.notes,
      input.advertisingPolicy, input.moderationRequired, input.recommendedIntervalDays, input.status]
  );
  if (!result.rows[0]) throw new AppError(409, 'FACEBOOK_GROUP_UPDATE_CONFLICT', 'Групу не знайдено, магазин недоступний або URL уже використовується.');
  const loaded = await query(
    `SELECT groups.*, stores.id AS store_id, stores.code AS store_code,
            stores.name AS store_name, stores.city AS store_city,
            stores.address AS store_address, stores.status AS store_status,
            last_publication.last_published_at
     FROM facebook_publication_groups AS groups
     JOIN facebook_publication_stores AS stores ON stores.id = groups.default_store_id
     LEFT JOIN (
       SELECT group_id, MAX(published_at) AS last_published_at
       FROM facebook_publication_targets
       WHERE status = 'published'
       GROUP BY group_id
     ) AS last_publication ON last_publication.group_id = groups.id
     WHERE groups.id = $1`,
    [id]
  );
  res.json({ data: serializeFacebookPublicationGroup(loaded.rows[0]) });
}));

router.delete('/groups/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const history = await query('SELECT COUNT(*)::INTEGER AS count FROM facebook_publication_targets WHERE group_id = $1', [id]);
  if (Number(history.rows[0]?.count || 0)) {
    throw new AppError(409, 'FACEBOOK_GROUP_IN_USE', 'Група має історію публікацій. Змініть її статус на «Не публікувати».');
  }
  const result = await query('DELETE FROM facebook_publication_groups WHERE id = $1', [id]);
  if (!result.rowCount) throw new AppError(404, 'FACEBOOK_GROUP_NOT_FOUND', 'Групу не знайдено.');
  res.status(204).end();
}));

router.post('/imports/preview', requireRole('admin'), asyncHandler(async (req, res) => {
  const input = parseInput(importSchema, req.body);
  res.json({ data: await analyzeFacebookPublicationImport(input) });
}));

router.post('/imports/commit', requireRole('admin'), asyncHandler(async (req, res) => {
  const input = parseInput(importSchema, req.body);
  res.status(201).json({ data: await commitFacebookPublicationImport(input, req.user.id) });
}));

router.post('/assets', raw({ type: 'image/*', limit: '8mb' }), asyncHandler(async (req, res) => {
  const mimeType = String(req.get('content-type') || '').toLocaleLowerCase('en-US');
  if (!allowedImageTypes.has(mimeType)) {
    throw new AppError(415, 'FACEBOOK_ASSET_TYPE_UNSUPPORTED', 'Підтримуються JPEG, PNG, WebP і GIF.');
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw new AppError(422, 'FACEBOOK_ASSET_EMPTY', 'Файл зображення порожній.');
  }
  const result = await query(
    `INSERT INTO facebook_publication_assets (
       file_name, mime_type, size_bytes, content, created_by
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, file_name, mime_type, size_bytes, created_at`,
    [decodeFileName(req.get('x-file-name')), mimeType, req.body.length, req.body, req.user.id]
  );
  res.status(201).json({ data: serializeFacebookPublicationAsset(result.rows[0]) });
}));

router.get('/assets/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const result = await query('SELECT * FROM facebook_publication_assets WHERE id = $1', [id]);
  const asset = result.rows[0];
  if (!asset) throw new AppError(404, 'FACEBOOK_ASSET_NOT_FOUND', 'Зображення не знайдено.');
  res.setHeader('Content-Type', asset.mime_type);
  res.setHeader('Content-Length', String(asset.size_bytes));
  res.setHeader('Content-Disposition', `inline; filename="${asset.file_name.replace(/["\\]/g, '_')}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(asset.content);
}));

router.get('/campaigns', asyncHandler(async (req, res) => {
  const input = parseInput(searchSchema, req.query);
  const result = await query(
    `SELECT campaigns.*, users.name AS created_by_name,
            assets.file_name AS asset_file_name, assets.mime_type AS asset_mime_type,
            assets.size_bytes AS asset_size_bytes, assets.created_at AS asset_created_at,
            COALESCE(totals.target_count, 0)::INTEGER AS target_count,
            COALESCE(totals.not_started_count, 0)::INTEGER AS not_started_count,
            COALESCE(totals.published_count, 0)::INTEGER AS published_count,
            COALESCE(totals.pending_moderation_count, 0)::INTEGER AS pending_moderation_count,
            COALESCE(totals.rejected_count, 0)::INTEGER AS rejected_count,
            COALESCE(totals.skipped_count, 0)::INTEGER AS skipped_count
     FROM facebook_publication_campaigns AS campaigns
     JOIN users ON users.id = campaigns.created_by
     LEFT JOIN facebook_publication_assets AS assets ON assets.id = campaigns.asset_id
     LEFT JOIN (
       SELECT campaign_id,
              COUNT(*) AS target_count,
              SUM(CASE WHEN status = 'not_started' THEN 1 ELSE 0 END) AS not_started_count,
              SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published_count,
              SUM(CASE WHEN status = 'pending_moderation' THEN 1 ELSE 0 END) AS pending_moderation_count,
              SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count,
              SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped_count
       FROM facebook_publication_targets
       GROUP BY campaign_id
     ) AS totals ON totals.campaign_id = campaigns.id
     WHERE ($1 = '' OR campaigns.title ILIKE '%' || $1 || '%' OR campaigns.promotion ILIKE '%' || $1 || '%')
       AND ($2 = '' OR campaigns.status = $2)
     ORDER BY campaigns.planned_date DESC, campaigns.created_at DESC`,
    [input.search, input.status]
  );
  res.json({ data: result.rows.map((row) => serializeFacebookPublicationCampaign(row)) });
}));

router.post('/campaigns', asyncHandler(async (req, res) => {
  const input = parseInput(campaignSchema, req.body);
  const asset = await query('SELECT id FROM facebook_publication_assets WHERE id = $1', [input.assetId]);
  if (!asset.rows[0]) throw new AppError(422, 'FACEBOOK_ASSET_NOT_FOUND', 'Вибране зображення не знайдено.');
  res.status(201).json({ data: await createFacebookPublicationCampaign(input, req.user) });
}));

router.get('/campaigns/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  res.json({ data: await loadFacebookPublicationCampaign(id) });
}));

router.patch('/targets/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(targetUpdateSchema, req.body);
  if (input.postUrl !== undefined) input.postUrl = validateOptionalPostUrl(input.postUrl);
  res.json({ data: await updateFacebookPublicationTarget(id, input, req.user) });
}));

router.post('/targets/:id/activity', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(activitySchema, req.body);
  res.json({ data: await recordFacebookPublicationActivity(id, input.activity, req.user) });
}));

router.post('/targets/:id/retry', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  res.status(201).json({ data: await retryFacebookPublicationTarget(id, req.user) });
}));

router.get('/history', asyncHandler(async (req, res) => {
  const input = parseInput(searchSchema, req.query);
  const result = await query(
    `SELECT targets.*, users.name AS updated_by_name,
            campaigns.title AS campaign_title, campaigns.planned_date
     FROM facebook_publication_targets AS targets
     JOIN users ON users.id = targets.updated_by
     JOIN facebook_publication_campaigns AS campaigns ON campaigns.id = targets.campaign_id
     WHERE ($1 = '' OR targets.group_name ILIKE '%' || $1 || '%'
       OR targets.city ILIKE '%' || $1 || '%' OR campaigns.title ILIKE '%' || $1 || '%')
       AND ($2 = '' OR targets.status = $2)
     ORDER BY COALESCE(targets.published_at, targets.updated_at) DESC`,
    [input.search, input.status]
  );
  res.json({
    data: result.rows.map((row) => ({
      ...serializeFacebookPublicationTarget(row),
      campaignTitle: row.campaign_title,
      plannedDate: String(row.planned_date).slice(0, 10)
    }))
  });
}));

router.get('/risk-summary', asyncHandler(async (req, res) => {
  res.json({ data: await facebookPublicationRiskSummary(req.user.id) });
}));

export default router;
