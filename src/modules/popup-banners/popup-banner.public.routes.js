import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import {
  popupEmbedScript,
  recordPopupEvent,
  resolvePopupCampaign,
  submitPopupContact
} from './popup-banner.service.js';

const router = Router();
router.use(rateLimit({
  windowMs: 60_000,
  limit: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'POPUP_RATE_LIMITED', message: 'Забагато запитів до попап-банерів.' } }
}));

const resolveSchema = z.object({
  pageUrl: z.string().trim().min(1).max(4000),
  article: z.string().trim().max(300).optional().default(''),
  stockState: z.enum(['unknown', 'in_stock', 'out_of_stock']).optional().default('unknown')
});
const eventSchema = z.object({
  publicId: z.string().uuid(),
  eventType: z.enum(['impression', 'dismiss', 'click', 'acknowledge', 'copy', 'promo_cta']),
  pageUrl: z.string().trim().max(4000).default(''),
  article: z.string().trim().max(300).default(''),
  visitorKey: z.string().trim().max(200).default(''),
  metadata: z.record(z.string(), z.unknown()).optional().default({})
});
const contactSchema = z.object({
  values: z.record(z.string(), z.union([z.string().max(2000), z.boolean()])),
  pageUrl: z.string().trim().min(1).max(4000),
  article: z.string().trim().max(300).optional().default(''),
  visitorKey: z.string().trim().max(200).optional().default('')
});
const contactLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'POPUP_CONTACT_RATE_LIMITED', message: 'Забагато спроб. Спробуйте ще раз за хвилину.' } }
});

function requestOrigin(req) {
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  try { return new URL(`${forwardedProto}://${host}`).origin; } catch { return ''; }
}

router.get('/resolve', asyncHandler(async (req, res) => {
  const input = parseInput(resolveSchema, req.query);
  const data = await resolvePopupCampaign({
    ...input,
    requestOrigin: String(req.get('origin') || '')
  });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data });
}));

router.post('/events', asyncHandler(async (req, res) => {
  await recordPopupEvent(parseInput(eventSchema, req.body));
  res.status(204).end();
}));

router.post('/:publicId/contacts', contactLimiter, asyncHandler(async (req, res) => {
  const publicId = parseInput(z.string().uuid(), req.params.publicId);
  const data = await submitPopupContact({
    publicId,
    ...parseInput(contactSchema, req.body),
    requestOrigin: String(req.get('origin') || '')
  });
  res.status(data.duplicate ? 200 : 201).json({ data });
}));

router.get('/embed.js', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('application/javascript').send(popupEmbedScript(requestOrigin(req)));
});

export default router;
