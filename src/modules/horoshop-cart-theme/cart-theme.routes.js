import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import {
  cartThemeIds,
  cartThemes,
  getCartThemeSettings,
  horoshopCartThemeToolId,
  publishCartTheme,
  setCartThemeEnabled,
  updateCartThemeDraft
} from './cart-theme.service.js';

const router = Router();
router.use(requireAuth, requireToolAccess(horoshopCartThemeToolId));

const selectionSchema = z.object({ themeId: z.enum(cartThemeIds) });
const enabledSchema = z.object({ enabled: z.boolean() });

function requestOrigin(req) {
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  try { return new URL(`${forwardedProto}://${host}`).origin; } catch { return ''; }
}

router.get('/settings', asyncHandler(async (req, res) => {
  res.json({
    data: {
      settings: await getCartThemeSettings(requestOrigin(req)),
      themes: cartThemes
    }
  });
}));

router.put('/settings/draft', asyncHandler(async (req, res) => {
  const selection = parseInput(selectionSchema, req.body);
  res.json({ data: await updateCartThemeDraft(selection, req.user.id, requestOrigin(req)) });
}));

router.post('/settings/publish', asyncHandler(async (req, res) => {
  const selection = parseInput(selectionSchema, req.body);
  res.json({ data: await publishCartTheme(selection, req.user.id, requestOrigin(req)) });
}));

router.patch('/settings/enabled', asyncHandler(async (req, res) => {
  const { enabled } = parseInput(enabledSchema, req.body);
  res.json({ data: await setCartThemeEnabled(enabled, req.user.id, requestOrigin(req)) });
}));

export default router;
