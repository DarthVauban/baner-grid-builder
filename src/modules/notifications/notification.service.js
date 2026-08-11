import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { publishNotificationUpdates } from './notification.events.js';

export async function createNotification(db, {
  userId,
  taskId,
  publicationId,
  applicationId,
  type,
  title,
  message = ''
}) {
  const result = await db.query(
    `INSERT INTO notifications (user_id, task_id, publication_id, application_id, type, title, message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [userId, taskId || null, publicationId || null, applicationId || null, type, title, message]
  );
  const notificationId = result.rows[0].id;
  await db.query(
    `INSERT INTO mobile_push_outbox (device_id, kind, notification_id, payload)
     SELECT id, 'workspace_notification', $2, $3::JSONB
     FROM mobile_devices
     WHERE user_id = $1 AND revoked_at IS NULL
     ON CONFLICT DO NOTHING`,
    [
      userId,
      notificationId,
      JSON.stringify({ kind: 'workspace_notification', notificationId })
    ]
  );
  return notificationId;
}

export function serializeNotification(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    publicationId: row.publication_id,
    applicationId: row.application_id,
    type: row.type,
    title: row.title,
    message: row.message,
    readAt: row.read_at,
    createdAt: row.created_at
  };
}

export async function listUserNotifications(userId, { unreadOnly = false, limit = 100 } = {}, db = { query }) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 100));
  const [result, countResult] = await Promise.all([
    db.query(
      `SELECT id, task_id, publication_id, application_id, type, title, message, read_at, created_at
       FROM notifications
       WHERE user_id = $1 AND ($2::BOOLEAN = FALSE OR read_at IS NULL)
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, Boolean(unreadOnly), safeLimit]
    ),
    db.query(
      'SELECT COUNT(*)::INTEGER AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [userId]
    )
  ]);
  return {
    items: result.rows.map(serializeNotification),
    unreadCount: countResult.rows[0]?.count || 0
  };
}

export async function markUserNotificationRead(userId, notificationId, db = { query }) {
  const result = await db.query(
    `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2
     RETURNING id, task_id, publication_id, application_id, type, title, message, read_at, created_at`,
    [notificationId, userId]
  );
  if (!result.rows[0]) throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Сповіщення не знайдено.');
  publishNotificationUpdates([userId]);
  return serializeNotification(result.rows[0]);
}

export async function markAllUserNotificationsRead(userId, db = { query }) {
  const result = await db.query(
    'UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL',
    [userId]
  );
  if (result.rowCount) publishNotificationUpdates([userId]);
}
