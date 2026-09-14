import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { createPublicApplication } from './public.routes.js';
import {
  formCampaignEmbedScript,
  resolveFormCampaignSubmission,
  resolvePublicFormCampaign
} from './form-campaign.service.js';

const router = Router();
router.use(rateLimit({
  windowMs: 60_000,
  limit: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'FORM_CAMPAIGN_RATE_LIMITED', message: 'Забагато запитів до форми.' } }
}));

const resolveSchema = z.object({
  pageUrl: z.string().trim().min(1).max(4000),
  article: z.string().trim().max(300).optional().default('')
});
const submissionSchema = z.object({
  values: z.record(z.string(), z.unknown()).default({}),
  product: z.record(z.string(), z.unknown()).default({}),
  context: z.record(z.string(), z.unknown()).default({}),
  contextToken: z.string().trim().min(1).max(4000),
  idempotencyKey: z.string().trim().max(160).optional().default(''),
  honeypot: z.string().trim().max(200).optional().default('')
});
const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Забагато спроб. Спробуйте пізніше.' } }
});

function serverOrigin(req) {
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  try { return new URL(`${forwardedProto}://${host}`).origin; } catch { return ''; }
}

router.get('/embed.js', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('application/javascript').send(formCampaignEmbedScript(serverOrigin(req)));
});

router.get('/resolve', asyncHandler(async (req, res) => {
  const input = parseInput(resolveSchema, req.query);
  const data = await resolvePublicFormCampaign({
    ...input,
    requestOrigin: String(req.get('origin') || '')
  });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data });
}));

router.post('/:publicId/applications', submitLimiter, asyncHandler(async (req, res) => {
  const publicId = parseInput(z.string().uuid(), req.params.publicId);
  const input = parseInput(submissionSchema, req.body);
  if (input.honeypot) return res.status(204).end();
  const resolved = await resolveFormCampaignSubmission({
    publicId,
    contextToken: input.contextToken,
    sourceUrl: String(input.context?.sourceUrl || ''),
    requestOrigin: String(req.get('origin') || '')
  });
  const result = await createPublicApplication({
    publicId: resolved.form.publicId,
    input,
    req,
    formOverride: resolved.form,
    productOverride: resolved.product,
    contextOverride: {
      campaignPublicId: resolved.campaign.public_id,
      campaignName: resolved.campaign.name
    },
    source: 'preorder_campaign',
    historyComment: `Заявку на передзамовлення створено з розміщення «${resolved.campaign.name}»`,
    campaignId: resolved.campaign.id,
    campaignPublicId: resolved.campaign.public_id,
    campaignName: resolved.campaign.name
  });
  if (result.status === 204) return res.status(204).end();
  return res.status(result.status).json({ data: result.data });
}));

export default router;
