import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { publishNotificationUpdates } from '../notifications/notification.events.js';
import { createNotification } from '../notifications/notification.service.js';
import {
  assertApprovedParticipants,
  calculateNextReminder,
  loadTaskView
} from './task.service.js';

const router = Router();
router.use(requireAuth);

const idSchema = z.string().uuid();
const typeSchema = z.enum([
  'general', 'reminder', 'deadline', 'offline_meeting', 'online_meeting',
  'call', 'event', 'publication', 'other'
]);
const httpsUrlSchema = z.string().trim().max(4000).refine((value) => {
  if (!value) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}, 'Посилання має починатися з https://');
const reminderSchema = z.object({
  enabled: z.boolean().default(true),
  remindBeforeMinutes: z.number().int().min(5).max(43200).default(30),
  repeatIntervalMinutes: z.number().int().min(5).max(10080).nullable().default(null)
});
const taskSchema = z.object({
  type: typeSchema.default('general'),
  title: z.string().trim().min(1, 'Вкажіть назву справи.').max(160),
  description: z.string().trim().max(5000).default(''),
  isAllDay: z.boolean().default(false),
  startsAt: z.string().datetime({ offset: true }).nullable().default(null),
  dueAt: z.string().datetime({ offset: true }),
  location: z.string().trim().max(500).default(''),
  meetingUrl: httpsUrlSchema.default(''),
  participantIds: z.array(z.string().uuid()).max(50).default([]),
  reminder: reminderSchema.default({ enabled: true, remindBeforeMinutes: 30, repeatIntervalMinutes: null })
}).superRefine((input, context) => {
  if (input.startsAt && new Date(input.dueAt) < new Date(input.startsAt)) {
    context.addIssue({
      code: 'custom',
      path: ['dueAt'],
      message: 'Завершення не може бути раніше початку.'
    });
  }
});
const responseSchema = z.object({ response: z.enum(['accepted', 'declined']) });
const statusSchema = z.object({ status: z.enum(['active', 'completed', 'cancelled']) });
const rangeSchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true })
});

router.get('/counts', asyncHandler(async (req, res) => {
  const range = parseInput(rangeSchema, {
    from: String(req.query.from || ''),
    to: String(req.query.to || '')
  });
  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE tasks.status = 'active')::INTEGER AS active,
       COUNT(*) FILTER (
         WHERE tasks.status = 'active'
           AND COALESCE(tasks.starts_at, tasks.due_at) < $3
           AND tasks.due_at >= $2
       )::INTEGER AS today,
       COUNT(*) FILTER (WHERE tasks.status = 'active' AND tasks.due_at >= NOW())::INTEGER AS upcoming,
       COUNT(*) FILTER (WHERE tasks.status = 'active' AND tasks.due_at < NOW())::INTEGER AS overdue,
       COUNT(*) FILTER (
         WHERE tasks.status = 'active' AND participant.response_status = 'pending'
       )::INTEGER AS invitations
     FROM tasks
     LEFT JOIN task_participants AS participant
       ON participant.task_id = tasks.id AND participant.user_id = $1
     WHERE tasks.owner_id = $1 OR participant.response_status IN ('pending', 'accepted')`,
    [req.user.id, range.from, range.to]
  );
  const counts = result.rows[0] || {};
  res.json({
    data: {
      active: Number(counts.active || 0),
      today: Number(counts.today || 0),
      upcoming: Number(counts.upcoming || 0),
      overdue: Number(counts.overdue || 0),
      invitations: Number(counts.invitations || 0)
    }
  });
}));

router.get('/', asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim().slice(0, 160);
  const filter = String(req.query.filter || 'active');
  const params = [req.user.id, search];
  const conditions = [
    `(tasks.owner_id = $1 OR participant.response_status IN ('pending', 'accepted'))`,
    `($2 = '' OR tasks.title ILIKE '%' || $2 || '%' OR tasks.description ILIKE '%' || $2 || '%')`
  ];

  if (filter === 'completed') conditions.push(`tasks.status = 'completed'`);
  else if (filter === 'cancelled') conditions.push(`tasks.status = 'cancelled'`);
  else if (filter === 'overdue') conditions.push(`tasks.status = 'active' AND tasks.due_at < NOW()`);
  else if (filter === 'upcoming') conditions.push(`tasks.status = 'active' AND tasks.due_at >= NOW()`);
  else if (filter === 'invitations') conditions.push(`participant.response_status = 'pending' AND tasks.status = 'active'`);
  else if (filter === 'today') {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    const range = parseInput(rangeSchema, { from, to });
    params.push(range.from, range.to);
    conditions.push(
      `tasks.status = 'active'
       AND COALESCE(tasks.starts_at, tasks.due_at) < $4
       AND tasks.due_at >= $3`
    );
  } else if (filter !== 'all') {
    conditions.push(`tasks.status = 'active'`);
  }

  const result = await query(
    `SELECT tasks.id
     FROM tasks
     LEFT JOIN task_participants AS participant
       ON participant.task_id = tasks.id AND participant.user_id = $1
     WHERE ${conditions.join(' AND ')}
     ORDER BY CASE WHEN participant.response_status = 'pending' THEN 0 ELSE 1 END,
              tasks.due_at ASC
     LIMIT 100`,
    params
  );

  const tasks = await Promise.all(result.rows.map((row) => loadTaskView(row.id, req.user.id)));
  res.json({ data: tasks.filter(Boolean) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const task = await loadTaskView(id, req.user.id);
  if (!task) throw new AppError(404, 'TASK_NOT_FOUND', 'Справу не знайдено.');
  res.json({ data: task });
}));

router.post('/', asyncHandler(async (req, res) => {
  const input = parseInput(taskSchema, req.body);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const participants = await assertApprovedParticipants(client, input.participantIds, req.user.id);
    if (!participants) throw new AppError(422, 'INVALID_PARTICIPANTS', 'Один або кілька учасників недоступні.');

    const taskResult = await client.query(
      `INSERT INTO tasks (
         owner_id, type, title, description, is_all_day, starts_at, due_at, location, meeting_url
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        req.user.id, input.type, input.title, input.description, input.isAllDay,
        input.startsAt, input.dueAt, input.location, input.meetingUrl
      ]
    );
    const taskId = taskResult.rows[0].id;

    await client.query(
      `INSERT INTO task_reminder_settings (
         task_id, user_id, enabled, remind_before_minutes, repeat_interval_minutes, next_reminder_at
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        taskId, req.user.id, input.reminder.enabled, input.reminder.remindBeforeMinutes,
        input.reminder.repeatIntervalMinutes,
        calculateNextReminder(input.dueAt, input.reminder.enabled, input.reminder.remindBeforeMinutes)
      ]
    );

    for (const participant of participants) {
      await client.query(
        `INSERT INTO task_participants (task_id, user_id) VALUES ($1, $2)`,
        [taskId, participant.id]
      );
      await createNotification(client, {
        userId: participant.id,
        taskId,
        type: 'task_invitation',
        title: 'Нове запрошення',
        message: `${req.user.name} запрошує вас: «${input.title}».`
      });
    }

    await client.query('COMMIT');
    publishNotificationUpdates(participants.map((participant) => participant.id));
    const task = await loadTaskView(taskId, req.user.id);
    res.status(201).json({ data: task });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(taskSchema, req.body);
  const client = await pool.connect();
  const notifiedUserIds = new Set();

  try {
    await client.query('BEGIN');
    const ownerResult = await client.query(
      'SELECT id, title FROM tasks WHERE id = $1 AND owner_id = $2',
      [id, req.user.id]
    );
    if (!ownerResult.rows[0]) throw new AppError(404, 'TASK_NOT_FOUND', 'Справу не знайдено.');

    const participants = await assertApprovedParticipants(client, input.participantIds, req.user.id);
    if (!participants) throw new AppError(422, 'INVALID_PARTICIPANTS', 'Один або кілька учасників недоступні.');
    const desiredIds = new Set(participants.map((participant) => participant.id));
    const existingResult = await client.query(
      `SELECT participant.user_id, participant.response_status, users.name
       FROM task_participants AS participant
       JOIN users ON users.id = participant.user_id
       WHERE participant.task_id = $1`,
      [id]
    );

    for (const existing of existingResult.rows) {
      if (desiredIds.has(existing.user_id)) continue;
      notifiedUserIds.add(existing.user_id);
      await createNotification(client, {
        userId: existing.user_id,
        taskId: id,
        type: 'participant_removed',
        title: 'Участь у справі змінено',
        message: `Вас прибрали зі справи «${ownerResult.rows[0].title}».`
      });
      await client.query('DELETE FROM task_reminder_settings WHERE task_id = $1 AND user_id = $2', [id, existing.user_id]);
      await client.query('DELETE FROM task_participants WHERE task_id = $1 AND user_id = $2', [id, existing.user_id]);
    }

    const existingIds = new Set(existingResult.rows.map((participant) => participant.user_id));
    for (const participant of participants) {
      if (existingIds.has(participant.id)) continue;
      notifiedUserIds.add(participant.id);
      await client.query('INSERT INTO task_participants (task_id, user_id) VALUES ($1, $2)', [id, participant.id]);
      await createNotification(client, {
        userId: participant.id,
        taskId: id,
        type: 'task_invitation',
        title: 'Нове запрошення',
        message: `${req.user.name} запрошує вас: «${input.title}».`
      });
    }

    await client.query(
      `UPDATE tasks SET
         type = $1, title = $2, description = $3, is_all_day = $4,
         starts_at = $5, due_at = $6, location = $7, meeting_url = $8, updated_at = NOW()
       WHERE id = $9`,
      [
        input.type, input.title, input.description, input.isAllDay, input.startsAt,
        input.dueAt, input.location, input.meetingUrl, id
      ]
    );
    await client.query(
      `UPDATE task_reminder_settings SET
         enabled = $1, remind_before_minutes = $2, repeat_interval_minutes = $3,
         next_reminder_at = $4, updated_at = NOW()
       WHERE task_id = $5 AND user_id = $6`,
      [
        input.reminder.enabled, input.reminder.remindBeforeMinutes,
        input.reminder.repeatIntervalMinutes,
        calculateNextReminder(input.dueAt, input.reminder.enabled, input.reminder.remindBeforeMinutes),
        id, req.user.id
      ]
    );
    const participantReminders = await client.query(
      `SELECT user_id, enabled, remind_before_minutes
       FROM task_reminder_settings
       WHERE task_id = $1 AND user_id <> $2`,
      [id, req.user.id]
    );
    for (const reminder of participantReminders.rows) {
      await client.query(
        `UPDATE task_reminder_settings SET next_reminder_at = $1, updated_at = NOW()
         WHERE task_id = $2 AND user_id = $3`,
        [
          calculateNextReminder(input.dueAt, reminder.enabled, reminder.remind_before_minutes),
          id,
          reminder.user_id
        ]
      );
    }

    const activeParticipants = await client.query(
      `SELECT user_id FROM task_participants
       WHERE task_id = $1 AND response_status IN ('pending', 'accepted')`,
      [id]
    );
    for (const participant of activeParticipants.rows) {
      notifiedUserIds.add(participant.user_id);
      await createNotification(client, {
        userId: participant.user_id,
        taskId: id,
        type: 'task_updated',
        title: 'Справу оновлено',
        message: `Змінено дані справи «${input.title}».`
      });
    }

    await client.query('COMMIT');
    publishNotificationUpdates([...notifiedUserIds]);
    const task = await loadTaskView(id, req.user.id);
    res.json({ data: task });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.patch('/:id/status', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const { status } = parseInput(statusSchema, req.body);
  const client = await pool.connect();
  const notifiedUserIds = new Set();
  let transactionOpen = false;
  let task;

  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const changedAt = new Date();
    const result = await client.query(
      `UPDATE tasks SET
         status = $1,
         completed_at = $2,
         cancelled_at = $3,
         updated_at = NOW()
       WHERE id = $4 AND owner_id = $5
       RETURNING title`,
      [
        status,
        status === 'completed' ? changedAt : null,
        status === 'cancelled' ? changedAt : null,
        id,
        req.user.id
      ]
    );
    if (!result.rows[0]) throw new AppError(404, 'TASK_NOT_FOUND', 'Справу не знайдено.');

    if (status === 'completed' || status === 'cancelled') {
      const participants = await client.query(
        `SELECT user_id FROM task_participants WHERE task_id = $1 AND response_status IN ('pending', 'accepted')`,
        [id]
      );
      for (const participant of participants.rows) {
        notifiedUserIds.add(participant.user_id);
        await createNotification(client, {
          userId: participant.user_id,
          taskId: id,
          type: status === 'completed' ? 'task_completed' : 'task_cancelled',
          title: status === 'completed' ? 'Справу завершено' : 'Справу скасовано',
          message: status === 'completed'
            ? `Справу «${result.rows[0].title}» позначено як виконану.`
            : `Справу «${result.rows[0].title}» скасовано.`
        });
      }
    }

    if (status !== 'active') {
      await client.query(
        'UPDATE task_reminder_settings SET next_reminder_at = NULL WHERE task_id = $1',
        [id]
      );
    }
    await client.query('COMMIT');
    transactionOpen = false;
    task = await loadTaskView(id, req.user.id, client);
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  publishNotificationUpdates([...notifiedUserIds]);
  res.json({ data: task });
}));

router.post('/:id/respond', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const { response } = parseInput(responseSchema, req.body);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const participantResult = await client.query(
      `UPDATE task_participants SET response_status = $1, responded_at = NOW()
       WHERE task_id = $2 AND user_id = $3 AND response_status = 'pending'
       RETURNING task_id`,
      [response, id, req.user.id]
    );
    if (!participantResult.rows[0]) {
      throw new AppError(404, 'INVITATION_NOT_FOUND', 'Активне запрошення не знайдено.');
    }

    const taskResult = await client.query('SELECT owner_id, title, due_at FROM tasks WHERE id = $1', [id]);
    const task = taskResult.rows[0];
    await createNotification(client, {
      userId: task.owner_id,
      taskId: id,
      type: response === 'accepted' ? 'invitation_accepted' : 'invitation_declined',
      title: response === 'accepted' ? 'Запрошення прийнято' : 'Запрошення відхилено',
      message: `${req.user.name} ${response === 'accepted' ? 'прийняв(-ла)' : 'відхилив(-ла)'} запрошення до справи «${task.title}».`
    });

    if (response === 'accepted') {
      const ownerReminder = await client.query(
        `SELECT enabled, remind_before_minutes, repeat_interval_minutes
         FROM task_reminder_settings WHERE task_id = $1 AND user_id = $2`,
        [id, task.owner_id]
      );
      const setting = ownerReminder.rows[0] || {
        enabled: true,
        remind_before_minutes: 30,
        repeat_interval_minutes: null
      };
      await client.query(
        `INSERT INTO task_reminder_settings (
           task_id, user_id, enabled, remind_before_minutes, repeat_interval_minutes, next_reminder_at
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (task_id, user_id) DO NOTHING`,
        [
          id, req.user.id, setting.enabled, setting.remind_before_minutes,
          setting.repeat_interval_minutes,
          calculateNextReminder(task.due_at, setting.enabled, setting.remind_before_minutes)
        ]
      );
    }

    await client.query('COMMIT');
    publishNotificationUpdates([task.owner_id]);
    const responseTask = response === 'accepted' ? await loadTaskView(id, req.user.id) : null;
    res.json({ data: responseTask });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.put('/:id/reminder', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(reminderSchema, req.body);
  const accessResult = await query(
    `SELECT tasks.due_at
     FROM tasks
     LEFT JOIN task_participants AS participant
       ON participant.task_id = tasks.id AND participant.user_id = $2
     WHERE tasks.id = $1
       AND tasks.status = 'active'
       AND (tasks.owner_id = $2 OR participant.response_status = 'accepted')`,
    [id, req.user.id]
  );
  if (!accessResult.rows[0]) throw new AppError(404, 'TASK_NOT_FOUND', 'Справу не знайдено.');

  await query(
    `INSERT INTO task_reminder_settings (
       task_id, user_id, enabled, remind_before_minutes, repeat_interval_minutes, next_reminder_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (task_id, user_id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       remind_before_minutes = EXCLUDED.remind_before_minutes,
       repeat_interval_minutes = EXCLUDED.repeat_interval_minutes,
       next_reminder_at = EXCLUDED.next_reminder_at,
       updated_at = NOW()`,
    [
      id, req.user.id, input.enabled, input.remindBeforeMinutes, input.repeatIntervalMinutes,
      calculateNextReminder(accessResult.rows[0].due_at, input.enabled, input.remindBeforeMinutes)
    ]
  );
  const task = await loadTaskView(id, req.user.id);
  res.json({ data: task.reminder });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const participantResult = await query(
    `SELECT COUNT(*)::INTEGER AS count FROM task_participants
     WHERE task_id = $1 AND EXISTS (SELECT 1 FROM tasks WHERE id = $1 AND owner_id = $2)`,
    [id, req.user.id]
  );
  if (!participantResult.rows[0] || participantResult.rows[0].count > 0) {
    if (participantResult.rows[0]?.count > 0) {
      throw new AppError(409, 'SHARED_TASK_CANNOT_BE_DELETED', 'Спільну справу можна лише скасувати.');
    }
  }
  const result = await query('DELETE FROM tasks WHERE id = $1 AND owner_id = $2', [id, req.user.id]);
  if (!result.rowCount) throw new AppError(404, 'TASK_NOT_FOUND', 'Справу не знайдено.');
  res.status(204).end();
}));

export default router;
