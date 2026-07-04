import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { serializeUser } from '../../lib/serializers.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { getUserToolAccess } from '../access/access.service.js';
import { parseAvatarDataUrl } from './avatar.service.js';

const router = Router();
router.use(requireAuth);

const searchSchema = z.string().trim().max(120);
const idSchema = z.string().uuid();
const avatarSchema = z.string().trim().max(1_500_000, 'Фото завелике.').refine(
  (value) => !value || /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value),
  'Підтримуються лише PNG, JPEG або WebP.'
);
const profileSchema = z.object({
  firstName: z.string().trim().min(2, 'Вкажіть ім’я.').max(60),
  lastName: z.string().trim().min(2, 'Вкажіть прізвище.').max(60),
  email: z.string().trim().email('Вкажіть коректний email.').max(255),
  department: z.string().trim().max(120).default(''),
  position: z.string().trim().max(120).default(''),
  avatarDataUrl: avatarSchema.nullable().default(null),
  currentPassword: z.string().max(128).optional().default(''),
  newPassword: z.string().max(128).optional().default('')
}).superRefine((input, context) => {
  if (`${input.firstName} ${input.lastName}`.length > 120) context.addIssue({ code: 'custom', path: ['lastName'], message: 'Ім’я та прізвище завеликі.' });
  if (input.newPassword && input.newPassword.length < 10) context.addIssue({ code: 'custom', path: ['newPassword'], message: 'Новий пароль має містити щонайменше 10 символів.' });
  if (input.newPassword && !input.currentPassword) context.addIssue({ code: 'custom', path: ['currentPassword'], message: 'Вкажіть поточний пароль.' });
});

router.get('/tool-access', asyncHandler(async (req, res) => {
  res.json({ data: await getUserToolAccess(req.user) });
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

router.put('/profile', asyncHandler(async (req, res) => {
  const input = parseInput(profileSchema, req.body);
  const email = input.email.toLowerCase();
  const duplicate = await query('SELECT 1 FROM users WHERE email = $1 AND id <> $2', [email, req.user.id]);
  if (duplicate.rowCount) throw new AppError(409, 'EMAIL_EXISTS', 'Користувач із таким email уже існує.');

  let passwordHash = null;
  if (input.newPassword) {
    const passwordResult = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const matches = await bcrypt.compare(input.currentPassword, passwordResult.rows[0]?.password_hash || '');
    if (!matches) throw new AppError(422, 'INVALID_CURRENT_PASSWORD', 'Поточний пароль вказано неправильно.');
    passwordHash = await bcrypt.hash(input.newPassword, 12);
  }

  const avatarChanged = input.avatarDataUrl !== null;
  const avatar = avatarChanged ? parseAvatarDataUrl(input.avatarDataUrl) : { data: null, mime: null };

  const name = `${input.firstName} ${input.lastName}`.trim();
  const result = await query(
    `UPDATE users
     SET name = $1, first_name = $2, last_name = $3, email = $4,
         department = $5, position = $6,
         avatar_data = CASE WHEN $7::BOOLEAN THEN $8 ELSE avatar_data END,
         avatar_mime = CASE WHEN $7::BOOLEAN THEN $9 ELSE avatar_mime END,
         password_hash = COALESCE($10, password_hash), updated_at = NOW()
     WHERE id = $11
     RETURNING id, name, first_name, last_name, email, department, position, avatar_mime,
               role, status, can_manage_tool_access, approved_at, created_at, updated_at`,
    [name, input.firstName, input.lastName, email, input.department, input.position,
      avatarChanged, avatar.data, avatar.mime, passwordHash, req.user.id]
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
