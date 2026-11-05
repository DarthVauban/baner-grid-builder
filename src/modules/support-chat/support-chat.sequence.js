import { AppError } from '../../lib/app-error.js';

// Every writer and read acknowledgment locks the same parent BEFORE assigning a
// number. A standalone sequence/nextval does not order transaction commits.
export async function lockSupportConversation(db, id) {
  const result = await db.query(`SELECT *, to_char(operator_last_read_at, 'YYYY-MM-DD HH24:MI:SS.USOF') AS legacy_read_at_exact
    FROM support_chat_conversations WHERE id = $1 FOR UPDATE`, [id]);
  const row = result.rows[0];
  if (!row) throw new AppError(404, 'SUPPORT_CONVERSATION_NOT_FOUND', 'Діалог онлайн-підтримки не знайдено.');
  if (row.message_sequence_initialized) return row;
  const history = await db.query(
    `SELECT id, CASE WHEN $2::TIMESTAMPTZ IS NULL THEN FALSE ELSE created_at <= $2::TIMESTAMPTZ END AS was_read
     FROM support_chat_messages WHERE conversation_id = $1 ORDER BY created_at, id`,
    [id, row.legacy_read_at_exact]
  );
  let readSequence = 0;
  let readId = null;
  for (let index = 0; index < history.rows.length; index += 1) {
    const message = history.rows[index];
    if (message.was_read) { readSequence = index + 1; readId = message.id; }
  }
  for (let start = 0; start < history.rows.length; start += 200) {
    const chunk = history.rows.slice(start, start + 200);
    const values = chunk.flatMap((message, index) => [message.id, String(start + index + 1)]);
    const branches = chunk.map((_, index) => `WHEN $${index * 2 + 1}::UUID THEN $${index * 2 + 2}::BIGINT`).join(' ');
    const ids = chunk.map((_, index) => `$${index * 2 + 1}::UUID`).join(',');
    await db.query(`UPDATE support_chat_messages SET message_sequence = CASE id ${branches} END WHERE id IN (${ids})`, values);
  }
  const initialized = await db.query(
    `UPDATE support_chat_conversations SET message_sequence_initialized = TRUE,
       message_sequence_counter = $1, operator_last_read_sequence = $2,
       operator_last_read_message_id = $3 WHERE id = $4 RETURNING *`,
    [String(history.rows.length), String(readSequence), readId, id]
  );
  return initialized.rows[0];
}

export async function nextSupportMessageSequence(db, conversationId) {
  const result = await db.query(
    `UPDATE support_chat_conversations SET message_sequence_counter = message_sequence_counter + 1
     WHERE id = $1 RETURNING message_sequence_counter`, [conversationId]
  );
  return String(result.rows[0].message_sequence_counter);
}
