import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../../lib/async-handler.js';
import { parseInput } from '../../../lib/validation.js';
import { requireAuth } from '../../../middleware/auth.js';
import { requireToolAccess } from '../../access/access.service.js';
import { horoshopCatalogService } from './catalog.service.js';

const router = Router();
const catalogQuerySchema = z.object({
  search: z.string().trim().max(160).optional().default(''),
  category: z.string().trim().max(255).optional().default(''),
  availability: z.string().trim().max(200).optional().default(''),
  visibility: z.enum(['all', 'visible', 'hidden']).optional().default('all'),
  state: z.enum(['active', 'inactive', 'all']).optional().default('active'),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(10).max(100).optional().default(25)
});

router.use(requireAuth, requireToolAccess('horoshop_related_products'));
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/catalog', asyncHandler(async (req, res) => {
  const input = parseInput(catalogQuerySchema, req.query);
  res.json({ data: await horoshopCatalogService.catalog(input) });
}));

router.post('/sync', asyncHandler(async (req, res) => {
  const started = await horoshopCatalogService.startSync('manual', req.user.id);
  res.status(202).json({
    data: { started, integration: await horoshopCatalogService.status() }
  });
}));

export default router;
