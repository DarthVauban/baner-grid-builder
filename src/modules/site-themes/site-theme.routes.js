import { Router, raw } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import { createMediaAsset } from '../media/media.service.js';
import { promoBarBackgroundImage } from './site-theme-presentation.js';
import {
  createSiteTheme,
  deleteSiteTheme,
  listSiteThemes,
  publishSiteTheme,
  setSiteThemeActive,
  setSiteThemeGoldGlintVisibility,
  setSiteThemePromoBarVisibility,
  siteThemeToolId,
  updateSiteTheme
} from './site-theme.service.js';

const router = Router();
router.use(requireAuth, requireToolAccess(siteThemeToolId));

const idSchema = z.uuid();
const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/iu, 'Вкажіть колір у форматі #RRGGBB.');
const fontSizeSchema = z.number().int().min(10).max(48);
const fontWeightSchema = z.literal([100, 200, 300, 400, 500, 600, 700, 800, 900]);
const textSchema = (maxLength) => z.string().trim().max(maxLength)
  .refine((value) => !value.includes('\0'), 'Видаліть неприпустимі символи.');
const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];

function isAllowedButtonUrl(value) {
  if (!value) return true;
  if (value.includes('\\') || Array.from(value).some((character) => character.charCodeAt(0) < 32)) return false;
  if (value.startsWith('/')) return !value.startsWith('//');
  if (!/^https?:\/\//iu.test(value)) return false;
  try {
    const url = new URL(value);
    return !url.username && !url.password;
  } catch {
    return false;
  }
}

const inputSchema = z.object({
  name: z.string().trim().min(1).max(120).refine((value) => !value.includes('\0'), 'Видаліть неприпустимі символи.'),
  promoBar: z.object({
    mode: z.enum(['standard', 'marquee']).optional(),
    marqueeSpeed: z.number().int().min(20).max(240).optional(),
    text: textSchema(240),
    buttonText: textSchema(80),
    buttonUrl: z.string().trim().max(500).refine(isAllowedButtonUrl, 'Вкажіть шлях від кореня сайту або повне посилання HTTP(S).'),
    backgroundColor: colorSchema,
    backgroundImageUrl: z.string().trim().max(2048).refine(
      (value) => !value || Boolean(promoBarBackgroundImage(value)),
      'Завантажте зображення або вкажіть повне HTTPS-посилання.'
    ).optional(),
    goldGlint: z.object({
      color: colorSchema,
      intensity: z.number().int().min(0).max(100),
      durationMs: z.number().int().min(500).max(4000),
      repeat: z.enum(['once', 'interval']),
      intervalSeconds: z.number().int().min(5).max(120)
    }).nullable().optional(),
    textColor: colorSchema,
    buttonColor: colorSchema,
    buttonTextColor: colorSchema,
    textFontSize: fontSizeSchema.optional(),
    textFontWeight: z.union([z.literal('inherit'), fontWeightSchema]).optional(),
    buttonFontSize: fontSizeSchema.optional(),
    buttonFontWeight: fontWeightSchema.optional(),
    buttonPaddingY: z.number().int().min(0).max(32).optional(),
    buttonPaddingX: z.number().int().min(0).max(48).optional(),
    alignment: z.enum(['left', 'center', 'right']),
    paddingY: z.number().int().min(0).max(40),
    paddingX: z.number().int().min(0).max(80),
    showDesktop: z.boolean(),
    showMobile: z.boolean()
  })
});
const activeSchema = z.object({ active: z.boolean() });
const visibilitySchema = z.object({ enabled: z.boolean() });

router.get('/', asyncHandler(async (_req, res) => {
  res.json({ data: await listSiteThemes() });
}));

router.post('/', asyncHandler(async (req, res) => {
  const input = parseInput(inputSchema, req.body);
  res.status(201).json({ data: await createSiteTheme(input, req.user.id) });
}));

router.post('/background-image', raw({ type: imageTypes, limit: '10mb' }), asyncHandler(async (req, res) => {
  if (!imageTypes.includes(req.get('content-type')?.split(';')[0].toLowerCase())) {
    throw new AppError(415, 'SITE_THEME_IMAGE_TYPE', 'Завантажте JPG, PNG або WebP.');
  }
  let originalName = 'promo-background';
  try { originalName = decodeURIComponent(req.get('x-file-name') || originalName); } catch { /* use the default */ }
  const asset = await createMediaAsset({ buffer: req.body, originalName, userId: req.user.id, folderId: null });
  res.status(201).json({ data: asset });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(inputSchema, req.body);
  res.json({ data: await updateSiteTheme(id, input, req.user.id) });
}));

router.post('/:id/publish', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  res.json({ data: await publishSiteTheme(id, req.user.id) });
}));

router.put('/:id/active', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const { active } = parseInput(activeSchema, req.body);
  res.json({ data: await setSiteThemeActive(id, active, req.user.id) });
}));

router.put('/:id/promo-bar/visibility', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const { enabled } = parseInput(visibilitySchema, req.body);
  res.json({ data: await setSiteThemePromoBarVisibility(id, enabled, req.user.id) });
}));

router.put('/:id/effects/gold-glint/visibility', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const { enabled } = parseInput(visibilitySchema, req.body);
  res.json({ data: await setSiteThemeGoldGlintVisibility(id, enabled, req.user.id) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  await deleteSiteTheme(id);
  res.status(204).end();
}));

export default router;
