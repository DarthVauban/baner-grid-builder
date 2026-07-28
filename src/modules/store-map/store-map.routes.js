import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import {
  analyzeStoreMapImportRows,
  commitStoreMapImportRows,
  normalizeStoreMapText,
  sanitizeStoreMapSvg,
  scheduleFromHoursText,
  serializeStoreMapPoint,
  serializeStoreMapSettings,
  storeMapEmbedScript,
  storeMapToolId
} from './store-map.service.js';

const router = Router();
router.use(requireAuth, requireToolAccess(storeMapToolId));

const publicRouter = Router();
const idSchema = z.string().uuid();
const pointInputSchema = z.object({
  externalId: z.string().trim().max(120).default(''),
  name: z.string().trim().min(1).max(240),
  city: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(500),
  hoursText: z.string().trim().max(120).default(''),
  publicationStatus: z.enum(['ACTIVE', 'HIDDEN']).default('ACTIVE'),
  openStatusOverride: z.enum(['AUTO', 'TEMPORARILY_CLOSED', 'CLOSED']).default('AUTO'),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180)
});
const settingsSchema = z.object({
  title: z.string().trim().min(1).max(180),
  markerSvg: z.string().max(200_000).default(''),
  markerWidth: z.coerce.number().int().min(16).max(160),
  markerHeight: z.coerce.number().int().min(16).max(180),
  markerAnchorX: z.coerce.number().int().min(0).max(160),
  markerAnchorY: z.coerce.number().int().min(0).max(180),
  centerLatitude: z.coerce.number().min(-90).max(90),
  centerLongitude: z.coerce.number().min(-180).max(180),
  defaultZoom: z.coerce.number().int().min(2).max(18)
});
const importRowsSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(5000)
});
const importCommitSchema = importRowsSchema.extend({
  importNew: z.boolean().default(true),
  updateExisting: z.boolean().default(true)
});

router.get('/points', asyncHandler(async (req, res) => {
  const search = normalizeStoreMapText(req.query.search || '');
  const publicationStatus = String(req.query.publicationStatus || '').toUpperCase();
  const result = await query(
    `SELECT *
     FROM store_map_points
     WHERE archived_at IS NULL
       AND ($1 = '' OR normalized_name LIKE '%' || $1 || '%'
         OR normalized_city LIKE '%' || $1 || '%'
         OR lower(address) LIKE '%' || $1 || '%')
       AND ($2 = '' OR publication_status = $2)
     ORDER BY normalized_city, normalized_name`,
    [search, ['ACTIVE', 'HIDDEN'].includes(publicationStatus) ? publicationStatus : '']
  );
  res.json({ data: result.rows.map(serializeStoreMapPoint) });
}));

router.post('/points', asyncHandler(async (req, res) => {
  const input = parseInput(pointInputSchema, req.body);
  const result = await query(
    `INSERT INTO store_map_points (
       external_id, name, normalized_name, city, normalized_city, address,
       hours_text, schedule, publication_status, open_status_override,
       latitude, longitude, created_by, updated_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::JSONB, $9, $10, $11, $12, $13, $13)
     RETURNING *`,
    [
      input.externalId,
      input.name,
      normalizeStoreMapText(input.name),
      input.city,
      normalizeStoreMapText(input.city),
      input.address,
      input.hoursText,
      JSON.stringify(scheduleFromHoursText(input.hoursText)),
      input.publicationStatus,
      input.openStatusOverride,
      input.latitude,
      input.longitude,
      req.user.id
    ]
  );
  res.status(201).json({ data: serializeStoreMapPoint(result.rows[0]) });
}));

router.put('/points/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(pointInputSchema, req.body);
  const result = await query(
    `UPDATE store_map_points
     SET external_id = $1,
         name = $2,
         normalized_name = $3,
         city = $4,
         normalized_city = $5,
         address = $6,
         hours_text = $7,
         schedule = $8::JSONB,
         publication_status = $9,
         open_status_override = $10,
         latitude = $11,
         longitude = $12,
         updated_by = $13,
         updated_at = NOW()
     WHERE id = $14 AND archived_at IS NULL
     RETURNING *`,
    [
      input.externalId,
      input.name,
      normalizeStoreMapText(input.name),
      input.city,
      normalizeStoreMapText(input.city),
      input.address,
      input.hoursText,
      JSON.stringify(scheduleFromHoursText(input.hoursText)),
      input.publicationStatus,
      input.openStatusOverride,
      input.latitude,
      input.longitude,
      req.user.id,
      id
    ]
  );
  if (!result.rows[0]) throw new AppError(404, 'STORE_MAP_POINT_NOT_FOUND', 'Торгову точку не знайдено.');
  res.json({ data: serializeStoreMapPoint(result.rows[0]) });
}));

router.delete('/points/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const result = await query(
    `UPDATE store_map_points
     SET archived_at = NOW(), updated_by = $1, updated_at = NOW()
     WHERE id = $2 AND archived_at IS NULL`,
    [req.user.id, id]
  );
  if (!result.rowCount) throw new AppError(404, 'STORE_MAP_POINT_NOT_FOUND', 'Торгову точку не знайдено.');
  res.status(204).end();
}));

router.get('/settings', asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM store_map_settings WHERE id = TRUE');
  res.json({ data: serializeStoreMapSettings(result.rows[0]) });
}));

router.put('/settings', asyncHandler(async (req, res) => {
  const input = parseInput(settingsSchema, req.body);
  const markerSvg = sanitizeStoreMapSvg(input.markerSvg);
  if (input.markerAnchorX > input.markerWidth || input.markerAnchorY > input.markerHeight) {
    throw new AppError(422, 'STORE_MAP_MARKER_ANCHOR_INVALID', 'Точка прив’язки має бути всередині розміру мітки.');
  }
  const result = await query(
    `UPDATE store_map_settings
     SET title = $1,
         marker_svg = $2,
         marker_width = $3,
         marker_height = $4,
         marker_anchor_x = $5,
         marker_anchor_y = $6,
         center_latitude = $7,
         center_longitude = $8,
         default_zoom = $9,
         updated_by = $10,
         updated_at = NOW()
     WHERE id = TRUE
     RETURNING *`,
    [
      input.title,
      markerSvg,
      input.markerWidth,
      input.markerHeight,
      input.markerAnchorX,
      input.markerAnchorY,
      input.centerLatitude,
      input.centerLongitude,
      input.defaultZoom,
      req.user.id
    ]
  );
  res.json({ data: serializeStoreMapSettings(result.rows[0]) });
}));

router.post('/imports/preview', asyncHandler(async (req, res) => {
  const input = parseInput(importRowsSchema, req.body);
  res.json({ data: await analyzeStoreMapImportRows(input.rows, { query }) });
}));

router.post('/imports/commit', asyncHandler(async (req, res) => {
  const input = parseInput(importCommitSchema, req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await commitStoreMapImportRows(input.rows, input, req.user.id, client);
    await client.query('COMMIT');
    res.status(201).json({ data: result });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}));

publicRouter.get('/embed.js', (req, res) => {
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  const origin = new URL(`${forwardedProto}://${host}`).origin;
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(storeMapEmbedScript(origin));
});

publicRouter.get('/', asyncHandler(async (req, res) => {
  const [settingsResult, pointsResult] = await Promise.all([
    query('SELECT * FROM store_map_settings WHERE id = TRUE'),
    query(
      `SELECT *
       FROM store_map_points
       WHERE archived_at IS NULL AND publication_status = 'ACTIVE'
       ORDER BY normalized_city, normalized_name`
    )
  ]);
  const points = pointsResult.rows.map(serializeStoreMapPoint);
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({
    data: {
      settings: serializeStoreMapSettings(settingsResult.rows[0]),
      points,
      cities: [...new Set(points.map((point) => point.city))].sort((left, right) => left.localeCompare(right, 'uk'))
    }
  });
}));

export { publicRouter as publicStoreMapRoutes };
export default router;
