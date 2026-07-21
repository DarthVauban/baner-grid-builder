import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { serializeUser } from '../../lib/serializers.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import {
  assignableRoles,
  getToolSecurityRequirements,
  savedDataResources,
  setToolSecurityRequirements,
  toolIds
} from '../access/access.service.js';
import { isPrimaryAdmin } from '../auth/two-factor.service.js';
import { getAdminIntegrations, saveMailtrapIntegration } from '../integrations/integration.service.js';

const router = Router();
router.use(requireAuth);

const adminOnly = requireRole('admin');
function accessManagerOnly(req, res, next) {
  if (req.user?.role === 'admin' || req.user?.canManageToolAccess) return next();
  return next(new AppError(403, 'FORBIDDEN', 'Недостатньо прав для керування доступами.'));
}

const idSchema = z.string().uuid();
const statusSchema = z.object({ status: z.enum(['pending', 'approved', 'rejected']) });
const roleSchema = z.object({ role: z.enum(['admin', 'editor', 'content_manager', 'manager']) });
const toolAccessSchema = z.object({
  tools: z.array(z.enum(toolIds)).max(toolIds.length),
  canManageToolAccess: z.boolean().optional(),
  requiresTwoFactorTools: z.array(z.enum(toolIds)).max(toolIds.length).optional()
});
const applicationNotificationSchema = z.object({
  disabledFormIds: z.array(z.string().uuid()).max(500)
});
const permissionSchema = z.object({
  role: z.enum(['editor', 'content_manager']),
  resource: z.enum(['banner_grids', 'saved_banners', 'product_tables']),
  canViewAll: z.boolean()
});
const mailtrapIntegrationSchema = z.object({
  senderEmail: z.string().trim().email('Вкажіть коректний email відправника.').max(255),
  senderName: z.string().trim().min(2, 'Вкажіть назву відправника.').max(120),
  token: z.string().trim().max(4000, 'Токен завеликий.').optional().default('')
});
const directoryQuerySchema = z.object({
  search: z.string().trim().max(160).default(''),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  role: z.enum(['admin', 'editor', 'content_manager', 'manager']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25)
});

const userSelect = `id, name, first_name, last_name, email, department, position, avatar_mime,
  role, status, can_manage_tool_access, two_factor_enabled, two_factor_confirmed_at,
  approved_at, created_at, updated_at`;

function serializeToolAccessPayload({
  target,
  tools,
  canManageToolAccess,
  requirements,
  actor
}) {
  return {
    tools,
    canManageToolAccess,
    twoFactorEnabled: target.two_factor_enabled === true,
    requiresTwoFactorTools: requirements
      .filter((requirement) => requirement.requiresTwoFactor)
      .map((requirement) => requirement.toolId),
    toolRequirements: requirements,
    canManageToolRequirements: isPrimaryAdmin(actor)
  };
}

async function getApplicationNotificationSettings(db, userId) {
  const result = await db.query(
    `SELECT forms.id,
            forms.name,
            forms.status,
            COALESCE(preference.enabled, TRUE) AS enabled
     FROM application_forms AS forms
     LEFT JOIN user_application_form_notification_preferences AS preference
       ON preference.form_id = forms.id AND preference.user_id = $1
     WHERE forms.status <> 'archived'
     ORDER BY CASE forms.status
                WHEN 'published' THEN 0
                WHEN 'draft' THEN 1
                WHEN 'disabled' THEN 2
                ELSE 3
              END,
              lower(forms.name),
              forms.created_at DESC`,
    [userId]
  );

  return {
    userId,
    forms: result.rows.map((row) => ({
      formId: row.id,
      name: row.name,
      status: row.status,
      enabled: row.enabled === true
    }))
  };
}

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
  const usersResult = await query(
    `SELECT ${userSelect}
     FROM users
     ${whereSql}
     ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
              lower(name), created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, input.pageSize, offset]
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
    `SELECT ${userSelect}
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

router.get('/integrations', adminOnly, asyncHandler(async (req, res) => {
  res.json({ data: await getAdminIntegrations() });
}));

router.put('/integrations/mailtrap', adminOnly, asyncHandler(async (req, res) => {
  const input = parseInput(mailtrapIntegrationSchema, req.body);

  try {
    const data = await saveMailtrapIntegration(input, req.user.id);
    res.json({ data });
  } catch (error) {
    if (error instanceof Error && error.message === 'MAILTRAP_TOKEN_REQUIRED') {
      throw new AppError(422, 'MAILTRAP_TOKEN_REQUIRED', 'Вкажіть Mailtrap API token для першого підключення.');
    }
    throw error;
  }
}));

router.get('/users/:id/tool-access', accessManagerOnly, asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const userResult = await query(
    `SELECT role, can_manage_tool_access, two_factor_enabled
     FROM users
     WHERE id = $1`,
    [id]
  );
  const target = userResult.rows[0];
  if (!target) throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено.');

  const requirements = await getToolSecurityRequirements();
  if (target.role === 'admin') {
    return res.json({
      data: serializeToolAccessPayload({
        target,
        tools: [...toolIds],
        canManageToolAccess: true,
        requirements,
        actor: req.user
      })
    });
  }

  const result = await query(
    'SELECT tool_id FROM user_tool_access WHERE user_id = $1 ORDER BY tool_id',
    [id]
  );
  res.json({
    data: serializeToolAccessPayload({
      target,
      tools: result.rows.map((row) => row.tool_id),
      canManageToolAccess: target.can_manage_tool_access === true,
      requirements,
      actor: req.user
    })
  });
}));

router.put('/users/:id/tool-access', accessManagerOnly, asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(toolAccessSchema, req.body);
  const selectedTools = [...new Set(input.tools)];
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const userResult = await client.query(
      `SELECT role, can_manage_tool_access, two_factor_enabled
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );
    const target = userResult.rows[0];
    if (!target) throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено.');

    const changingRequirements = input.requiresTwoFactorTools !== undefined;
    if (changingRequirements && !isPrimaryAdmin(req.user)) {
      throw new AppError(403, 'PRIMARY_ADMIN_REQUIRED', 'Лише головний адміністратор може змінювати вимоги 2FA для інструментів.');
    }

    if (target.role === 'admin' && selectedTools.length !== toolIds.length) {
      throw new AppError(400, 'ADMIN_TOOL_ACCESS', 'Адміністратор завжди має доступ до всіх інструментів.');
    }

    let canManageToolAccess = true;
    if (target.role !== 'admin') {
      await client.query('DELETE FROM user_tool_access WHERE user_id = $1', [id]);
      for (const toolId of selectedTools) {
        await client.query(
          `INSERT INTO user_tool_access (user_id, tool_id, granted_by)
           VALUES ($1, $2, $3)`,
          [id, toolId, req.user.id]
        );
      }
      canManageToolAccess = req.user.role === 'admin'
        ? Boolean(input.canManageToolAccess)
        : target.can_manage_tool_access === true;
      await client.query(
        'UPDATE users SET can_manage_tool_access = $1, updated_at = NOW() WHERE id = $2',
        [canManageToolAccess, id]
      );
    }

    if (changingRequirements) {
      await setToolSecurityRequirements([...new Set(input.requiresTwoFactorTools)], req.user.id, client);
    }
    const requirements = await getToolSecurityRequirements(client);
    await client.query('COMMIT');

    res.json({
      data: serializeToolAccessPayload({
        target,
        tools: target.role === 'admin' ? [...toolIds] : selectedTools,
        canManageToolAccess,
        requirements,
        actor: req.user
      })
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.get('/users/:id/application-notifications', adminOnly, asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const userResult = await query('SELECT id FROM users WHERE id = $1', [id]);
  if (!userResult.rows[0]) throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено.');

  res.json({ data: await getApplicationNotificationSettings({ query }, id) });
}));

router.put('/users/:id/application-notifications', adminOnly, asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(applicationNotificationSchema, req.body);
  const disabledFormIds = [...new Set(input.disabledFormIds)];
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const userResult = await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [id]);
    if (!userResult.rows[0]) throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено.');

    if (disabledFormIds.length) {
      const placeholders = disabledFormIds.map((_, index) => `$${index + 1}`).join(', ');
      const formsResult = await client.query(
        `SELECT id
         FROM application_forms
         WHERE id IN (${placeholders}) AND status <> 'archived'`,
        disabledFormIds
      );
      if (formsResult.rows.length !== disabledFormIds.length) {
        throw new AppError(422, 'APPLICATION_FORM_NOT_FOUND', 'Одна або кілька форм більше недоступні. Оновіть сторінку.');
      }
    }

    await client.query(
      'DELETE FROM user_application_form_notification_preferences WHERE user_id = $1',
      [id]
    );
    for (const formId of disabledFormIds) {
      await client.query(
        `INSERT INTO user_application_form_notification_preferences (
           user_id, form_id, enabled, updated_by
         ) VALUES ($1, $2, FALSE, $3)`,
        [id, formId, req.user.id]
      );
    }

    const data = await getApplicationNotificationSettings(client, id);
    await client.query('COMMIT');
    res.json({ data });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
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
     RETURNING ${userSelect}`,
    [status, req.user.id, id]
  );
  if (!result.rows[0]) throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено.');
  res.json({ data: serializeUser(result.rows[0]) });
}));

router.delete('/users/:id', adminOnly, asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  if (id === req.user.id) {
    throw new AppError(400, 'SELF_DELETE', 'Не можна видалити власний обліковий запис.');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const userResult = await client.query(
      'SELECT id, role FROM users WHERE id = $1 FOR UPDATE',
      [id]
    );
    const target = userResult.rows[0];
    if (!target) throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено.');

    if (target.role === 'admin') {
      const adminCount = await client.query(
        'SELECT COUNT(*)::INTEGER AS count FROM users WHERE role = $1',
        ['admin']
      );
      if ((adminCount.rows[0]?.count || 0) <= 1) {
        throw new AppError(400, 'LAST_ADMIN_DELETE', 'Не можна видалити останнього адміністратора.');
      }
    }

    await client.query('DELETE FROM chat_messages WHERE sender_id = $1', [id]);
    await client.query('DELETE FROM blog_publications WHERE creator_id = $1', [id]);
    await client.query('DELETE FROM users WHERE id = $1', [id]);
    await client.query(
      `DELETE FROM chat_conversations
       WHERE id NOT IN (
         SELECT conversation_id FROM chat_members
       )`
    );
    await client.query('COMMIT');
    res.status(204).end();
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
     RETURNING ${userSelect}`,
    [role, id]
  );
  if (!result.rows[0]) throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено.');
  res.json({ data: serializeUser(result.rows[0]) });
}));

export default router;
