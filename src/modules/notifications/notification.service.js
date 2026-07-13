export async function createNotification(db, {
  userId,
  taskId,
  publicationId,
  applicationId,
  type,
  title,
  message = ''
}) {
  await db.query(
    `INSERT INTO notifications (user_id, task_id, publication_id, application_id, type, title, message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, taskId || null, publicationId || null, applicationId || null, type, title, message]
  );
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
