import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../../config/env.js';
import { asyncHandler } from '../../../lib/async-handler.js';
import { parseInput } from '../../../lib/validation.js';
import { requireAuth, requireRole } from '../../../middleware/auth.js';
import { horoshopCatalogService } from './catalog.service.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const connectSchema = z.object({
  storeDomain: z.string().trim().min(4, 'Вкажіть домен магазину.').max(253),
  login: z.string().trim().min(1, 'Вкажіть логін адміністратора Хорошоп.').max(320),
  password: z.string().min(1, 'Вкажіть пароль адміністратора Хорошоп.').max(4000),
  pollingIntervalMinutes: z.number().int().min(1).max(1440).default(env.SEARCH_SYNC_INTERVAL_MINUTES)
});
const disconnectSchema = z.object({
  confirmDomain: z.string().trim().min(4).max(253)
});

router.get('/', asyncHandler(async (req, res) => {
  res.json({ data: await horoshopCatalogService.status() });
}));

router.post('/connect', asyncHandler(async (req, res) => {
  const input = parseInput(connectSchema, req.body);
  await horoshopCatalogService.connect(input, req.user.id);
  await horoshopCatalogService.startSync('full', req.user.id);
  res.status(201).json({ data: await horoshopCatalogService.status() });
}));

router.post('/sync', asyncHandler(async (req, res) => {
  const started = await horoshopCatalogService.startSync('manual', req.user.id);
  res.status(202).json({ data: { started, integration: await horoshopCatalogService.status() } });
}));

router.delete('/', asyncHandler(async (req, res) => {
  const { confirmDomain } = parseInput(disconnectSchema, req.body);
  const deleted = await horoshopCatalogService.disconnect(confirmDomain, req.user.id);
  res.json({ data: { deleted, integration: await horoshopCatalogService.status() } });
}));

export default router;
