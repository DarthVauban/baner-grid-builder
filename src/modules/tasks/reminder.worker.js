import { pool } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { createNotification } from '../notifications/notification.service.js';

export async function processDueReminders({ now = new Date(), lockRows = env.NODE_ENV !== 'test' } = {}) {
  const useTransaction = lockRows;
  const client = useTransaction ? await pool.connect() : pool;
  try {
    if (useTransaction) await client.query('BEGIN');
    const result = !lockRows
      ? await client.query(
        `SELECT task_id, user_id, enabled, repeat_interval_minutes, next_reminder_at
         FROM task_reminder_settings`
      )
      : await client.query(
        `SELECT task_id, user_id, enabled, repeat_interval_minutes, next_reminder_at
         FROM task_reminder_settings
         WHERE enabled = TRUE AND next_reminder_at IS NOT NULL AND next_reminder_at <= NOW()
         LIMIT 50
         FOR UPDATE SKIP LOCKED`
      );
    const dueReminders = !lockRows
      ? result.rows.filter((reminder) => (
        reminder.enabled
        && reminder.next_reminder_at
        && new Date(reminder.next_reminder_at) <= now
      ))
      : result.rows;
    for (const reminder of dueReminders) {
      const taskResult = await client.query(
        `SELECT title, due_at FROM tasks WHERE id = $1 AND status = 'active'`,
        [reminder.task_id]
      );
      const task = taskResult.rows[0];
      if (!task) {
        await client.query(
          `UPDATE task_reminder_settings SET next_reminder_at = NULL, updated_at = NOW()
           WHERE task_id = $1 AND user_id = $2`,
          [reminder.task_id, reminder.user_id]
        );
        continue;
      }

      const dueAt = new Date(task.due_at);
      const isOverdue = now >= dueAt;
      await createNotification(client, {
        userId: reminder.user_id,
        taskId: reminder.task_id,
        type: isOverdue ? 'task_overdue' : 'task_reminder',
        title: isOverdue ? 'Термін справи минув' : 'Наближається справа',
        message: isOverdue
          ? `Минув термін справи «${task.title}».`
          : `Незабаром: «${task.title}».`
      });

      let nextReminderAt = null;
      if (!isOverdue && reminder.repeat_interval_minutes) {
        const candidate = new Date(now.getTime() + reminder.repeat_interval_minutes * 60_000);
        if (candidate < dueAt) nextReminderAt = candidate;
      }

      await client.query(
        `UPDATE task_reminder_settings
         SET last_reminded_at = NOW(), next_reminder_at = $1, updated_at = NOW()
         WHERE task_id = $2 AND user_id = $3`,
        [nextReminderAt, reminder.task_id, reminder.user_id]
      );
    }
    if (useTransaction) await client.query('COMMIT');
    return dueReminders.length;
  } catch (error) {
    if (useTransaction) await client.query('ROLLBACK');
    throw error;
  } finally {
    if (useTransaction) client.release();
  }
}

export function startReminderWorker({ intervalMs = 30_000 } = {}) {
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      await processDueReminders();
    } catch (error) {
      console.error('Reminder worker failed', error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(run, intervalMs);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
