import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { createAccessToken, createTwoFactorLoginToken, verifyTwoFactorLoginToken } from '../../lib/jwt.js';
import { serializeUser } from '../../lib/serializers.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requestRegistrationVerification, verifyRegistrationCode } from './registration-verification.service.js';
import { verifyUserTwoFactor } from './two-factor.service.js';
import { countUserPasskeys, finishPasskeyLogin, startPasskeyLogin } from './passkey.service.js';
import qrLoginRoutes from './qr-login.routes.js';
import { clearSessionCookie, setSessionCookie } from './session-cookie.js';
import {
  cancelMobileLoginRequest,
  completeMobileLoginWithFallback,
  consumeMobileLoginRequest,
  createMobileLoginRequest
} from '../mobile/mobile-login.service.js';

const router = Router();

const avatarSchema = z.string().trim().max(1_500_000, 'Фото завелике.').refine(
  (value) => !value || /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value),
  'Підтримуються лише PNG, JPEG або WebP.'
);

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  firstName: z.string().trim().min(2, 'Вкажіть імʼя.').max(60).optional(),
  lastName: z.string().trim().min(2, 'Вкажіть прізвище.').max(60).optional(),
  email: z.string().trim().email('Вкажіть коректний email.').max(255),
  password: z.string().min(10, 'Пароль має містити щонайменше 10 символів.').max(128),
  avatarDataUrl: avatarSchema.optional().default('')
}).superRefine((input, context) => {
  if (!input.name && !input.firstName) context.addIssue({ code: 'custom', path: ['firstName'], message: 'Вкажіть імʼя.' });
  if (!input.name && !input.lastName) context.addIssue({ code: 'custom', path: ['lastName'], message: 'Вкажіть прізвище.' });
  const fullName = input.name || `${input.firstName || ''} ${input.lastName || ''}`.trim();
  if (fullName.length > 120) context.addIssue({ code: 'custom', path: ['lastName'], message: 'Імʼя та прізвище завеликі.' });
});

const loginSchema = z.object({
  email: z.string().trim().email('Вкажіть коректний email.'),
  password: z.string().min(1, 'Вкажіть пароль.')
});
const verifyRegistrationSchema = z.object({
  email: z.string().trim().email('Вкажіть коректний email.'),
  code: z.string().trim().regex(/^\d{6}$/, 'Вкажіть 6-значний код.')
});
const verifyLoginTwoFactorSchema = z.object({
  challengeToken: z.string().trim().min(20, 'Сесія перевірки 2FA недійсна.'),
  code: z.string().trim().regex(
    /^(?:\d{6}|[23456789A-HJ-NP-Z]{4}-?[23456789A-HJ-NP-Z]{6})$/i,
    'Вкажіть 6-значний код 2FA або коректний recovery code.'
  )
});
const mobileLoginStatusSchema = z.object({
  challengeToken: z.string().trim().min(20, 'Сесія перевірки входу недійсна.'),
  requestId: z.string().uuid('Запит підтвердження входу недійсний.')
});
const mobileLoginCancelSchema = z.object({
  challengeToken: z.string().trim().min(20, 'Сесія перевірки входу недійсна.')
});
const passkeyOptionsSchema = z.object({
  challengeToken: z.string().trim().min(20, 'Сесія перевірки Passkey недійсна.')
});
const credentialResponseSchema = z.looseObject({
  id: z.string().trim().min(1).max(2048),
  rawId: z.string().trim().min(1).max(2048),
  type: z.literal('public-key'),
  response: z.record(z.string(), z.unknown()),
  clientExtensionResults: z.record(z.string(), z.unknown()).default({})
});
const passkeyVerifySchema = z.object({
  challengeId: z.string().uuid('Запит Passkey недійсний.'),
  response: credentialResponseSchema
});

router.use('/login/qr', qrLoginRoutes);

router.post('/register', asyncHandler(async (req, res) => {
  const input = parseInput(registerSchema, req.body);
  const data = await requestRegistrationVerification(input);

  res.status(202).json({
    data,
    message: 'Код підтвердження надіслано на email.'
  });
}));

router.post('/register/verify', asyncHandler(async (req, res) => {
  const input = parseInput(verifyRegistrationSchema, req.body);
  const user = await verifyRegistrationCode(input.email, input.code);

  setSessionCookie(res, createAccessToken(user));
  res.status(201).json({
    data: user,
    message: 'Email підтверджено. Обліковий запис активовано.'
  });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const input = parseInput(loginSchema, req.body);
  const result = await query('SELECT * FROM users WHERE email = $1', [input.email.toLowerCase()]);
  const user = result.rows[0];
  const passwordMatches = user ? await bcrypt.compare(input.password, user.password_hash) : false;

  if (!user || !passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Неправильний email або пароль.');
  }
  if (user.status === 'pending') {
    throw new AppError(403, 'ACCOUNT_PENDING', 'Обліковий запис очікує схвалення адміністратора.');
  }
  if (user.status === 'rejected') {
    throw new AppError(403, 'ACCOUNT_REJECTED', 'Обліковий запис відхилено адміністратором.');
  }
  if (user.two_factor_enabled === true) {
    const passkeyCount = await countUserPasskeys(user.id);
    if (user.two_factor_method === 'mt_workspace') {
      const mobileLogin = await createMobileLoginRequest(user, req);
      return res.status(202).json({
        data: {
          twoFactorRequired: true,
          twoFactorMethod: 'mt_workspace',
          passkeyAvailable: passkeyCount > 0,
          challengeToken: createTwoFactorLoginToken(user, {
            mobileLoginRequestId: mobileLogin.request.id,
            jwtId: mobileLogin.jwtId
          }),
          expiresAt: mobileLogin.request.expiresAt,
          email: user.email,
          mobileApproval: {
            requestId: mobileLogin.request.id,
            status: mobileLogin.request.status,
            pollingIntervalMs: 2000,
            activeDeviceCount: mobileLogin.activeDeviceCount
          }
        }
      });
    }
    return res.status(202).json({
      data: {
        twoFactorRequired: true,
        twoFactorMethod: 'totp',
        passkeyAvailable: passkeyCount > 0,
        challengeToken: createTwoFactorLoginToken(user),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        email: user.email
      }
    });
  }

  setSessionCookie(res, createAccessToken(user));
  res.json({ data: serializeUser(user) });
}));

router.post('/login/passkey/options', asyncHandler(async (req, res) => {
  const input = parseInput(passkeyOptionsSchema, req.body);
  let payload;
  try {
    payload = verifyTwoFactorLoginToken(input.challengeToken);
  } catch (_error) {
    throw new AppError(401, 'INVALID_TWO_FACTOR_CHALLENGE', 'Сесія перевірки Passkey недійсна або завершилась.');
  }

  const result = await query('SELECT * FROM users WHERE id = $1', [payload.sub]);
  const user = result.rows[0];
  if (!user) throw new AppError(401, 'INVALID_TWO_FACTOR_CHALLENGE', 'Користувача не знайдено.');
  if (user.status !== 'approved') throw new AppError(403, 'ACCOUNT_NOT_APPROVED', 'Обліковий запис ще не активний.');
  if (user.two_factor_enabled !== true) {
    throw new AppError(400, 'TWO_FACTOR_NOT_ENABLED', '2FA не увімкнено для цього облікового запису.');
  }

  res.json({ data: await startPasskeyLogin(user, req, payload.mobileLoginRequestId || null) });
}));

router.post('/login/passkey/verify', asyncHandler(async (req, res) => {
  const input = parseInput(passkeyVerifySchema, req.body);
  const user = await finishPasskeyLogin(input.challengeId, input.response);
  setSessionCookie(res, createAccessToken(user));
  res.json({ data: serializeUser(user) });
}));

router.post('/login/2fa', asyncHandler(async (req, res) => {
  const input = parseInput(verifyLoginTwoFactorSchema, req.body);
  let payload;
  try {
    payload = verifyTwoFactorLoginToken(input.challengeToken);
  } catch (_error) {
    throw new AppError(401, 'INVALID_TWO_FACTOR_CHALLENGE', 'Сесія перевірки 2FA недійсна або завершилась.');
  }

  const client = await pool.connect();
  let user;
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [payload.sub]);
    user = result.rows[0];
    if (!user) throw new AppError(401, 'INVALID_TWO_FACTOR_CHALLENGE', 'Користувача не знайдено.');
    if (user.status !== 'approved') {
      throw new AppError(403, 'ACCOUNT_NOT_APPROVED', 'Обліковий запис ще не активний.');
    }
    if (user.two_factor_enabled !== true) {
      throw new AppError(400, 'TWO_FACTOR_NOT_ENABLED', '2FA не увімкнено для цього облікового запису.');
    }

    const verification = await verifyUserTwoFactor(user.id, input.code, client);
    await completeMobileLoginWithFallback(client, payload, verification.method);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  setSessionCookie(res, createAccessToken(user));
  res.json({ data: serializeUser(user) });
}));

router.post('/login/mobile/status', asyncHandler(async (req, res) => {
  const input = parseInput(mobileLoginStatusSchema, req.body);
  let payload;
  try {
    payload = verifyTwoFactorLoginToken(input.challengeToken);
  } catch (_error) {
    throw new AppError(401, 'INVALID_TWO_FACTOR_CHALLENGE', 'Сесія підтвердження входу недійсна або завершилась.');
  }
  const result = await consumeMobileLoginRequest(payload, input.requestId);
  if (result.consumed && result.user) setSessionCookie(res, createAccessToken(result.user));
  res.json({
    data: {
      requestId: result.request.id,
      status: result.request.status,
      expiresAt: result.request.expiresAt,
      user: result.user ? serializeUser(result.user) : null
    }
  });
}));

router.post('/login/mobile/cancel', asyncHandler(async (req, res) => {
  const input = parseInput(mobileLoginCancelSchema, req.body);
  let payload;
  try {
    payload = verifyTwoFactorLoginToken(input.challengeToken);
  } catch (_error) {
    return res.status(204).end();
  }
  await cancelMobileLoginRequest(payload);
  res.status(204).end();
}));

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ data: req.user });
});

export default router;
