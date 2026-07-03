export async function createNotification(db, {
  userId,
  taskId,
  type,
  title,
  message = ''
}) {
  await db.query(
    `INSERT INTO notifications (user_id, task_id, type, title, message)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, taskId || null, type, title, message]
  );
}

export function serializeNotification(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    type: row.type,
    title: row.title,
    message: row.message,
    readAt: row.read_at,
    createdAt: row.created_at
  };
}
