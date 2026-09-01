import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import {
  createPopupCampaign,
  deletePopupCampaign,
  getPopupCampaign,
  listPopupCampaigns,
  popupBannerAnalytics,
  popupBannerToolId,
  popupCampaignOptions,
  popupEmbedCode,
  setPopupCampaignStatus,
  updatePopupCampaign
} from './popup-banner.service.js';

const router = Router();
router.use(requireAuth, requireToolAccess(popupBannerToolId));

const idSchema = z.string().uuid();
const nullableDateSchema = z.union([
  z.string().datetime({ offset: true }),
  z.literal(''),
  z.null()
]).optional().transform((value) => value || null);
const contentSchema = z.object({
  eyebrow: z.string().max(120).optional(),
  title: z.string().trim().min(1).max(240),
  body: z.string().trim().min(1).max(3000),
  primaryLabel: z.string().trim().min(1).max(120),
  primaryUrl: z.string().max(2000).optional().default(''),
  secondaryLabel: z.string().max(120).optional().default(''),
  imageUrl: z.string().max(2000).optional().default(''),
  acknowledgementLabel: z.string().max(300).optional().default('')
});
const stylesSchema = z.object({
  layout: z.enum(['modal', 'bottom-sheet', 'corner']),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u),
  mutedColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u),
  primaryButtonBackgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u).optional(),
  primaryButtonTextColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u).optional(),
  secondaryButtonBackgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u).optional(),
  secondaryButtonTextColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u).optional(),
  checkboxAccentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u).optional(),
  checkboxCheckColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u).optional(),
  checkboxTextColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u).optional(),
  eyebrowFontSize: z.number().min(8).max(32).optional(),
  titleFontSize: z.number().min(18).max(72).optional(),
  bodyFontSize: z.number().min(10).max(36).optional(),
  acknowledgementFontSize: z.number().min(10).max(28).optional(),
  buttonFontSize: z.number().min(10).max(28).optional(),
  borderRadius: z.number().min(0).max(40),
  maxWidth: z.number().min(320).max(1400)
});
const targetPageUrlSchema = z.string().trim().max(2000).default('').refine((value) => {
  if (!value) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, 'Вкажіть повне посилання сторінки з http:// або https://.');
const targetingSchema = z.object({
  mode: z.enum(['all_pages', 'all_products', 'products', 'rules', 'target_page', 'out_of_stock']),
  match: z.enum(['all', 'any']).default('all'),
  stickers: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  brands: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  categoryIds: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  conditions: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  targetPageUrl: targetPageUrlSchema,
  urlContains: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  recommendationLimit: z.number().int().min(3).max(8).default(6)
}).superRefine((value, context) => {
  if (value.mode === 'target_page' && !value.targetPageUrl) {
    context.addIssue({
      code: 'custom',
      path: ['targetPageUrl'],
      message: 'Вкажіть цільову сторінку для показу попапа.'
    });
  }
});
const behaviorSchema = z.object({
  delayMs: z.number().int().min(0).max(60_000),
  frequency: z.enum(['always', 'session', 'product', 'days']),
  cooldownDays: z.number().int().min(1).max(365),
  dismissible: z.boolean(),
  requireAcknowledgement: z.boolean(),
  buttonCount: z.union([z.literal(1), z.literal(2)]).optional()
});
const campaignSchema = z.object({
  name: z.string().trim().min(1).max(160),
  priority: z.number().int().min(0).max(1000),
  content: contentSchema,
  styles: stylesSchema,
  targeting: targetingSchema,
  behavior: behaviorSchema,
  startsAt: nullableDateSchema,
  endsAt: nullableDateSchema,
  productEntries: z.array(z.string().trim().min(1).max(500)).max(500).default([])
}).refine((value) => !value.startsAt || !value.endsAt || new Date(value.endsAt) > new Date(value.startsAt), {
  message: 'Дата завершення має бути пізніше дати початку.',
  path: ['endsAt']
});
const statusSchema = z.object({ status: z.enum(['draft', 'active', 'paused']) });
const analyticsSchema = z.object({
  days: z.coerce.number().int().min(7).max(90).optional().default(30),
  campaignId: z.union([z.string().uuid(), z.literal('')]).optional().default('').transform((value) => value || null)
});

function requestOrigin(req) {
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  try { return new URL(`${forwardedProto}://${host}`).origin; } catch { return ''; }
}

router.get('/', asyncHandler(async (req, res) => {
  res.json({ data: await listPopupCampaigns() });
}));

router.get('/options', asyncHandler(async (req, res) => {
  res.json({ data: await popupCampaignOptions() });
}));

router.get('/embed-code', (req, res) => {
  res.json({ data: { code: popupEmbedCode(requestOrigin(req)) } });
});

router.get('/analytics/overview', asyncHandler(async (req, res) => {
  res.json({ data: await popupBannerAnalytics(parseInput(analyticsSchema, req.query)) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json({ data: await getPopupCampaign(parseInput(idSchema, req.params.id)) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const campaign = await createPopupCampaign(parseInput(campaignSchema, req.body), req.user.id);
  res.status(201).json({ data: campaign });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const campaign = await updatePopupCampaign(
    parseInput(idSchema, req.params.id),
    parseInput(campaignSchema, req.body),
    req.user.id
  );
  res.json({ data: campaign });
}));

router.patch('/:id/status', asyncHandler(async (req, res) => {
  const { status } = parseInput(statusSchema, req.body);
  res.json({ data: await setPopupCampaignStatus(parseInput(idSchema, req.params.id), status, req.user.id) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await deletePopupCampaign(parseInput(idSchema, req.params.id));
  res.status(204).end();
}));

export default router;
