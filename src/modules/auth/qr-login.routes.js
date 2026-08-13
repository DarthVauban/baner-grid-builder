import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { AppError } from '../../lib/app-error.js';
import { createAccessToken } from '../../lib/jwt.js';
import { serializeUser } from '../../lib/serializers.js';
import { parseInput } from '../../lib/validation.js';
import { hashQrBrowserToken } from '../mobile/mobile-crypto.js';
import {
  cancelQrLoginChallenge,
  consumeQrLoginChallenge,
  createQrLoginChallenge,
  getQrLoginStatus,
  pollAfterMs
} from '../mobile/mobile-qr-login.service.js';
import { mobileWorkspaceMetadata } from '../mobile/mobile-workspace-config.js';
import { setSessionCookie } from './session-cookie.js';

const router = Router();
const createSchema = z.object({
  returnPath: z.string().trim().max(2048).optional().default('/')
});
const challengeSchema = z.object({
  challengeId: z.string().uuid('QR-запит недійсний.'),
  browserToken: z.string().trim().min(32, 'QR-запит недійсний.').max(256)
});

const createLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: env.MOBILE_QR_CREATE_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_QR_LOGIN_ATTEMPTS', message: 'Забагато QR-запитів. Спробуйте пізніше.' } }
});
const statusLimiter = rateLimit({
  windowMs: 3 * 60 * 1000,
  limit: env.MOBILE_QR_STATUS_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${hashQrBrowserToken(ipKeyGenerator(req.ip))}:${String(req.body?.challengeId || '')}`,
  message: { error: { code: 'TOO_MANY_QR_STATUS_REQUESTS', message: 'Забагато перевірок QR-входу.' } }
});
const browserActionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${hashQrBrowserToken(ipKeyGenerator(req.ip))}:${String(req.body?.challengeId || '')}`,
  message: { error: { code: 'TOO_MANY_QR_LOGIN_ATTEMPTS', message: 'Забагато QR-запитів. Спробуйте пізніше.' } }
});

function requireTrustedOrigin(req, _res, next) {
  const origin = String(req.get('origin') || '').replace(/\/$/, '');
  if (origin && origin !== env.mobilePublicOrigin) {
    return next(new AppError(403, 'QR_LOGIN_ORIGIN_REJECTED', 'QR-вхід доступний лише з цього робочого простору.'));
  }
  return next();
}

router.get('/config', (_req, res) => {
  res.json({ data: {
    enabled: env.mobileQrLoginEnabled,
    multiAccountPairingEnabled: env.mobileMultiAccountPairingEnabled,
    ttlSeconds: env.mobileQrLoginTtlSeconds,
    pollAfterMs,
    deployment: mobileWorkspaceMetadata({ includeApiBaseUrl: false })
  } });
});

router.post('/', requireTrustedOrigin, createLimiter, asyncHandler(async (req, res) => {
  const input = parseInput(createSchema, req.body || {});
  res.status(201).json({ data: await createQrLoginChallenge(req, input.returnPath) });
}));

router.post('/status', requireTrustedOrigin, statusLimiter, asyncHandler(async (req, res) => {
  const input = parseInput(challengeSchema, req.body);
  res.json({ data: await getQrLoginStatus(input.challengeId, input.browserToken) });
}));

router.post('/consume', requireTrustedOrigin, browserActionLimiter, asyncHandler(async (req, res) => {
  const input = parseInput(challengeSchema, req.body);
  const result = await consumeQrLoginChallenge(input.challengeId, input.browserToken);
  setSessionCookie(res, createAccessToken(result.user));
  res.json({ data: { user: serializeUser(result.user), returnPath: result.returnPath } });
}));

router.post('/cancel', requireTrustedOrigin, browserActionLimiter, asyncHandler(async (req, res) => {
  const input = parseInput(challengeSchema, req.body);
  await cancelQrLoginChallenge(input.challengeId, input.browserToken);
  res.status(204).end();
}));

export default router;
