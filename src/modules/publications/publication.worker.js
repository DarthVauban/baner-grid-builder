import { pool } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { getMaintenanceReason } from '../backups/maintenance.service.js';
import { publishNotificationUpdates } from '../notifications/notification.events.js';
import { createNotification } from '../notifications/notification.service.js';

export async function processPublicationReminders({ now = new Date(), lockRows = env.NODE_ENV !== 'test' } = {}) {
  if (getMaintenanceReason()) return 0;
  const client = lockRows ? await pool.connect() : pool;
  const notifiedUsers = new Set();
  let processed = 0;
  try {
    if (lockRows) await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, title, assignee_id, publish_at, reminder_sent_at, overdue_notified_at
       FROM blog_publications
       WHERE status IN ('planned', 'ready')
         AND (reminder_sent_at IS NULL OR overdue_notified_at IS NULL)
       ${lockRows ? 'FOR UPDATE SKIP LOCKED' : ''}
       LIMIT 100`
    );

    for (const publication of result.rows) {
      if (!publication.assignee_id) continue;
      const publishAt = new Date(publication.publish_at);
      if (!publication.overdue_notified_at && publishAt <= now) {
        await createNotification(client, {
          userId: publication.assignee_id,
          publicationId: publication.id,
          type: 'publication_overdue',
          title: 'Публікацію прострочено',
          message: `Минув час публікації «${publication.title}».`
        });
        await client.query('UPDATE blog_publications SET overdue_notified_at = NOW(), reminder_sent_at = COALESCE(reminder_sent_at, NOW()) WHERE id = $1', [publication.id]);
        notifiedUsers.add(publication.assignee_id);
        processed += 1;
      } else if (!publication.reminder_sent_at && publishAt > now && publishAt.getTime() - now.getTime() <= 24 * 60 * 60 * 1000) {
        await createNotification(client, {
          userId: publication.assignee_id,
          publicationId: publication.id,
          type: 'publication_reminder',
          title: 'Наближається публікація',
          message: `Менше доби до публікації «${publication.title}».`
        });
        await client.query('UPDATE blog_publications SET reminder_sent_at = NOW() WHERE id = $1', [publication.id]);
        notifiedUsers.add(publication.assignee_id);
        processed += 1;
      }
    }
    if (lockRows) await client.query('COMMIT');
    publishNotificationUpdates([...notifiedUsers]);
    return processed;
  } catch (error) {
    if (lockRows) await client.query('ROLLBACK');
    throw error;
  } finally {
    if (lockRows) client.release();
  }
}

export function startPublicationWorker({ intervalMs = 30_000 } = {}) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await processPublicationReminders(); }
    catch (error) { console.error('Publication reminder worker failed', error); }
    finally { running = false; }
  };
  const timer = setInterval(run, intervalMs);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
