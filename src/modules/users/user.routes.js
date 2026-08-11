import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { serializeUser } from '../../lib/serializers.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { getUserToolAccess, getUserToolCatalog } from '../access/access.service.js';
import {
  confirmTwoFactorSetup,
  disableTwoFactor,
  getTwoFactorStatus,
  startTwoFactorSetup,
  verifyUserTwoFactor
} from '../auth/two-factor.service.js';
import {
  finishPasskeyRegistration,
  listUserPasskeys,
  removeUserPasskey,
  startPasskeyRegistration
} from '../auth/passkey.service.js';
import { parseAvatarDataUrl } from './avatar.service.js';
import {
  countActiveMobileDevices,
  listMobileDevices,
  revokeMobileDevice
} from '../mobile/mobile-device.service.js';
import {
  acknowledgeMobilePairing,
  cancelMobilePairing,
  createMobilePairing,
  getMobilePairing
} from '../mobile/mobile-pairing.service.js';

const router = Router();
router.use(requireAuth);

const searchSchema = z.string().trim().max(120);
const idSchema = z.string().uuid();
const avatarSchema = z.string().trim().max(1_500_000, 'Фото завелике.').refine(
  (value) => !value || /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value),
  'Підтримуються лише PNG, JPEG або WebP.'
);
const profileSchema = z.object({
  firstName: z.string().trim().min(2, 'Вкажіть імʼя.').max(60),
  lastName: z.string().trim().min(2, 'Вкажіть прізвище.').max(60),
  email: z.string().trim().email('Вкажіть коректний email.').max(255),
  department: z.string().trim().max(120).default(''),
  position: z.string().trim().max(120).default(''),
  avatarDataUrl: avatarSchema.nullable().default(null)
}).superRefine((input, context) => {
  if (`${input.firstName} ${input.lastName}`.length > 120) {
    context.addIssue({ code: 'custom', path: ['lastName'], message: 'Імʼя та прізвище завеликі.' });
  }
});
const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Вкажіть поточний пароль.').max(128),
  newPassword: z.string().min(10, 'Новий пароль має містити щонайменше 10 символів.').max(128)
});
const twoFactorCodeSchema = z.object({
  code: z.string().trim().min(6, 'Вкажіть код 2FA.').max(20, 'Код 2FA завеликий.')
});
const mobilePairingSchema = z.object({
  purpose: z.enum(['enable_2fa', 'add_device']),
  code: z.string().trim().min(6).max(20).nullable().optional().default(null)
}).superRefine((input, context) => {
  if (input.purpose === 'add_device' && !input.code) {
    context.addIssue({
      code: 'custom',
      path: ['code'],
      message: 'Підтвердьте додавання пристрою кодом 2FA.'
    });
  }
});
const passkeyOptionsSchema = z.object({
  code: z.string().trim().min(6, 'Вкажіть код 2FA.').max(20, 'Код 2FA завеликий.'),
  name: z.string().trim().min(2, 'Вкажіть назву Passkey.').max(120)
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
  name: z.string().trim().min(2, 'Вкажіть назву Passkey.').max(120),
  response: credentialResponseSchema
});

const userSelect = `id, name, first_name, last_name, email, department, position, avatar_mime,
  role, status, can_manage_tool_access, two_factor_enabled, two_factor_method, two_factor_confirmed_at,
  approved_at, created_at, updated_at`;

router.get('/tool-access', asyncHandler(async (req, res) => {
  res.json({ data: await getUserToolAccess(req.user) });
}));

router.get('/tool-catalog', asyncHandler(async (req, res) => {
  res.json({ data: await getUserToolCatalog(req.user) });
}));

router.get('/profile/2fa', asyncHandler(async (req, res) => {
  const [status, activeMobileDeviceCount] = await Promise.all([
    getTwoFactorStatus(req.user.id),
    countActiveMobileDevices(req.user.id)
  ]);
  res.json({ data: { ...status, activeMobileDeviceCount } });
}));

router.post('/profile/2fa/setup', asyncHandler(async (req, res) => {
  res.json({ data: await startTwoFactorSetup(req.user) });
}));

router.post('/profile/2fa/confirm', asyncHandler(async (req, res) => {
  const input = parseInput(twoFactorCodeSchema, req.body);
  const result = await confirmTwoFactorSetup(req.user.id, input.code);
  res.json({
    data: {
      user: serializeUser(result.user),
      recoveryCodes: result.recoveryCodes
    }
  });
}));

router.post('/profile/2fa/disable', asyncHandler(async (req, res) => {
  const input = parseInput(twoFactorCodeSchema, req.body);
  const user = await disableTwoFactor(req.user.id, input.code);
  res.json({ data: serializeUser(user) });
}));

router.post('/profile/mobile-pairings', asyncHandler(async (req, res) => {
  const input = parseInput(mobilePairingSchema, req.body);
  const pairing = await createMobilePairing(req.user.id, {
    purpose: input.purpose,
    code: input.code || ''
  });
  res.status(201).json({ data: pairing });
}));

router.get('/profile/mobile-pairings/:pairingId', asyncHandler(async (req, res) => {
  const pairingId = parseInput(idSchema, req.params.pairingId);
  res.json({ data: await getMobilePairing(req.user.id, pairingId) });
}));

router.post('/profile/mobile-pairings/:pairingId/acknowledge', asyncHandler(async (req, res) => {
  const pairingId = parseInput(idSchema, req.params.pairingId);
  await acknowledgeMobilePairing(req.user.id, pairingId);
  res.status(204).end();
}));

router.delete('/profile/mobile-pairings/:pairingId', asyncHandler(async (req, res) => {
  const pairingId = parseInput(idSchema, req.params.pairingId);
  await cancelMobilePairing(req.user.id, pairingId);
  res.status(204).end();
}));

router.get('/profile/mobile-devices', asyncHandler(async (req, res) => {
  res.json({ data: { items: await listMobileDevices(req.user.id) } });
}));

router.delete('/profile/mobile-devices/:deviceId', asyncHandler(async (req, res) => {
  const deviceId = parseInput(idSchema, req.params.deviceId);
  const input = parseInput(twoFactorCodeSchema, req.body);
  await verifyUserTwoFactor(req.user.id, input.code);
  await revokeMobileDevice(req.user.id, deviceId, { reason: 'web_profile' });
  res.status(204).end();
}));

router.get('/profile/passkeys', asyncHandler(async (req, res) => {
  res.json({ data: await listUserPasskeys(req.user.id) });
}));

router.post('/profile/passkeys/options', asyncHandler(async (req, res) => {
  const input = parseInput(passkeyOptionsSchema, req.body);
  res.json({ data: await startPasskeyRegistration(req.user, req, input.code, input.name) });
}));

router.post('/profile/passkeys/verify', asyncHandler(async (req, res) => {
  const input = parseInput(passkeyVerifySchema, req.body);
  const passkey = await finishPasskeyRegistration(req.user.id, input.challengeId, input.name, input.response);
  res.status(201).json({ data: passkey });
}));

router.delete('/profile/passkeys/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(twoFactorCodeSchema, req.body);
  await removeUserPasskey(req.user.id, id, input.code);
  res.status(204).end();
}));

router.get('/:id/avatar', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const result = await query('SELECT avatar_data, avatar_mime, updated_at FROM users WHERE id = $1', [id]);
  const avatar = result.rows[0];
  if (!avatar?.avatar_data || !avatar.avatar_mime) throw new AppError(404, 'AVATAR_NOT_FOUND', 'Фото профілю не знайдено.');
  res.setHeader('Content-Type', avatar.avatar_mime);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(avatar.avatar_data);
}));

router.put('/profile/password', asyncHandler(async (req, res) => {
  const input = parseInput(passwordSchema, req.body);
  const passwordResult = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  const matches = await bcrypt.compare(input.currentPassword, passwordResult.rows[0]?.password_hash || '');
  if (!matches) throw new AppError(422, 'INVALID_CURRENT_PASSWORD', 'Поточний пароль вказано неправильно.');
  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, req.user.id]);
  res.status(204).end();
}));

router.put('/profile', asyncHandler(async (req, res) => {
  const input = parseInput(profileSchema, req.body);
  const email = input.email.toLowerCase();
  const duplicate = await query('SELECT 1 FROM users WHERE email = $1 AND id <> $2', [email, req.user.id]);
  if (duplicate.rowCount) throw new AppError(409, 'EMAIL_EXISTS', 'Користувач із таким email уже існує.');

  const avatarChanged = input.avatarDataUrl !== null;
  const avatar = avatarChanged ? parseAvatarDataUrl(input.avatarDataUrl) : { data: null, mime: null };

  const name = `${input.firstName} ${input.lastName}`.trim();
  const result = await query(
    `UPDATE users
     SET name = $1, first_name = $2, last_name = $3, email = $4,
         department = $5, position = $6,
         avatar_data = CASE WHEN $7::BOOLEAN THEN $8 ELSE avatar_data END,
         avatar_mime = CASE WHEN $7::BOOLEAN THEN $9 ELSE avatar_mime END,
         updated_at = NOW()
     WHERE id = $10
     RETURNING ${userSelect}`,
    [name, input.firstName, input.lastName, email, input.department, input.position,
      avatarChanged, avatar.data, avatar.mime, req.user.id]
  );
  res.json({ data: serializeUser(result.rows[0]) });
}));

router.get('/search', asyncHandler(async (req, res) => {
  const search = parseInput(searchSchema, String(req.query.search || ''));
  const excludeSelf = String(req.query.excludeSelf || '') === 'true';
  const result = await query(
    `SELECT id, name, email
     FROM users
     WHERE status = 'approved'
       AND ($2::BOOLEAN = FALSE OR id <> $1)
       AND ($3 = '' OR name ILIKE '%' || $3 || '%' OR email ILIKE '%' || $3 || '%')
     ORDER BY lower(name), lower(email)
     LIMIT 50`,
    [req.user.id, excludeSelf, search]
  );

  res.json({
    data: result.rows.map((user) => ({ id: user.id, name: user.name, email: user.email }))
  });
}));

export default router;
