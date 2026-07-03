import { pool } from '../../db/pool.js';

export function calculateNextReminder(dueAt, enabled, remindBeforeMinutes) {
  if (!enabled) return null;
  return new Date(new Date(dueAt).getTime() - remindBeforeMinutes * 60_000);
}

export function serializeParticipant(row) {
  return {
    id: row.user_id,
    name: row.name,
    email: row.email,
    responseStatus: row.response_status,
    respondedAt: row.responded_at
  };
}

export function serializeReminder(row) {
  if (!row) return null;
  return {
    enabled: row.enabled,
    remindBeforeMinutes: row.remind_before_minutes,
    repeatIntervalMinutes: row.repeat_interval_minutes,
    nextReminderAt: row.next_reminder_at,
    lastRemindedAt: row.last_reminded_at
  };
}

export function serializeTask(row, participants = [], reminder = null) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    isAllDay: row.is_all_day,
    startsAt: row.starts_at,
    dueAt: row.due_at,
    location: row.location,
    meetingUrl: row.meeting_url,
    owner: {
      id: row.owner_id,
      name: row.owner_name
    },
    isOwner: row.is_owner,
    myResponseStatus: row.is_owner ? 'accepted' : row.my_response_status,
    participants,
    reminder,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function loadTaskView(taskId, userId, db = pool) {
  const taskResult = await db.query(
    `SELECT tasks.*, owner.name AS owner_name,
            tasks.owner_id = $2 AS is_owner,
            participant.response_status AS my_response_status
     FROM tasks
     JOIN users AS owner ON owner.id = tasks.owner_id
     LEFT JOIN task_participants AS participant
       ON participant.task_id = tasks.id AND participant.user_id = $2
     WHERE tasks.id = $1
       AND (tasks.owner_id = $2 OR participant.response_status IN ('pending', 'accepted'))`,
    [taskId, userId]
  );
  const task = taskResult.rows[0];
  if (!task) return null;

  const [participantsResult, reminderResult] = await Promise.all([
    db.query(
      `SELECT participant.user_id, participant.response_status, participant.responded_at,
              users.name, users.email
       FROM task_participants AS participant
       JOIN users ON users.id = participant.user_id
       WHERE participant.task_id = $1
       ORDER BY lower(users.name)`,
      [taskId]
    ),
    db.query(
      `SELECT enabled, remind_before_minutes, repeat_interval_minutes,
              next_reminder_at, last_reminded_at
       FROM task_reminder_settings
       WHERE task_id = $1 AND user_id = $2`,
      [taskId, userId]
    )
  ]);

  return serializeTask(
    task,
    participantsResult.rows.map(serializeParticipant),
    serializeReminder(reminderResult.rows[0])
  );
}

export async function assertApprovedParticipants(db, participantIds, ownerId) {
  const uniqueIds = [...new Set(participantIds)].filter((id) => id !== ownerId);
  if (!uniqueIds.length) return [];

  const placeholders = uniqueIds.map((_, index) => `$${index + 1}`).join(', ');
  const result = await db.query(
    `SELECT id, name, email FROM users
     WHERE status = 'approved' AND id IN (${placeholders})`,
    uniqueIds
  );
  if (result.rows.length !== uniqueIds.length) return null;
  return result.rows;
}
