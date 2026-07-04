import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { createAccessToken } from '../../lib/jwt.js';
import { serializeUser } from '../../lib/serializers.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { grantDefaultToolAccess } from '../access/access.service.js';
import { parseAvatarDataUrl } from '../users/avatar.service.js';

const router = Router();

const avatarSchema = z.string().trim().max(1_500_000, 'Фото завелике.').refine(
  (value) => !value || /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value),
  'Підтримуються лише PNG, JPEG або WebP.'
);

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  firstName: z.string().trim().min(2, 'Вкажіть ім’я.').max(60).optional(),
  lastName: z.string().trim().min(2, 'Вкажіть прізвище.').max(60).optional(),
  email: z.string().trim().email('Вкажіть коректний email.').max(255),
  password: z.string().min(10, 'Пароль має містити щонайменше 10 символів.').max(128),
  avatarDataUrl: avatarSchema.optional().default('')
}).superRefine((input, context) => {
  if (!input.name && !input.firstName) context.addIssue({ code: 'custom', path: ['firstName'], message: 'Вкажіть ім’я.' });
  if (!input.name && !input.lastName) context.addIssue({ code: 'custom', path: ['lastName'], message: 'Вкажіть прізвище.' });
  const fullName = input.name || `${input.firstName || ''} ${input.lastName || ''}`.trim();
  if (fullName.length > 120) context.addIssue({ code: 'custom', path: ['lastName'], message: 'Ім’я та прізвище завеликі.' });
});

const loginSchema = z.object({
  email: z.string().trim().email('Вкажіть коректний email.'),
  password: z.string().min(1, 'Вкажіть пароль.')
});

function setSessionCookie(res, token) {
  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/'
  });
}

router.post('/register', asyncHandler(async (req, res) => {
  const input = parseInput(registerSchema, req.body);
  const email = input.email.toLowerCase();
  const exists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (exists.rowCount) throw new AppError(409, 'EMAIL_EXISTS', 'Користувач із таким email уже існує.');

  const passwordHash = await bcrypt.hash(input.password, 12);
  const avatar = parseAvatarDataUrl(input.avatarDataUrl);
  const legacyName = input.name?.trim() || '';
  const firstName = input.firstName?.trim() || legacyName;
  const lastName = input.lastName?.trim() || '';
  const fullName = `${firstName} ${lastName}`.trim();
  const result = await query(
    `INSERT INTO users (name, first_name, last_name, email, password_hash, avatar_data, avatar_mime)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, first_name, last_name, email, department, position, avatar_mime,
               role, status, can_manage_tool_access, approved_at, created_at, updated_at`,
    [fullName, firstName, lastName, email, passwordHash, avatar.data, avatar.mime]
  );
  await grantDefaultToolAccess(result.rows[0].id);

  res.status(201).json({
    data: serializeUser(result.rows[0]),
    message: 'Реєстрацію завершено. Дочекайтеся схвалення адміністратора.'
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

  setSessionCookie(res, createAccessToken(user));
  res.json({ data: serializeUser(user) });
}));

router.post('/logout', (req, res) => {
  res.clearCookie(env.COOKIE_NAME, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    path: '/'
  });
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ data: req.user });
});

export default router;
