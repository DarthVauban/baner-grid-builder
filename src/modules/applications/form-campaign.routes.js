import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import { horoshopCatalogService } from '../search/horoshop/catalog.service.js';
import {
  archiveFormCampaign,
  createFormCampaign,
  listFormCampaigns,
  loadFormCampaign,
  setFormCampaignStatus,
  updateFormCampaign
} from './form-campaign.service.js';

const router = Router();
router.use(requireAuth, requireToolAccess('form_builder'));
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const idSchema = z.string().uuid();
const placementSchema = z.object({
  selector: z.string().trim().min(1).max(500),
  insertPosition: z.enum(['start', 'end', 'before', 'after']).default('end')
});
const stylesSchema = z.object({
  backgroundColor: z.string().trim().max(120).default('#6d5dfc'),
  color: z.string().trim().max(120).default('#ffffff'),
  borderRadius: z.string().trim().max(120).default('12px'),
  padding: z.string().trim().max(120).default('12px 18px'),
  fontWeight: z.string().trim().max(120).default('700'),
  fontSize: z.string().trim().max(120).default('inherit')
});
const targetSchema = z.object({
  productId: z.string().uuid(),
  modificationId: z.string().uuid().nullable().optional().default(null)
});
const campaignSchema = z.object({
  formId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  priority: z.number().int().min(0).max(1000).default(100),
  buttonText: z.string().trim().min(1).max(120),
  buttonStyles: stylesSchema,
  placement: z.object({ desktop: placementSchema, mobile: placementSchema }),
  availabilityMode: z.enum(['all', 'out_of_stock']).default('all'),
  startsAt: z.string().datetime({ offset: true }).nullable().optional().default(null),
  endsAt: z.string().datetime({ offset: true }).nullable().optional().default(null),
  targets: z.array(targetSchema).min(1).max(500)
}).superRefine((input, context) => {
  if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endsAt'],
      message: 'Завершення має бути пізніше за початок.'
    });
  }
});
const catalogQuerySchema = z.object({
  search: z.string().trim().max(160).optional().default(''),
  category: z.string().trim().max(255).optional().default(''),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(10).max(100).optional().default(25)
});

function publicOrigin(req) {
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  try { return new URL(`${forwardedProto}://${host}`).origin; } catch { return '' ; }
}

router.get('/catalog', asyncHandler(async (req, res) => {
  const input = parseInput(catalogQuerySchema, req.query);
  res.json({ data: await horoshopCatalogService.catalog({
    ...input,
    visibility: 'visible',
    state: 'active'
  }) });
}));

router.get('/embed-code', (req, res) => {
  const src = `${publicOrigin(req)}/api/public/application-form-campaigns/embed.js`;
  res.json({ data: { code: `<script async src="${src}"></script>` } });
});

router.get('/', asyncHandler(async (req, res) => {
  const formId = req.query.formId ? parseInput(idSchema, req.query.formId) : '';
  res.json({ data: await listFormCampaigns({ formId }) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const input = parseInput(campaignSchema, req.body);
  res.status(201).json({ data: await createFormCampaign(input, req.user.id) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const campaign = await loadFormCampaign(id);
  if (!campaign) return res.status(404).json({ error: { code: 'FORM_CAMPAIGN_NOT_FOUND', message: 'Розміщення не знайдено.' } });
  return res.json({ data: campaign });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(campaignSchema, req.body);
  res.json({ data: await updateFormCampaign(id, input, req.user.id) });
}));

router.patch('/:id/status', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const { status } = parseInput(z.object({ status: z.enum(['draft', 'active', 'paused']) }), req.body);
  res.json({ data: await setFormCampaignStatus(id, status, req.user.id) });
}));

router.patch('/:id/archive', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  await archiveFormCampaign(id, req.user.id);
  res.status(204).end();
}));

export default router;
