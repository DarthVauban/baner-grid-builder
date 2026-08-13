import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import {
  decideQrLoginChallenge,
  previewQrLoginChallenge
} from './mobile-qr-login.service.js';

const router = Router();
const previewSchema = z.object({
  challengeId: z.string().uuid('QR-запит недійсний.'),
  scanToken: z.string().trim().min(32, 'QR-код недійсний.').max(256)
});
const decisionSchema = previewSchema.extend({
  approvalNonce: z.string().trim().min(32, 'Код підтвердження недійсний.').max(256),
  keyId: z.string().trim().min(8).max(160),
  signature: z.string().trim().min(64, 'Підпис пристрою недійсний.').max(256),
  signatureVersion: z.literal(1)
});
const previewLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: env.MOBILE_QR_PREVIEW_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.mobileDevice?.id || 'unknown'}:${ipKeyGenerator(req.ip)}`,
  message: { error: { code: 'TOO_MANY_QR_SCAN_ATTEMPTS', message: 'Забагато спроб сканування QR-коду.' } }
});
const decisionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: env.MOBILE_QR_DECISION_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.mobileDevice?.id || 'unknown'),
  message: { error: { code: 'TOO_MANY_QR_DECISIONS', message: 'Забагато спроб підтвердження QR-входу.' } }
});

router.post('/preview', previewLimiter, asyncHandler(async (req, res) => {
  const input = parseInput(previewSchema, req.body);
  res.json({ data: await previewQrLoginChallenge(
    req.user.id,
    req.mobileDevice.id,
    input.challengeId,
    input.scanToken
  ) });
}));

for (const action of ['approve', 'deny']) {
  router.post(`/${action}`, decisionLimiter, asyncHandler(async (req, res) => {
    const input = parseInput(decisionSchema, req.body);
    res.json({ data: await decideQrLoginChallenge({
      ...input,
      userId: req.user.id,
      deviceId: req.mobileDevice.id,
      action
    }) });
  }));
}

export default router;
