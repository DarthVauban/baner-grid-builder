import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { serializeUser } from '../../lib/serializers.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

const idSchema = z.string().uuid();
const statusSchema = z.object({ status: z.enum(['pending', 'approved', 'rejected']) });
const roleSchema = z.object({ role: z.enum(['admin', 'user']) });

router.get('/users', asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();
  const role = String(req.query.role || '').trim();
  const params = [];
  const where = [];

  if (search) {
    params.push(`%${search}%`);
    where.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }
  if (['pending', 'approved', 'rejected'].includes(status)) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (['admin', 'user'].includes(role)) {
    params.push(role);
    where.push(`role = $${params.length}`);
  }

  const result = await query(
    `SELECT id, name, email, role, status, approved_at, created_at, updated_at
     FROM users
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC
     LIMIT 250`,
    params
  );

  res.json({ data: result.rows.map(serializeUser) });
}));

router.patch('/users/:id/status', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const { status } = parseInput(statusSchema, req.body);
  if (id === req.user.id && status !== 'approved') {
    throw new AppError(400, 'SELF_STATUS_CHANGE', 'Не можна заблокувати власний обліковий запис.');
  }

  const result = await query(
    `UPDATE users
     SET status = $1::VARCHAR,
         approved_at = CASE WHEN $1::VARCHAR = 'approved' THEN NOW() ELSE NULL END,
         approved_by = CASE WHEN $1::VARCHAR = 'approved' THEN $2::UUID ELSE NULL END,
         updated_at = NOW()
     WHERE id = $3::UUID
     RETURNING id, name, email, role, status, approved_at, created_at, updated_at`,
    [status, req.user.id, id]
  );
  if (!result.rows[0]) throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено.');
  res.json({ data: serializeUser(result.rows[0]) });
}));

router.patch('/users/:id/role', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const { role } = parseInput(roleSchema, req.body);
  if (id === req.user.id && role !== 'admin') {
    throw new AppError(400, 'SELF_ROLE_CHANGE', 'Не можна забрати роль admin у власного облікового запису.');
  }

  const result = await query(
    `UPDATE users SET role = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, name, email, role, status, approved_at, created_at, updated_at`,
    [role, id]
  );
  if (!result.rows[0]) throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено.');
  res.json({ data: serializeUser(result.rows[0]) });
}));

export default router;
