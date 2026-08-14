import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../../lib/async-handler.js';
import { parseInput } from '../../../lib/validation.js';
import { requireAuth } from '../../../middleware/auth.js';
import { requireToolAccess } from '../../access/access.service.js';
import {
  HOROSHOP_CODEX_REVIEW_FORMAT,
  horoshopAccessoryService
} from './accessory.service.js';

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
const codexScoreSchema = z.number().min(0).max(1);
const codexReviewSchema = z.object({
  format: z.literal(HOROSHOP_CODEX_REVIEW_FORMAT),
  connectionGeneration: z.string().uuid(),
  catalogRevision: z.string().regex(/^[a-f0-9]{64}$/u),
  products: z.array(z.object({
    productId: z.string().uuid(),
    recommendations: z.array(z.object({
      productId: z.string().uuid(),
      reason: z.string().trim().min(10).max(700),
      scores: z.object({
        compatibility: codexScoreSchema,
        utility: codexScoreSchema,
        availability: codexScoreSchema,
        popularity: codexScoreSchema,
        total: codexScoreSchema
      })
    })).max(16)
  })).max(10_000)
});
const publicationSchema = z.object({ confirmOverwrite: z.literal(true) });

router.use(requireAuth, requireToolAccess('horoshop_related_products'));
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/review/catalog', asyncHandler(async (_req, res) => {
  res.json({ data: await horoshopAccessoryService.reviewCatalog() });
}));

router.post('/review/proposals', asyncHandler(async (req, res) => {
  const document = parseInput(codexReviewSchema, req.body);
  res.json({ data: await horoshopAccessoryService.importReview(document, req.user.id) });
}));

router.post('/review/proposals/accept-all', asyncHandler(async (req, res) => {
  res.json({ data: await horoshopAccessoryService.acceptAllReviewProposals(req.user.id) });
}));

router.get('/publications/pending', asyncHandler(async (_req, res) => {
  res.json({ data: await horoshopAccessoryService.publicationSummary() });
}));

router.post('/publications/publish-all', asyncHandler(async (req, res) => {
  parseInput(publicationSchema, req.body);
  res.json({ data: await horoshopAccessoryService.publishAll(req.user.id) });
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

router.post('/products/:productId/review/proposals/accept', asyncHandler(async (req, res) => {
  const { productId } = parseInput(productParamsSchema, req.params);
  res.json({ data: await horoshopAccessoryService.acceptReviewProposals(productId, req.user.id) });
}));

router.post('/products/:productId/publish', asyncHandler(async (req, res) => {
  const { productId } = parseInput(productParamsSchema, req.params);
  parseInput(publicationSchema, req.body);
  res.json({ data: await horoshopAccessoryService.publish(productId, req.user.id) });
}));

export default router;
