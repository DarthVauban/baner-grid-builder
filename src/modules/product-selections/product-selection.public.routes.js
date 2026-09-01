import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { productPromoLoaderScript, productSelectionEmbedScript } from './product-selection.embed.js';
import { loadPublicProductSelection, resolveProductPromo } from './product-selection.service.js';

const router = Router();
const uuidSchema = z.string().uuid();
const promoQuerySchema = z.object({ page: z.string().trim().min(1).max(4000) });

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

router.get('/promo-loader.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  res.send(productPromoLoaderScript(requestOrigin(req)));
});

router.get('/promo/:token', asyncHandler(async (req, res) => {
  const token = parseInput(uuidSchema, req.params.token);
  const input = parseInput(promoQuerySchema, req.query);
  const promo = await resolveProductPromo(token, input.page);
  if (!promo) throw new AppError(404, 'PRODUCT_PROMO_NOT_FOUND', 'Промооформлення для цієї сторінки недоступне.');
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: promo });
}));

router.get('/:publicId/embed.js', asyncHandler(async (req, res) => {
  const publicId = parseInput(uuidSchema, req.params.publicId);
  const selection = await loadPublicProductSelection(publicId);
  if (!selection) throw new AppError(404, 'PRODUCT_SELECTION_NOT_FOUND', 'Вибірку товарів не знайдено.');
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.send(productSelectionEmbedScript(selection));
}));

export default router;
