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
import { registerMobileDeviceAuthKey } from './mobile-auth-key.service.js';
import { hashPairingManualCode, hashPairingQrToken } from './mobile-crypto.js';
import { claimMobilePairing } from './mobile-pairing.service.js';
import {
  listUserNotifications,
  markAllUserNotificationsRead,
  markUserNotificationRead
} from '../notifications/notification.service.js';
import {
  decideMobileLoginRequest,
  listMobileLoginRequests
} from './mobile-login.service.js';
import mobileQrLoginRoutes from './mobile-qr-login.routes.js';

const router = Router();
const idSchema = z.string().uuid();
const publicKeyJwkSchema = z.object({
  kty: z.literal('EC'),
  crv: z.literal('P-256'),
  x: z.string().trim().min(40).max(64),
  y: z.string().trim().min(40).max(64)
}).passthrough();
const authKeySchema = z.object({
  keyId: z.string().trim().min(8).max(160),
  algorithm: z.literal('ES256'),
  publicKeyJwk: publicKeyJwkSchema,
  version: z.literal(1).optional().default(1)
});
const pairingClaimSchema = z.object({
  pairingToken: z.string().trim().min(1, 'Вкажіть код підключення.').max(4096),
  platform: z.enum(['android', 'ios']),
  deviceName: z.string().trim().min(2, 'Вкажіть назву пристрою.').max(160),
  installationId: z.string().uuid('Ідентифікатор інсталяції недійсний.').optional(),
  authKey: authKeySchema.optional()
});
const pushTokenSchema = z.object({
  token: z.string().trim().min(20, 'Push token недійсний.').max(4096),
  platform: z.enum(['android', 'ios']),
  installationId: z.string().uuid('Ідентифікатор інсталяції недійсний.').optional()
});
const authKeyRegistrationSchema = authKeySchema.extend({
  totpCode: z.string().trim().min(6, 'Вкажіть код 2FA.').max(20, 'Код 2FA завеликий.')
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
const authKeyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.mobileDevice?.id || 'unknown'),
  message: {
    error: {
      code: 'TOO_MANY_AUTH_KEY_ATTEMPTS',
      message: 'Забагато спроб реєстрації ключа пристрою. Спробуйте пізніше.'
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
  await setMobileDevicePushToken(
    req.user.id,
    deviceId,
    input.token,
    input.platform,
    input.installationId || null
  );
  res.status(204).end();
}));

router.put('/devices/:deviceId/auth-key', requireMobileDeviceAuth, authKeyLimiter, asyncHandler(async (req, res) => {
  const deviceId = parseInput(idSchema, req.params.deviceId);
  const input = parseInput(authKeyRegistrationSchema, req.body);
  if (req.mobileDevice.id !== deviceId) {
    throw new AppError(404, 'MOBILE_DEVICE_NOT_FOUND', 'Мобільний пристрій не знайдено.');
  }
  const authKey = await registerMobileDeviceAuthKey(
    req.user.id,
    deviceId,
    input,
    input.totpCode
  );
  res.status(201).json({ data: authKey });
}));

router.use('/qr-login', requireMobileDeviceAuth, mobileQrLoginRoutes);

router.get('/login-requests', requireMobileDeviceAuth, asyncHandler(async (req, res) => {
  res.json({ data: { items: await listMobileLoginRequests(req.user.id) } });
}));

router.get('/notifications', requireMobileDeviceAuth, asyncHandler(async (req, res) => {
  res.json({ data: await listUserNotifications(req.user.id) });
}));

router.patch('/notifications/:notificationId/read', requireMobileDeviceAuth, asyncHandler(async (req, res) => {
  const notificationId = parseInput(idSchema, req.params.notificationId);
  res.json({ data: await markUserNotificationRead(req.user.id, notificationId) });
}));

router.post('/notifications/read-all', requireMobileDeviceAuth, asyncHandler(async (req, res) => {
  await markAllUserNotificationsRead(req.user.id);
  res.status(204).end();
}));

router.post('/login-requests/:requestId/approve', requireMobileDeviceAuth, asyncHandler(async (req, res) => {
  const requestId = parseInput(idSchema, req.params.requestId);
  const loginRequest = await decideMobileLoginRequest(
    req.user.id,
    req.mobileDevice.id,
    requestId,
    'approve'
  );
  res.json({ data: loginRequest });
}));

router.post('/login-requests/:requestId/deny', requireMobileDeviceAuth, asyncHandler(async (req, res) => {
  const requestId = parseInput(idSchema, req.params.requestId);
  const loginRequest = await decideMobileLoginRequest(
    req.user.id,
    req.mobileDevice.id,
    requestId,
    'deny'
  );
  res.json({ data: loginRequest });
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
