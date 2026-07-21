import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import { isPrimaryAdmin, verifyUserTwoFactor } from '../auth/two-factor.service.js';
import { publishChatUpdates } from '../chat/chat.events.js';
import { createNotification } from '../notifications/notification.service.js';
import { publishNotificationUpdates } from '../notifications/notification.events.js';
import {
  appendApplicationVisibility,
  applicationStatusLabels,
  applicationStatuses,
  canViewApplicationRow,
  getApplicationNotificationRecipientIds,
  getApplicationRecipientIds,
  loadApplicationView
} from './application.service.js';
import { publishApplicationUpdates, subscribeToApplicationUpdates } from './application.events.js';

const router = Router();
router.use(requireAuth, requireToolAccess('applications'));

const idSchema = z.string().uuid();
const listSchema = z.object({
  filter: z.enum(['all', ...applicationStatuses]).default('all'),
  formId: z.string().uuid().optional(),
  search: z.string().trim().max(80).default(''),
  sort: z.enum(['created_desc', 'updated_desc', 'number_asc', 'number_desc']).default('created_desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25)
});
const statusSchema = z.object({
  status: z.enum(applicationStatuses),
  expectedVersion: z.number().int().min(1),
  comment: z.string().trim().max(1000).default('')
});
const claimSchema = z.object({
  expectedVersion: z.number().int().min(1)
});
const commentSchema = z.object({
  text: z.string().trim().min(1).max(3000),
  expectedVersion: z.number().int().min(1).optional()
});
const deleteSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Вкажіть 6-значний код з застосунку аутентифікатора.')
});

const sortSql = {
  created_desc: 'app.created_at DESC',
  updated_desc: 'app.updated_at DESC',
  number_asc: 'app.application_number ASC',
  number_desc: 'app.application_number DESC'
};
const maxProductImageBytes = 10 * 1024 * 1024;

function isBlockedImageHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  if (/^(?:0|10|127|169\.254|192\.168)\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function productImageCandidates(value) {
  const parsed = new URL(value);
  const candidates = [parsed.toString()];
  if (parsed.protocol === 'https:') {
    parsed.protocol = 'http:';
    candidates.push(parsed.toString());
  }
  return candidates;
}

async function fetchProductImage(value) {
  let lastError;
  for (const candidate of productImageCandidates(value)) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(candidate, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`Image request failed with ${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      if (contentType && !contentType.toLowerCase().startsWith('image/')) throw new Error('Remote resource is not an image');
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > maxProductImageBytes) throw new Error('Remote image is too large');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > maxProductImageBytes) throw new Error('Remote image is too large');
      return { bytes, contentType: contentType || 'image/webp' };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Image unavailable');
}

async function notifyApplicationRecipients(db, applicationId, actorId, type, title, message) {
  const applicationResult = await db.query(
    'SELECT form_id FROM applications WHERE id = $1',
    [applicationId]
  );
  const formId = applicationResult.rows[0]?.form_id;
  if (!formId) return [];
  const recipients = (await getApplicationNotificationRecipientIds(db, formId))
    .filter((userId) => userId !== actorId);
  for (const userId of recipients) {
    await createNotification(db, { userId, applicationId, type, title, message });
  }
  return recipients;
}

router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const sendUpdate = (payload) => res.write(`event: applications\ndata: ${JSON.stringify(payload)}\n\n`);
  const unsubscribe = subscribeToApplicationUpdates(req.user.id, sendUpdate);
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
  heartbeat.unref();
  res.write('event: connected\ndata: {}\n\n');
  req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
});

router.get('/counts', asyncHandler(async (req, res) => {
  const params = [];
  const where = [];
  appendApplicationVisibility(where, params, req.user);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await query(
    `SELECT
       COUNT(*)::INTEGER AS total,
       COUNT(*) FILTER (WHERE status = 'new')::INTEGER AS new,
       COUNT(*) FILTER (WHERE status = 'in_progress')::INTEGER AS in_progress,
       COUNT(*) FILTER (WHERE status = 'rejected')::INTEGER AS rejected,
       COUNT(*) FILTER (WHERE status = 'closed')::INTEGER AS closed
     FROM applications AS app
     ${whereSql}`,
    params
  );
  const row = result.rows[0] || {};
  const unassignedResult = await query(
    `SELECT
       COUNT(*)::INTEGER AS total,
       COUNT(*) FILTER (WHERE status = 'new')::INTEGER AS new,
       COUNT(*) FILTER (WHERE status = 'in_progress')::INTEGER AS in_progress,
       COUNT(*) FILTER (WHERE status = 'rejected')::INTEGER AS rejected,
       COUNT(*) FILTER (WHERE status = 'closed')::INTEGER AS closed
     FROM applications
     WHERE assigned_to IS NULL`
  );
  const managerResult = await query(
    `SELECT users.id, users.name,
       COUNT(app.id)::INTEGER AS total,
       COUNT(app.id) FILTER (WHERE app.status = 'new')::INTEGER AS new,
       COUNT(app.id) FILTER (WHERE app.status = 'in_progress')::INTEGER AS in_progress,
       COUNT(app.id) FILTER (WHERE app.status = 'rejected')::INTEGER AS rejected,
       COUNT(app.id) FILTER (WHERE app.status = 'closed')::INTEGER AS closed,
       MAX(app.updated_at) AS last_activity_at
     FROM applications AS app
     JOIN users ON users.id = app.assigned_to
     GROUP BY users.id, users.name
     ORDER BY in_progress DESC, total DESC, lower(users.name)`
  );
  const unassigned = unassignedResult.rows[0] || {};
  res.json({ data: {
    all: Number(row.total || 0),
    new: Number(row.new || 0),
    inProgress: Number(row.in_progress || 0),
    rejected: Number(row.rejected || 0),
    closed: Number(row.closed || 0),
    unassigned: {
      all: Number(unassigned.total || 0),
      new: Number(unassigned.new || 0),
      inProgress: Number(unassigned.in_progress || 0),
      rejected: Number(unassigned.rejected || 0),
      closed: Number(unassigned.closed || 0)
    },
    managerStats: managerResult.rows.map((manager) => ({
      manager: { id: manager.id, name: manager.name },
      all: Number(manager.total || 0),
      new: Number(manager.new || 0),
      inProgress: Number(manager.in_progress || 0),
      rejected: Number(manager.rejected || 0),
      closed: Number(manager.closed || 0),
      lastActivityAt: manager.last_activity_at || null
    }))
  } });
}));

router.get('/forms', asyncHandler(async (req, res) => {
  const params = [];
  const join = ['app.form_id = form.id'];
  appendApplicationVisibility(join, params, req.user);
  const result = await query(
    `SELECT
       form.id,
       form.public_id,
       form.name,
       form.status,
       COUNT(app.id)::INTEGER AS total,
       COUNT(app.id) FILTER (WHERE app.status = 'new')::INTEGER AS new,
       COUNT(app.id) FILTER (WHERE app.status = 'in_progress')::INTEGER AS in_progress,
       COUNT(app.id) FILTER (WHERE app.status = 'rejected')::INTEGER AS rejected,
       COUNT(app.id) FILTER (WHERE app.status = 'closed')::INTEGER AS closed
     FROM application_forms AS form
     LEFT JOIN applications AS app ON ${join.join(' AND ')}
     WHERE form.status <> 'archived' OR app.id IS NOT NULL
     GROUP BY form.id, form.public_id, form.name, form.status
     ORDER BY COUNT(app.id) DESC, lower(form.name)`,
    params
  );
  res.json({ data: result.rows.map((form) => ({
    id: form.id,
    publicId: form.public_id,
    name: form.name,
    status: form.status,
    all: Number(form.total || 0),
    new: Number(form.new || 0),
    inProgress: Number(form.in_progress || 0),
    rejected: Number(form.rejected || 0),
    closed: Number(form.closed || 0)
  })) });
}));

router.get('/', asyncHandler(async (req, res) => {
  const input = parseInput(listSchema, {
    filter: req.query.filter || 'all',
    formId: req.query.formId || undefined,
    search: String(req.query.search || ''),
    sort: req.query.sort || 'created_desc',
    page: req.query.page || 1,
    pageSize: req.query.pageSize || 25
  });
  const params = [];
  const where = [];
  appendApplicationVisibility(where, params, req.user);
  const searchTerms = input.search.toLowerCase().split(/\s+/).filter(Boolean);
  if (searchTerms.length) {
    const termClauses = searchTerms.map((term) => {
      const clauses = [];
      params.push(`%${term}%`);
      const textParam = params.length;
      clauses.push(`LOWER(app.application_number) LIKE $${textParam}`);
      clauses.push(`app.id IN (
        SELECT values.application_id
        FROM application_values AS values
        WHERE values.system_field_type IN ('first_name', 'last_name', 'phone')
          AND LOWER(values.value) LIKE $${textParam}
      )`);
      const digits = term.replace(/\D/g, '');
      if (digits) {
        params.push(`%${digits}%`);
        const digitParam = params.length;
        clauses.push(`app.application_number LIKE $${digitParam}`);
        clauses.push(`app.id IN (
          SELECT values.application_id
          FROM application_values AS values
          WHERE values.system_field_type = 'phone'
            AND values.value LIKE $${digitParam}
        )`);
      }
      return `(${clauses.join(' OR ')})`;
    });
    where.push(`(${termClauses.join(' AND ')})`);
  }
  if (input.filter !== 'all') {
    params.push(input.filter);
    where.push(`app.status = $${params.length}`);
  }
  if (input.formId) {
    params.push(input.formId);
    where.push(`app.form_id = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalResult = await query(`SELECT COUNT(*)::INTEGER AS count FROM applications AS app ${whereSql}`, params);
  const offset = (input.page - 1) * input.pageSize;
  const result = await query(
    `SELECT app.id
     FROM applications AS app
     ${whereSql}
     ORDER BY ${sortSql[input.sort]}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, input.pageSize, offset]
  );
  const items = (await Promise.all(result.rows.map((row) => loadApplicationView(row.id, req.user)))).filter(Boolean);
  const total = Number(totalResult.rows[0]?.count || 0);
  res.json({ data: {
    items,
    total,
    page: input.page,
    pageSize: input.pageSize,
    pageCount: Math.max(1, Math.ceil(total / input.pageSize))
  } });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const application = await loadApplicationView(id, req.user);
  if (!application) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Заявку не знайдено.');
  res.json({ data: application });
}));

router.get('/:id/product-image', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const application = await loadApplicationView(id, req.user);
  const imageUrl = application?.product?.imageUrl || '';
  if (!application || !imageUrl) throw new AppError(404, 'PRODUCT_IMAGE_NOT_FOUND', 'Фото товару не знайдено.');

  let parsed;
  try {
    parsed = new URL(imageUrl);
  } catch {
    throw new AppError(422, 'PRODUCT_IMAGE_INVALID', 'Посилання на фото товару некоректне.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedImageHost(parsed.hostname)) {
    throw new AppError(422, 'PRODUCT_IMAGE_INVALID', 'Посилання на фото товару некоректне.');
  }

  try {
    const image = await fetchProductImage(imageUrl);
    res.setHeader('Cache-Control', 'private, max-age=1800');
    res.setHeader('Content-Type', image.contentType);
    res.send(image.bytes);
  } catch {
    throw new AppError(502, 'PRODUCT_IMAGE_UNAVAILABLE', 'Не вдалося завантажити фото товару.');
  }
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!isPrimaryAdmin(req.user)) {
    throw new AppError(403, 'PRIMARY_ADMIN_REQUIRED', 'Лише головний адміністратор може видаляти заявки.');
  }

  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(deleteSchema, req.body);
  const exists = await query('SELECT id FROM applications WHERE id = $1', [id]);
  if (!exists.rows[0]) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Заявку не знайдено.');

  await verifyUserTwoFactor(req.user.id, input.code);

  const client = await pool.connect();
  let recipients = [];
  let applicationNumber = '';
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      'SELECT id, application_number FROM applications WHERE id = $1 FOR UPDATE',
      [id]
    );
    const current = currentResult.rows[0];
    if (!current) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Заявку не знайдено.');
    applicationNumber = current.application_number;
    recipients = await getApplicationRecipientIds(client);
    await client.query('DELETE FROM applications WHERE id = $1', [id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  publishApplicationUpdates(recipients, {
    type: 'deleted',
    applicationId: id,
    number: applicationNumber
  });
  publishNotificationUpdates(recipients);
  publishChatUpdates(recipients, { type: 'entity', entityType: 'application', entityId: id, senderId: req.user.id });
  res.status(204).end();
}));

router.post('/:id/claim', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(claimSchema, req.body);
  const client = await pool.connect();
  let notificationRecipients = [];
  let application;
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      'SELECT id, application_number, status, version, assigned_to FROM applications WHERE id = $1 FOR UPDATE',
      [id]
    );
    const current = currentResult.rows[0];
    if (!current || !canViewApplicationRow(current, req.user)) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Заявку не знайдено.');
    if (current.version !== input.expectedVersion) {
      throw new AppError(409, 'APPLICATION_VERSION_CONFLICT', 'Заявку вже оновлено іншим користувачем. Відкрийте актуальну версію.');
    }
    if (current.assigned_to && current.assigned_to !== req.user.id) {
      throw new AppError(409, 'APPLICATION_ALREADY_ASSIGNED', 'Заявку вже взяв у роботу інший менеджер.');
    }
    await client.query(
      `UPDATE applications
       SET status = 'in_progress',
           assigned_to = $1,
           assigned_at = COALESCE(assigned_at, NOW()),
           version = version + 1,
           last_changed_by = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [req.user.id, id]
    );
    await client.query(
      `INSERT INTO application_status_history (
         application_id, previous_status, new_status, changed_by, comment
       ) VALUES ($1, $2, 'in_progress', $3, $4)`,
      [id, current.status, req.user.id, 'Взято в роботу']
    );
    notificationRecipients = await notifyApplicationRecipients(
      client,
      id,
      req.user.id,
      'application_status_changed',
      `Заявку №${current.application_number} взято в роботу`,
      `${req.user.name} взяв(-ла) заявку в роботу.`
    );
    await client.query('COMMIT');
    application = await loadApplicationView(id, req.user);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const updateRecipients = [...new Set([...(await getApplicationRecipientIds()), req.user.id])];
  publishApplicationUpdates(updateRecipients, {
    type: 'claimed',
    applicationId: id,
    status: application?.status,
    version: application?.version,
    updatedAt: application?.updatedAt
  });
  publishNotificationUpdates(notificationRecipients);
  publishChatUpdates(updateRecipients, { type: 'entity', entityType: 'application', entityId: id, senderId: req.user.id });
  res.json({ data: application });
}));

router.patch('/:id/status', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(statusSchema, req.body);
  const client = await pool.connect();
  let notificationRecipients = [];
  let application;
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      'SELECT id, application_number, status, version, assigned_to, assigned_at FROM applications WHERE id = $1 FOR UPDATE',
      [id]
    );
    const current = currentResult.rows[0];
    if (!current || !canViewApplicationRow(current, req.user)) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Заявку не знайдено.');
    if (current.version !== input.expectedVersion) {
      throw new AppError(409, 'APPLICATION_VERSION_CONFLICT', 'Заявку вже оновлено іншим користувачем. Відкрийте актуальну версію.');
    }
    if (current.status !== input.status) {
      const nextAssignedTo = input.status === 'new' ? null : (current.assigned_to || req.user.id);
      const nextAssignedAt = input.status === 'new' ? null : (current.assigned_at || new Date());
      await client.query(
        `UPDATE applications
         SET status = $1,
             assigned_to = $2,
             assigned_at = $3,
             version = version + 1,
             last_changed_by = $4,
             updated_at = NOW()
         WHERE id = $5`,
        [input.status, nextAssignedTo, nextAssignedAt, req.user.id, id]
      );
      await client.query(
        `INSERT INTO application_status_history (
           application_id, previous_status, new_status, changed_by, comment
         ) VALUES ($1, $2, $3, $4, $5)`,
        [id, current.status, input.status, req.user.id, input.comment]
      );
      notificationRecipients = await notifyApplicationRecipients(
        client,
        id,
        req.user.id,
        'application_status_changed',
        `Статус заявки №${current.application_number} змінено`,
        `Новий статус: ${applicationStatusLabels[input.status]}.`
      );
    }
    await client.query('COMMIT');
    application = await loadApplicationView(id, req.user);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  if (application) {
    const updateRecipients = [...new Set([...(await getApplicationRecipientIds()), req.user.id])];
    publishApplicationUpdates(updateRecipients, {
      type: 'status_changed',
      applicationId: id,
      status: application.status,
      version: application.version,
      updatedAt: application.updatedAt
    });
    publishNotificationUpdates(notificationRecipients);
    publishChatUpdates(updateRecipients, { type: 'entity', entityType: 'application', entityId: id, senderId: req.user.id });
  }
  res.json({ data: application });
}));

router.post('/:id/comments', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(commentSchema, req.body);
  const client = await pool.connect();
  let notificationRecipients = [];
  let application;
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      'SELECT id, application_number, version, assigned_to FROM applications WHERE id = $1 FOR UPDATE',
      [id]
    );
    const current = currentResult.rows[0];
    if (!current || !canViewApplicationRow(current, req.user)) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Заявку не знайдено.');
    if (input.expectedVersion && current.version !== input.expectedVersion) {
      throw new AppError(409, 'APPLICATION_VERSION_CONFLICT', 'Заявку вже оновлено іншим користувачем. Відкрийте актуальну версію.');
    }
    await client.query(
      `INSERT INTO application_comments (application_id, user_id, text)
       VALUES ($1, $2, $3)`,
      [id, req.user.id, input.text]
    );
    await client.query(
      `UPDATE applications
       SET version = version + 1, last_changed_by = $1, updated_at = NOW()
       WHERE id = $2`,
      [req.user.id, id]
    );
    notificationRecipients = await notifyApplicationRecipients(
      client,
      id,
      req.user.id,
      'application_comment_added',
      `Новий коментар у заявці №${current.application_number}`,
      `${req.user.name} додав(-ла) внутрішній коментар.`
    );
    await client.query('COMMIT');
    application = await loadApplicationView(id, req.user);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  const updateRecipients = [...new Set([...(await getApplicationRecipientIds()), req.user.id])];
  publishApplicationUpdates(updateRecipients, {
    type: 'comment_added',
    applicationId: id,
    version: application?.version,
    updatedAt: application?.updatedAt
  });
  publishNotificationUpdates(notificationRecipients);
  publishChatUpdates(updateRecipients, { type: 'entity', entityType: 'application', entityId: id, senderId: req.user.id });
  res.status(201).json({ data: application });
}));

export default router;
