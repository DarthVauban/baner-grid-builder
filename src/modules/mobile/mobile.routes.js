import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { AppError } from '../../lib/app-error.js';
import { parseInput } from '../../lib/validation.js';
import {
  mobileDeviceAuth,
  requireMobileDeviceAuth
} from '../../middleware/mobile-device-auth.js';
import {
  revokeMobileDevice,
  setMobileDevicePushToken
} from './mobile-device.service.js';
import { hashPairingManualCode, hashPairingQrToken } from './mobile-crypto.js';
import { claimMobilePairing } from './mobile-pairing.service.js';

const router = Router();
const idSchema = z.string().uuid();
const pairingClaimSchema = z.object({
  pairingToken: z.string().trim().min(1, 'Вкажіть код підключення.').max(4096),
  platform: z.enum(['android', 'ios']),
  deviceName: z.string().trim().min(2, 'Вкажіть назву пристрою.').max(160)
});
const pushTokenSchema = z.object({
  token: z.string().trim().min(20, 'Push token недійсний.').max(4096),
  platform: z.enum(['android', 'ios'])
});

const claimIpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'TOO_MANY_PAIRING_ATTEMPTS',
      message: 'Забагато спроб підключення. Спробуйте пізніше.'
    }
  }
});

const claimIdentifierLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const token = String(req.body?.pairingToken || '');
    return `${hashPairingQrToken(token)}.${hashPairingManualCode(token)}`;
  },
  message: {
    error: {
      code: 'TOO_MANY_PAIRING_ATTEMPTS',
      message: 'Забагато спроб із цим кодом. Створіть новий код підключення.'
    }
  }
});

router.post(
  '/pairings/claim',
  claimIpLimiter,
  claimIdentifierLimiter,
  asyncHandler(async (req, res) => {
    const input = parseInput(pairingClaimSchema, req.body);
    res.status(201).json({ data: await claimMobilePairing(input) });
  })
);

router.put('/devices/:deviceId/push-token', requireMobileDeviceAuth, asyncHandler(async (req, res) => {
  const deviceId = parseInput(idSchema, req.params.deviceId);
  const input = parseInput(pushTokenSchema, req.body);
  if (req.mobileDevice.id !== deviceId) {
    throw new AppError(404, 'MOBILE_DEVICE_NOT_FOUND', 'Мобільний пристрій не знайдено.');
  }
  await setMobileDevicePushToken(req.user.id, deviceId, input.token, input.platform);
  res.status(204).end();
}));

router.delete(
  '/devices/:deviceId',
  mobileDeviceAuth({ allowRevoked: true }),
  asyncHandler(async (req, res) => {
    const deviceId = parseInput(idSchema, req.params.deviceId);
    if (req.mobileDevice.id !== deviceId) {
      throw new AppError(404, 'MOBILE_DEVICE_NOT_FOUND', 'Мобільний пристрій не знайдено.');
    }
    await revokeMobileDevice(req.user.id, deviceId, {
      allowLast: true,
      reason: 'mobile_self_disconnect'
    });
    res.status(204).end();
  })
);

export default router;
