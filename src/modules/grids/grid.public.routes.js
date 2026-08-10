import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { bannerGridEmbedScript } from './grid-embed.service.js';

const router = Router();
const idSchema = z.string().uuid();

function requestOrigin(req) {
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  if (!host) return '';
  try {
    return new URL(`${forwardedProto}://${host}`).origin;
  } catch {
    return '';
  }
}

router.get('/:id/embed.js', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const result = await query('SELECT id, banners FROM banner_grids WHERE id = $1', [id]);
  if (!result.rows[0]) throw new AppError(404, 'GRID_NOT_FOUND', 'Сітку не знайдено.');

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.send(bannerGridEmbedScript(result.rows[0], requestOrigin(req)));
}));

export default router;
