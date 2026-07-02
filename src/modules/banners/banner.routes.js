import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { serializeBanner } from '../../lib/serializers.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { canViewAllSavedData } from '../access/access.service.js';

const router = Router();
router.use(requireAuth);

const idSchema = z.string().uuid();
const bannerDataSchema = z.object({
  title: z.string().trim().min(1, 'Вкажіть заголовок банера.').max(300),
  endDate: z.string().min(1, 'Вкажіть дату завершення.').max(20),
  endTime: z.string().max(10).default(''),
  imageUrl: z.string().trim().min(1, 'Вкажіть посилання на зображення.').max(4000),
  targetUrl: z.string().trim().min(1, 'Вкажіть посилання банера.').max(4000),
  disableWhenExpired: z.boolean().default(false)
});
const savedBannerSchema = z.object({
  name: z.string().trim().min(1).max(300),
  banner: bannerDataSchema
});

router.get('/', asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const canViewAll = await canViewAllSavedData(req.user, 'saved_banners');
  const result = await query(
    `SELECT banners.id, banners.name, banners.data,
            banners.user_id AS owner_id, users.name AS owner_name,
            banners.user_id = $1 AS is_owner,
            banners.created_at, banners.updated_at
     FROM saved_banners AS banners
     JOIN users ON users.id = banners.user_id
     WHERE ($3::BOOLEAN OR banners.user_id = $1)
       AND ($2 = '' OR banners.name ILIKE '%' || $2 || '%')
     ORDER BY banners.updated_at DESC`,
    [req.user.id, search, canViewAll]
  );
  res.json({ data: result.rows.map(serializeBanner) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const canViewAll = await canViewAllSavedData(req.user, 'saved_banners');
  const result = await query(
    `SELECT banners.id, banners.name, banners.data,
            banners.user_id AS owner_id, users.name AS owner_name,
            banners.user_id = $2 AS is_owner,
            banners.created_at, banners.updated_at
     FROM saved_banners AS banners
     JOIN users ON users.id = banners.user_id
     WHERE banners.id = $1 AND ($3::BOOLEAN OR banners.user_id = $2)`,
    [id, req.user.id, canViewAll]
  );
  if (!result.rows[0]) throw new AppError(404, 'BANNER_NOT_FOUND', 'Банер не знайдено.');
  res.json({ data: serializeBanner(result.rows[0]) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const input = parseInput(savedBannerSchema, req.body);
  const result = await query(
    `INSERT INTO saved_banners (user_id, name, data)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id, name, data, user_id AS owner_id, created_at, updated_at`,
    [req.user.id, input.name, JSON.stringify(input.banner)]
  );
  res.status(201).json({ data: serializeBanner(result.rows[0], req.user) });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(savedBannerSchema, req.body);
  const result = await query(
    `UPDATE saved_banners SET name = $1, data = $2::jsonb, updated_at = NOW()
     WHERE id = $3 AND user_id = $4
     RETURNING id, name, data, user_id AS owner_id, created_at, updated_at`,
    [input.name, JSON.stringify(input.banner), id, req.user.id]
  );
  if (!result.rows[0]) throw new AppError(404, 'BANNER_NOT_FOUND', 'Банер не знайдено.');
  res.json({ data: serializeBanner(result.rows[0], req.user) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const result = await query('DELETE FROM saved_banners WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (!result.rowCount) throw new AppError(404, 'BANNER_NOT_FOUND', 'Банер не знайдено.');
  res.status(204).end();
}));

export default router;
