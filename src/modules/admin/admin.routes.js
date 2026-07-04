import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { serializeUser } from '../../lib/serializers.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { assignableRoles, savedDataResources, toolIds } from '../access/access.service.js';

const router = Router();
router.use(requireAuth);

const adminOnly = requireRole('admin');
function accessManagerOnly(req, res, next) {
  if (req.user?.role === 'admin' || req.user?.canManageToolAccess) return next();
  return next(new AppError(403, 'FORBIDDEN', 'Недостатньо прав для керування доступами.'));
}

const idSchema = z.string().uuid();
const statusSchema = z.object({ status: z.enum(['pending', 'approved', 'rejected']) });
const roleSchema = z.object({ role: z.enum(['admin', 'editor', 'content_manager']) });
const toolAccessSchema = z.object({
  tools: z.array(z.enum(toolIds)).max(toolIds.length),
  canManageToolAccess: z.boolean().optional()
});
const permissionSchema = z.object({
  role: z.enum(['editor', 'content_manager']),
  resource: z.enum(['banner_grids', 'saved_banners', 'product_tables']),
  canViewAll: z.boolean()
});
const directoryQuerySchema = z.object({
  search: z.string().trim().max(160).default(''),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  role: z.enum(['admin', 'editor', 'content_manager']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25)
});

router.get('/directory', accessManagerOnly, asyncHandler(async (req, res) => {
  const input = parseInput(directoryQuerySchema, {
    search: String(req.query.search || ''),
    status: req.query.status || undefined,
    role: req.query.role || undefined,
    page: req.query.page || 1,
    pageSize: req.query.pageSize || 25
  });
  const params = [];
  const where = [];

  if (input.search) {
    params.push(`%${input.search}%`);
    where.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }
  if (input.status) {
    params.push(input.status);
    where.push(`status = $${params.length}`);
  }
  if (input.role) {
    params.push(input.role);
    where.push(`role = $${params.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countResult = await query(`SELECT COUNT(*)::INTEGER AS count FROM users ${whereSql}`, params);
  const total = countResult.rows[0]?.count || 0;
  const offset = (input.page - 1) * input.pageSize;
  const listParams = [...params, input.pageSize, offset];
  const usersResult = await query(
    `SELECT id, name, email, role, status, can_manage_tool_access, approved_at, created_at, updated_at
     FROM users
     ${whereSql}
     ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
              lower(name), created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    listParams
  );
  const summaryResult = await query(
    `SELECT status, COUNT(*)::INTEGER AS count
     FROM users
     GROUP BY status`
  );
  const summary = { total: 0, pending: 0, approved: 0, rejected: 0 };
  for (const row of summaryResult.rows) {
    summary[row.status] = row.count;
    summary.total += row.count;
  }

  res.json({
    data: {
      items: usersResult.rows.map(serializeUser),
      total,
      page: input.page,
      pageSize: input.pageSize,
      pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
      summary
    }
  });
}));

router.get('/users', accessManagerOnly, asyncHandler(async (req, res) => {
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
  if (assignableRoles.includes(role)) {
    params.push(role);
    where.push(`role = $${params.length}`);
  }

  const result = await query(
    `SELECT id, name, email, role, status, can_manage_tool_access, approved_at, created_at, updated_at
     FROM users
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC
     LIMIT 250`,
    params
  );

  res.json({ data: result.rows.map(serializeUser) });
}));

router.get('/permissions', adminOnly, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT role, resource, can_view_all, updated_at
     FROM role_permissions
     ORDER BY role, resource`
  );
  res.json({
    data: result.rows.map((row) => ({
      role: row.role,
      resource: row.resource,
      canViewAll: row.can_view_all,
      updatedAt: row.updated_at
    }))
  });
}));

router.patch('/permissions', adminOnly, asyncHandler(async (req, res) => {
  const input = parseInput(permissionSchema, req.body);
  if (!savedDataResources.includes(input.resource)) {
    throw new AppError(422, 'INVALID_RESOURCE', 'Невідомий тип збережених даних.');
  }
  const result = await query(
    `INSERT INTO role_permissions (role, resource, can_view_all, updated_at, updated_by)
     VALUES ($1, $2, $3, NOW(), $4)
     ON CONFLICT (role, resource)
     DO UPDATE SET can_view_all = EXCLUDED.can_view_all,
                   updated_at = NOW(), updated_by = EXCLUDED.updated_by
     RETURNING role, resource, can_view_all, updated_at`,
    [input.role, input.resource, input.canViewAll, req.user.id]
  );
  const row = result.rows[0];
  res.json({
    data: {
      role: row.role,
      resource: row.resource,
      canViewAll: row.can_view_all,
      updatedAt: row.updated_at
    }
  });
}));

router.get('/users/:id/tool-access', accessManagerOnly, asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const userResult = await query('SELECT role, can_manage_tool_access FROM users WHERE id = $1', [id]);
  if (!userResult.rows[0]) throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено.');
  if (userResult.rows[0].role === 'admin') {
    return res.json({ data: { tools: [...toolIds], canManageToolAccess: true } });
  }

  const result = await query(
    'SELECT tool_id FROM user_tool_access WHERE user_id = $1 ORDER BY tool_id',
    [id]
  );
  res.json({
    data: {
      tools: result.rows.map((row) => row.tool_id),
      canManageToolAccess: userResult.rows[0].can_manage_tool_access === true
    }
  });
}));

router.put('/users/:id/tool-access', accessManagerOnly, asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(toolAccessSchema, req.body);
  const selectedTools = [...new Set(input.tools)];
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const userResult = await client.query('SELECT role, can_manage_tool_access FROM users WHERE id = $1 FOR UPDATE', [id]);
    if (!userResult.rows[0]) throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено.');
    if (userResult.rows[0].role === 'admin') {
      throw new AppError(400, 'ADMIN_TOOL_ACCESS', 'Адміністратор завжди має доступ до всіх інструментів.');
    }

    await client.query('DELETE FROM user_tool_access WHERE user_id = $1', [id]);
    for (const toolId of selectedTools) {
      await client.query(
        `INSERT INTO user_tool_access (user_id, tool_id, granted_by)
         VALUES ($1, $2, $3)`,
        [id, toolId, req.user.id]
      );
    }
    const canManageToolAccess = req.user.role === 'admin'
      ? Boolean(input.canManageToolAccess)
      : userResult.rows[0].can_manage_tool_access === true;
    await client.query(
      'UPDATE users SET can_manage_tool_access = $1, updated_at = NOW() WHERE id = $2',
      [canManageToolAccess, id]
    );
    await client.query('COMMIT');
    res.json({ data: { tools: selectedTools, canManageToolAccess } });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.patch('/users/:id/status', adminOnly, asyncHandler(async (req, res) => {
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
     RETURNING id, name, email, role, status, can_manage_tool_access, approved_at, created_at, updated_at`,
    [status, req.user.id, id]
  );
  if (!result.rows[0]) throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено.');
  res.json({ data: serializeUser(result.rows[0]) });
}));

router.patch('/users/:id/role', adminOnly, asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const { role } = parseInput(roleSchema, req.body);
  if (id === req.user.id && role !== 'admin') {
    throw new AppError(400, 'SELF_ROLE_CHANGE', 'Не можна забрати роль admin у власного облікового запису.');
  }

  const result = await query(
    `UPDATE users SET role = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, name, email, role, status, can_manage_tool_access, approved_at, created_at, updated_at`,
    [role, id]
  );
  if (!result.rows[0]) throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено.');
  res.json({ data: serializeUser(result.rows[0]) });
}));

export default router;
