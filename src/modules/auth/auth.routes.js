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

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Вкажіть ім’я.').max(120),
  email: z.string().trim().email('Вкажіть коректний email.').max(255),
  password: z.string().min(10, 'Пароль має містити щонайменше 10 символів.').max(128)
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
  const result = await query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, name, email, role, status, approved_at, created_at, updated_at`,
    [input.name, email, passwordHash]
  );

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
