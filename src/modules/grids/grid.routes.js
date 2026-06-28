import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { serializeGrid } from '../../lib/serializers.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const idSchema = z.string().uuid();
const bannerSchema = z.object({
  title: z.string().max(300).default(''),
  endDate: z.string().max(20).default(''),
  endTime: z.string().max(10).default(''),
  imageUrl: z.string().max(4000).default(''),
  targetUrl: z.string().max(4000).default(''),
  disableWhenExpired: z.boolean().default(false)
});
const gridSchema = z.object({
  name: z.string().trim().min(1, 'Вкажіть назву сітки.').max(160),
  shareDescription: z.string().max(2000).default(''),
  banners: z.array(bannerSchema).min(1, 'Додайте хоча б один банер.').max(100)
});

router.get('/', asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const result = await query(
    `SELECT grids.id, grids.name, grids.share_description, grids.banners,
            grids.user_id AS owner_id, users.name AS owner_name,
            grids.user_id = $1 AS is_owner,
            grids.created_at, grids.updated_at
     FROM banner_grids AS grids
     JOIN users ON users.id = grids.user_id
     WHERE $2 = '' OR grids.name ILIKE '%' || $2 || '%'
     ORDER BY grids.updated_at DESC`,
    [req.user.id, search]
  );
  res.json({ data: result.rows.map(serializeGrid) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const result = await query(
    `SELECT grids.id, grids.name, grids.share_description, grids.banners,
            grids.user_id AS owner_id, users.name AS owner_name,
            grids.user_id = $2 AS is_owner,
            grids.created_at, grids.updated_at
     FROM banner_grids AS grids
     JOIN users ON users.id = grids.user_id
     WHERE grids.id = $1`,
    [id, req.user.id]
  );
  if (!result.rows[0]) throw new AppError(404, 'GRID_NOT_FOUND', 'Сітку не знайдено.');
  res.json({ data: serializeGrid(result.rows[0]) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const input = parseInput(gridSchema, req.body);
  const result = await query(
    `INSERT INTO banner_grids (user_id, name, share_description, banners)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id, name, share_description, banners, user_id AS owner_id, created_at, updated_at`,
    [req.user.id, input.name, input.shareDescription, JSON.stringify(input.banners)]
  );
  res.status(201).json({ data: serializeGrid(result.rows[0], req.user) });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(gridSchema, req.body);
  const result = await query(
    `UPDATE banner_grids
     SET name = $1, share_description = $2, banners = $3::jsonb, updated_at = NOW()
     WHERE id = $4 AND user_id = $5
     RETURNING id, name, share_description, banners, user_id AS owner_id, created_at, updated_at`,
    [input.name, input.shareDescription, JSON.stringify(input.banners), id, req.user.id]
  );
  if (!result.rows[0]) throw new AppError(404, 'GRID_NOT_FOUND', 'Сітку не знайдено.');
  res.json({ data: serializeGrid(result.rows[0], req.user) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const result = await query('DELETE FROM banner_grids WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (!result.rowCount) throw new AppError(404, 'GRID_NOT_FOUND', 'Сітку не знайдено.');
  res.status(204).end();
}));

export default router;
