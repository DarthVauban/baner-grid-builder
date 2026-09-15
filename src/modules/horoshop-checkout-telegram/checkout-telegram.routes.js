import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import {
  getCheckoutTelegramSettings,
  horoshopCheckoutTelegramToolId,
  publishCheckoutTelegram,
  setCheckoutTelegramEnabled,
  updateCheckoutTelegramDraft
} from './checkout-telegram.service.js';

const router = Router();
router.use(requireAuth, requireToolAccess(horoshopCheckoutTelegramToolId));

const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/iu, 'Колір має бути у форматі #RRGGBB.');
const configSchema = z.object({
  telegramUrl: z.string().trim().max(500),
  buttonText: z.string().trim().min(1).max(80),
  buttonBackgroundColor: colorSchema,
  buttonHoverBackgroundColor: colorSchema,
  buttonTextColor: colorSchema,
  buttonBorderColor: colorSchema,
  buttonBorderRadius: z.number().int().min(0).max(32),
  buttonFontSize: z.number().int().min(12).max(24),
  qrSize: z.number().int().min(160).max(320)
});
const enabledSchema = z.object({ enabled: z.boolean() });

function requestOrigin(req) {
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  try { return new URL(`${forwardedProto}://${host}`).origin; } catch { return ''; }
}

router.get('/settings', asyncHandler(async (req, res) => {
  res.json({ data: await getCheckoutTelegramSettings(requestOrigin(req)) });
}));

router.put('/settings/draft', asyncHandler(async (req, res) => {
  const config = parseInput(configSchema, req.body);
  res.json({ data: await updateCheckoutTelegramDraft(config, req.user.id, requestOrigin(req)) });
}));

router.post('/settings/publish', asyncHandler(async (req, res) => {
  const config = parseInput(configSchema, req.body);
  res.json({ data: await publishCheckoutTelegram(config, req.user.id, requestOrigin(req)) });
}));

router.patch('/settings/enabled', asyncHandler(async (req, res) => {
  const { enabled } = parseInput(enabledSchema, req.body);
  res.json({ data: await setCheckoutTelegramEnabled(enabled, req.user.id, requestOrigin(req)) });
}));

export default router;
