import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import {
  getTitleLabelSettings,
  horoshopTitleLabelsToolId,
  publishTitleLabels,
  setTitleLabelsEnabled,
  updateTitleLabelDraft
} from './title-labels.service.js';

const router = Router();
router.use(requireAuth, requireToolAccess(horoshopTitleLabelsToolId));

const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/iu, 'Колір має бути у форматі #RRGGBB.');
const ruleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  text: z.string().trim().min(1).max(30),
  stickerKeys: z.array(z.string().trim().min(1).max(120)).max(30),
  backgroundColor: colorSchema,
  textColor: colorSchema,
  borderColor: colorSchema,
  borderRadius: z.number().int().min(0).max(20),
  enabled: z.boolean()
});
const rulesSchema = z.object({ rules: z.array(ruleSchema).max(50) });
const enabledSchema = z.object({ enabled: z.boolean() });

function requestOrigin(req) {
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  try { return new URL(`${forwardedProto}://${host}`).origin; } catch { return ''; }
}

router.get('/settings', asyncHandler(async (req, res) => {
  res.json({ data: await getTitleLabelSettings(requestOrigin(req)) });
}));

router.put('/settings/draft', asyncHandler(async (req, res) => {
  const { rules } = parseInput(rulesSchema, req.body);
  res.json({ data: await updateTitleLabelDraft(rules, req.user.id, requestOrigin(req)) });
}));

router.post('/settings/publish', asyncHandler(async (req, res) => {
  const { rules } = parseInput(rulesSchema, req.body);
  res.json({ data: await publishTitleLabels(rules, req.user.id, requestOrigin(req)) });
}));

router.patch('/settings/enabled', asyncHandler(async (req, res) => {
  const { enabled } = parseInput(enabledSchema, req.body);
  res.json({ data: await setTitleLabelsEnabled(enabled, req.user.id, requestOrigin(req)) });
}));

export default router;
