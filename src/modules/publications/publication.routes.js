import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import { publishNotificationUpdates } from '../notifications/notification.events.js';
import { createNotification } from '../notifications/notification.service.js';
import {
  assertApprovedAssignees,
  loadPublication,
  replaceMaterials
} from './publication.service.js';

const router = Router();
router.use(requireAuth, requireToolAccess('blog_publications'));

const idSchema = z.string().uuid();
const urlSchema = z.string().trim().url().max(4000).refine((value) => new URL(value).protocol === 'https:', 'Потрібне HTTPS-посилання.');
const materialSchema = z.object({
  type: z.enum(['google_doc', 'drive_folder', 'drive_file', 'image', 'link']),
  label: z.string().trim().min(1).max(160),
  url: urlSchema
});
const publicationSchema = z.object({
  title: z.string().trim().min(1, 'Вкажіть назву публікації.').max(200),
  description: z.string().trim().max(5000).default(''),
  publishAt: z.string().datetime({ offset: true }),
  assigneeId: z.string().uuid(),
  materials: z.array(materialSchema).max(30).default([])
});
const batchSchema = z.object({
  items: z.array(publicationSchema.pick({ title: true, publishAt: true, assigneeId: true })).min(1).max(50)
});
const statusSchema = z.object({
  status: z.enum(['planned', 'ready', 'published', 'cancelled']),
  publicationUrl: z.string().trim().max(4000).default('')
});
const rangeSchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true })
});

function canEdit(user, publication) {
  return user.role === 'admin'
    || user.id === publication.creator.id
    || user.id === publication.assignee.id;
}

router.get('/counts', asyncHandler(async (req, res) => {
  const range = parseInput(rangeSchema, { from: String(req.query.from || ''), to: String(req.query.to || '') });
  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('planned', 'ready'))::INTEGER AS active,
       COUNT(*) FILTER (WHERE status IN ('planned', 'ready') AND publish_at >= $1 AND publish_at < $2)::INTEGER AS today,
       COUNT(*) FILTER (WHERE status IN ('planned', 'ready') AND publish_at >= NOW())::INTEGER AS upcoming,
       COUNT(*) FILTER (WHERE status = 'ready')::INTEGER AS ready,
       COUNT(*) FILTER (WHERE status IN ('planned', 'ready') AND publish_at < NOW())::INTEGER AS overdue
     FROM blog_publications`,
    [range.from, range.to]
  );
  const row = result.rows[0] || {};
  res.json({ data: Object.fromEntries(['active', 'today', 'upcoming', 'ready', 'overdue'].map((key) => [key, Number(row[key] || 0)])) });
}));

router.get('/', asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim().slice(0, 200);
  const filter = String(req.query.filter || 'active');
  const params = [search];
  const conditions = [`($1 = '' OR publication.title ILIKE '%' || $1 || '%' OR publication.description ILIKE '%' || $1 || '%')`];

  if (filter === 'published') conditions.push(`publication.status = 'published'`);
  else if (filter === 'cancelled') conditions.push(`publication.status = 'cancelled'`);
  else if (filter === 'ready') conditions.push(`publication.status = 'ready'`);
  else if (filter === 'overdue') conditions.push(`publication.status IN ('planned', 'ready') AND publication.publish_at < NOW()`);
  else if (filter === 'upcoming') conditions.push(`publication.status IN ('planned', 'ready') AND publication.publish_at >= NOW()`);
  else if (filter === 'today') {
    const range = parseInput(rangeSchema, { from: String(req.query.from || ''), to: String(req.query.to || '') });
    params.push(range.from, range.to);
    conditions.push(`publication.status IN ('planned', 'ready') AND publication.publish_at >= $2 AND publication.publish_at < $3`);
  } else conditions.push(`publication.status IN ('planned', 'ready')`);

  const result = await query(
    `SELECT publication.id
     FROM blog_publications AS publication
     WHERE ${conditions.join(' AND ')}
     ORDER BY CASE WHEN publication.status IN ('planned', 'ready') AND publication.publish_at < NOW() THEN 0 ELSE 1 END,
              publication.publish_at ASC
     LIMIT 200`,
    params
  );
  const publications = await Promise.all(result.rows.map((row) => loadPublication(row.id)));
  res.json({ data: publications.filter(Boolean) });
}));

router.post('/batch', asyncHandler(async (req, res) => {
  const input = parseInput(batchSchema, req.body);
  const client = await pool.connect();
  const createdIds = [];
  const notifiedUsers = new Set();

  try {
    await client.query('BEGIN');
    if (!await assertApprovedAssignees(client, input.items.map((item) => item.assigneeId))) {
      throw new AppError(422, 'INVALID_ASSIGNEE', 'Один або декілька відповідальних недоступні.');
    }
    for (const item of input.items) {
      const result = await client.query(
        `INSERT INTO blog_publications (creator_id, assignee_id, title, publish_at)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [req.user.id, item.assigneeId, item.title, item.publishAt]
      );
      const publicationId = result.rows[0].id;
      createdIds.push(publicationId);
      if (item.assigneeId !== req.user.id) {
        notifiedUsers.add(item.assigneeId);
        await createNotification(client, {
          userId: item.assigneeId,
          publicationId,
          type: 'publication_assigned',
          title: 'Нова публікація блогу',
          message: `${req.user.name} призначив(-ла) вам публікацію «${item.title}».`
        });
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  publishNotificationUpdates([...notifiedUsers]);
  const publications = await Promise.all(createdIds.map((id) => loadPublication(id)));
  res.status(201).json({ data: publications });
}));

router.post('/', asyncHandler(async (req, res) => {
  const input = parseInput(publicationSchema, req.body);
  const client = await pool.connect();
  let publicationId;
  try {
    await client.query('BEGIN');
    if (!await assertApprovedAssignees(client, [input.assigneeId])) {
      throw new AppError(422, 'INVALID_ASSIGNEE', 'Відповідальний недоступний.');
    }
    const result = await client.query(
      `INSERT INTO blog_publications (creator_id, assignee_id, title, description, publish_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.user.id, input.assigneeId, input.title, input.description, input.publishAt]
    );
    publicationId = result.rows[0].id;
    await replaceMaterials(client, publicationId, input.materials);
    if (input.assigneeId !== req.user.id) {
      await createNotification(client, {
        userId: input.assigneeId, publicationId, type: 'publication_assigned',
        title: 'Нова публікація блогу', message: `${req.user.name} призначив(-ла) вам публікацію «${input.title}».`
      });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }

  if (input.assigneeId !== req.user.id) publishNotificationUpdates([input.assigneeId]);
  res.status(201).json({ data: await loadPublication(publicationId) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const publication = await loadPublication(id);
  if (!publication) throw new AppError(404, 'PUBLICATION_NOT_FOUND', 'Публікацію не знайдено.');
  res.json({ data: publication });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(publicationSchema, req.body);
  const current = await loadPublication(id);
  if (!current) throw new AppError(404, 'PUBLICATION_NOT_FOUND', 'Публікацію не знайдено.');
  if (!canEdit(req.user, current)) throw new AppError(403, 'FORBIDDEN', 'Недостатньо прав для редагування публікації.');
  if (['published', 'cancelled'].includes(current.status)) throw new AppError(409, 'PUBLICATION_CLOSED', 'Завершену публікацію не можна редагувати.');

  const client = await pool.connect();
  const notifiedUsers = new Set();
  try {
    await client.query('BEGIN');
    if (!await assertApprovedAssignees(client, [input.assigneeId])) throw new AppError(422, 'INVALID_ASSIGNEE', 'Відповідальний недоступний.');
    await client.query(
      `UPDATE blog_publications SET assignee_id = $1, title = $2, description = $3,
         publish_at = $4, reminder_sent_at = NULL, overdue_notified_at = NULL, updated_at = NOW()
       WHERE id = $5`,
      [input.assigneeId, input.title, input.description, input.publishAt, id]
    );
    await replaceMaterials(client, id, input.materials);
    const recipientIds = [...new Set([current.creator.id, current.assignee.id, input.assigneeId])]
      .filter((userId) => userId !== req.user.id);
    for (const userId of recipientIds) {
      notifiedUsers.add(userId);
      const newlyAssigned = userId === input.assigneeId && current.assignee.id !== input.assigneeId;
      await createNotification(client, {
        userId, publicationId: id, type: newlyAssigned ? 'publication_assigned' : 'publication_updated',
        title: newlyAssigned ? 'Нова публікація блогу' : 'Публікацію оновлено',
        message: `Оновлено дані публікації «${input.title}».`
      });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }

  publishNotificationUpdates([...notifiedUsers]);
  res.json({ data: await loadPublication(id) });
}));

router.patch('/:id/status', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(statusSchema, req.body);
  const current = await loadPublication(id);
  if (!current) throw new AppError(404, 'PUBLICATION_NOT_FOUND', 'Публікацію не знайдено.');
  if (!canEdit(req.user, current)) throw new AppError(403, 'FORBIDDEN', 'Недостатньо прав для зміни статусу.');
  if (input.status === 'published' && !input.publicationUrl) {
    throw new AppError(422, 'PUBLICATION_URL_REQUIRED', 'Додайте посилання на опубліковану статтю.');
  }
  if (input.publicationUrl) parseInput(urlSchema, input.publicationUrl);

  const changedAt = new Date();
  const result = await query(
    `UPDATE blog_publications SET status = $1, publication_url = $2,
       published_at = $3,
       cancelled_at = $4,
       updated_at = NOW()
     WHERE id = $5
     RETURNING id`,
    [
      input.status,
      input.status === 'published' ? input.publicationUrl : current.publicationUrl,
      input.status === 'published' ? changedAt : null,
      input.status === 'cancelled' ? changedAt : null,
      id
    ]
  );

  const recipientIds = [...new Set([current.creator.id, current.assignee.id])].filter((userId) => userId !== req.user.id);
  const notificationMap = {
    ready: ['publication_ready', 'Матеріали готові', `Публікація «${current.title}» готова до публікації.`],
    published: ['publication_published', 'Статтю опубліковано', `Публікацію «${current.title}» позначено опублікованою.`],
    cancelled: ['publication_cancelled', 'Публікацію скасовано', `Публікацію «${current.title}» скасовано.`],
    planned: ['publication_updated', 'Публікацію повернено в план', `Публікацію «${current.title}» повернено до запланованих.`]
  };
  const [type, title, message] = notificationMap[input.status];
  for (const userId of recipientIds) {
    await createNotification({ query }, { userId, publicationId: result.rows[0].id, type, title, message });
  }
  publishNotificationUpdates(recipientIds);
  res.json({ data: await loadPublication(id) });
}));

export default router;
