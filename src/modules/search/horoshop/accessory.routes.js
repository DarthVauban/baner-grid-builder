import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../../lib/async-handler.js';
import { parseInput } from '../../../lib/validation.js';
import { requireAuth } from '../../../middleware/auth.js';
import { requireToolAccess } from '../../access/access.service.js';
import { horoshopAccessoryService } from './accessory.service.js';

const router = Router();
const productParamsSchema = z.object({ productId: z.string().uuid() });
const candidatesSchema = z.object({
  search: z.string().trim().min(1).max(160),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20)
});
const draftSchema = z.object({
  items: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('product'), id: z.string().uuid() }),
    z.object({ type: z.literal('category'), id: z.string().uuid() })
  ])).max(32)
});
const recommendationSchema = z.object({
  limit: z.number().int().min(4).max(16).optional().default(12)
});
const publicationSchema = z.object({ confirmOverwrite: z.literal(true) });

router.use(requireAuth, requireToolAccess('horoshop_related_products'));
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.post('/recommendations/bulk', asyncHandler(async (req, res) => {
  const { limit } = parseInput(recommendationSchema, req.body || {});
  res.json({ data: await horoshopAccessoryService.generateAllRecommendations(limit, req.user.id) });
}));

router.get('/products/:productId', asyncHandler(async (req, res) => {
  const { productId } = parseInput(productParamsSchema, req.params);
  res.json({ data: await horoshopAccessoryService.detail(productId, req.user.id) });
}));

router.get('/products/:productId/candidates', asyncHandler(async (req, res) => {
  const { productId } = parseInput(productParamsSchema, req.params);
  const input = parseInput(candidatesSchema, req.query);
  res.json({ data: await horoshopAccessoryService.candidates(productId, input.search, input.limit) });
}));

router.put('/products/:productId/draft', asyncHandler(async (req, res) => {
  const { productId } = parseInput(productParamsSchema, req.params);
  const { items } = parseInput(draftSchema, req.body);
  res.json({ data: await horoshopAccessoryService.saveDraft(productId, items, req.user.id) });
}));

router.post('/products/:productId/recommendations', asyncHandler(async (req, res) => {
  const { productId } = parseInput(productParamsSchema, req.params);
  const { limit } = parseInput(recommendationSchema, req.body || {});
  res.json({ data: await horoshopAccessoryService.generateRecommendations(productId, limit, req.user.id) });
}));

router.post('/products/:productId/publish', asyncHandler(async (req, res) => {
  const { productId } = parseInput(productParamsSchema, req.params);
  parseInput(publicationSchema, req.body);
  res.json({ data: await horoshopAccessoryService.publish(productId, req.user.id) });
}));

export default router;
