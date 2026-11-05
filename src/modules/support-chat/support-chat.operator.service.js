import { createHmac, timingSafeEqual } from 'node:crypto';
import { pool } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/app-error.js';
import { publishSupportChatUpdate } from './support-chat.events.js';
import { hydrateSupportProductCards, resolveSupportProductReferences } from './support-chat.products.js';
import { serializeSupportConversation, serializeSupportMessage } from './support-chat.service.js';
import { lockSupportConversation, nextSupportMessageSequence } from './support-chat.sequence.js';

export async function supportTransaction(work, dbPool = pool) {
  const db = await dbPool.connect();
  try {
    await db.query('BEGIN');
    const result = await work(db);
    await db.query('COMMIT');
    return result;
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}

function cursorSignature(value) { return createHmac('sha256', env.JWT_SECRET).update(value).digest('base64url'); }
export function encodeSupportCursor(scope, position) {
  const value = Buffer.from(JSON.stringify({ v: 1, deployment: env.mobileDeploymentId, scope, ...position })).toString('base64url');
  return `${value}.${cursorSignature(value)}`;
}
export function decodeSupportCursor(value, scope) {
  if (!value) return null;
  try {
    if (value.length > 4096) throw new Error();
    const [encoded, signature, extra] = value.split('.');
    const expected = Buffer.from(cursorSignature(encoded));
    const received = Buffer.from(signature || '');
    if (extra || expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error();
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    if (decoded.v !== 1 || decoded.deployment !== env.mobileDeploymentId || decoded.scope !== scope) throw new Error();
    return decoded;
  } catch { throw new AppError(422, 'SUPPORT_INVALID_CURSOR', 'Курсор сторінки недійсний. Оновіть список.'); }
}

const rowSql = `SELECT conversation.*, to_char(conversation.updated_at, 'YYYY-MM-DD HH24:MI:SS.USOF') AS cursor_updated_at,
  visitor.id AS visitor_id, visitor.name, visitor.email, visitor.phone,
  visitor.first_page_url, visitor.last_page_url, visitor.last_page_title,
  visitor.created_at AS visitor_created_at, visitor.last_seen_at,
  assignee.name AS assigned_user_name
  FROM support_chat_conversations AS conversation
  JOIN support_chat_visitors AS visitor ON visitor.id = conversation.visitor_id
  LEFT JOIN users AS assignee ON assignee.id = conversation.assigned_user_id`;

export function supportReadState(row) {
  return { scope: 'team', lastReadMessageId: row.operator_last_read_message_id || null,
    lastReadSequence: String(row.operator_last_read_sequence || 0) };
}

async function hydrateConversation(row, db = pool) {
  const latest = await db.query(
    `SELECT body, sender_type, created_at FROM support_chat_messages WHERE conversation_id = $1
     ORDER BY message_sequence DESC, created_at DESC, id DESC LIMIT 1`, [row.id]
  );
  const unread = await db.query(
    `SELECT COUNT(*)::INTEGER AS count FROM support_chat_messages WHERE conversation_id = $1 AND sender_type = 'visitor'
     AND (message_sequence > $2 OR (message_sequence IS NULL AND ($3::TIMESTAMPTZ IS NULL OR created_at > $3::TIMESTAMPTZ)))`,
    [row.id, String(row.operator_last_read_sequence || 0), row.operator_last_read_at]
  );
  const last = latest.rows[0];
  return { ...serializeSupportConversation({ ...row, last_message_body: last?.body,
    last_message_sender_type: last?.sender_type, last_message_created_at: last?.created_at, unread_count: unread.rows[0].count }),
  readState: supportReadState(row) };
}

export async function loadSupportConversation(id) {
  await supportTransaction((db) => lockSupportConversation(db, id));
  const result = await pool.query(`${rowSql} WHERE conversation.id = $1`, [id]);
  if (!result.rows[0]) throw new AppError(404, 'SUPPORT_CONVERSATION_NOT_FOUND', 'Діалог онлайн-підтримки не знайдено.');
  return hydrateConversation(result.rows[0]);
}

export async function listSupportConversations({ status = '', search = '', limit = 50, cursor = '' } = {}) {
  const scope = `conversations:${status}:${search}`;
  const after = decodeSupportCursor(cursor, scope);
  if (after && (typeof after.at !== 'string' || !Number.isFinite(Date.parse(after.at)) || !/^[0-9a-f-]{36}$/i.test(after.id))) {
    throw new AppError(422, 'SUPPORT_INVALID_CURSOR', 'Курсор сторінки недійсний.');
  }
  const result = await pool.query(
    `${rowSql} WHERE ($1 = '' OR conversation.status = $1)
     AND ($2 = '' OR COALESCE(visitor.name, '') ILIKE '%' || $2 || '%'
       OR COALESCE(visitor.email, '') ILIKE '%' || $2 || '%'
       OR COALESCE(visitor.phone, '') ILIKE '%' || $2 || '%' OR visitor.last_page_title ILIKE '%' || $2 || '%')
     AND ($3::TIMESTAMPTZ IS NULL OR conversation.updated_at < $3::TIMESTAMPTZ
       OR (conversation.updated_at = $3::TIMESTAMPTZ AND conversation.id < $4::UUID))
     ORDER BY conversation.updated_at DESC, conversation.id DESC LIMIT $5`,
    [status, search, after?.at || null, after?.id || null, limit + 1]
  );
  const rows = result.rows.slice(0, limit);
  const items = [];
  for (const row of rows) items.push(await loadSupportConversation(row.id));
  const last = rows.at(-1);
  return { items, hasMore: result.rows.length > limit,
    nextCursor: result.rows.length > limit ? encodeSupportCursor(scope, { at: last.cursor_updated_at, id: last.id }) : null };
}

export async function listSupportMessages(id, { limit = 50, cursor = '' } = {}) {
  await supportTransaction((db) => lockSupportConversation(db, id));
  const scope = `messages:${id}`;
  const before = decodeSupportCursor(cursor, scope);
  if (before && !/^[1-9][0-9]*$/.test(before.sequence)) throw new AppError(422, 'SUPPORT_INVALID_CURSOR', 'Курсор сторінки недійсний.');
  const result = await pool.query(
    `SELECT message.*, users.name AS sender_name FROM support_chat_messages AS message
     LEFT JOIN users ON users.id = message.sender_user_id
     WHERE message.conversation_id = $1 AND ($2::BIGINT IS NULL OR message.message_sequence < $2::BIGINT)
     ORDER BY message.message_sequence DESC LIMIT $3`, [id, before?.sequence || null, limit + 1]
  );
  const rows = result.rows.slice(0, limit).reverse();
  return { items: (await hydrateSupportProductCards(rows)).map(serializeSupportMessage), hasMore: result.rows.length > limit,
    nextCursor: result.rows.length > limit ? encodeSupportCursor(scope, { sequence: String(rows[0].message_sequence) }) : null };
}

export async function supportUnreadCount(db = pool) {
  const result = await db.query(
    `SELECT COUNT(*)::INTEGER AS count FROM support_chat_messages AS message
     JOIN support_chat_conversations AS conversation ON conversation.id = message.conversation_id
     WHERE message.sender_type = 'visitor' AND conversation.status <> 'CLOSED'
       AND (message.message_sequence > conversation.operator_last_read_sequence
       OR (message.message_sequence IS NULL AND (conversation.operator_last_read_at IS NULL OR message.created_at > conversation.operator_last_read_at)))`
  );
  return Number(result.rows[0].count);
}

export async function markSupportConversationRead(id, messageId) {
  const result = await supportTransaction(async (db) => {
    const row = await lockSupportConversation(db, id);
    const message = (await db.query('SELECT * FROM support_chat_messages WHERE id = $1 AND conversation_id = $2', [messageId, id])).rows[0];
    if (!message) throw new AppError(422, 'SUPPORT_READ_MESSAGE_INVALID', 'Повідомлення не належить цьому діалогу.');
    if (BigInt(message.message_sequence) <= BigInt(row.operator_last_read_sequence)) return { state: supportReadState(row), changed: false };
    const result = await db.query(
      `UPDATE support_chat_conversations SET operator_last_read_sequence = $1,
       operator_last_read_message_id = $2, operator_last_read_at = $3 WHERE id = $4 RETURNING *`,
      [String(message.message_sequence), message.id, message.created_at, id]
    );
    return { state: supportReadState(result.rows[0]), changed: true };
  });
  if (result.changed) publishSupportChatUpdate({ type: 'read', conversationId: id });
  return result.state;
}

export async function claimSupportConversation(id, user) {
  const row = await supportTransaction(async (db) => {
    const current = await lockSupportConversation(db, id);
    if (current.assigned_user_id && current.assigned_user_id !== user.id) throw new AppError(409, 'SUPPORT_CONVERSATION_ALREADY_ASSIGNED', 'Цей діалог уже взяв у роботу інший оператор.');
    await db.query(`UPDATE support_chat_conversations SET assigned_user_id = $1,
      status = CASE WHEN status = 'NEW' THEN 'OPEN' ELSE status END, updated_at = NOW() WHERE id = $2`, [user.id, id]);
    await db.query(`INSERT INTO support_chat_events(conversation_id, actor_user_id, event_type, payload)
      VALUES ($1, $2, 'ASSIGNED', $3::JSONB)`, [id, user.id, JSON.stringify({ assignedUserId: user.id })]);
    return current;
  });
  publishSupportChatUpdate({ type: 'conversation', conversationId: id, visitorId: row.visitor_id });
  return loadSupportConversation(id);
}

export async function updateSupportCustomer(id, input, user) {
  const row = await supportTransaction(async (db) => {
    const current = await lockSupportConversation(db, id);
    await db.query('UPDATE support_chat_visitors SET name = $1, email = $2, phone = $3 WHERE id = $4',
      [input.name || null, input.email || null, input.phone || null, current.visitor_id]);
    await db.query(`INSERT INTO support_chat_events(conversation_id, actor_user_id, event_type, payload)
      VALUES ($1, $2, 'CONTACT_UPDATED', $3::JSONB)`, [id, user.id, JSON.stringify({ source: 'operator', hasName: Boolean(input.name), hasEmail: Boolean(input.email), hasPhone: Boolean(input.phone) })]);
    await db.query('UPDATE support_chat_conversations SET updated_at = NOW() WHERE id = $1', [id]);
    return current;
  });
  publishSupportChatUpdate({ type: 'contact', conversationId: id, visitorId: row.visitor_id });
  return loadSupportConversation(id);
}

export async function setSupportConversationStatus(id, status, user) {
  const row = await supportTransaction(async (db) => {
    const current = await lockSupportConversation(db, id);
    await db.query(`UPDATE support_chat_conversations SET status = $1::VARCHAR,
      resolved_at = CASE WHEN $1::TEXT = 'RESOLVED' THEN COALESCE(resolved_at, NOW()) ELSE NULL END,
      closed_at = CASE WHEN $1::TEXT = 'CLOSED' THEN COALESCE(closed_at, NOW()) ELSE NULL END,
      updated_at = NOW() WHERE id = $2`, [status, id]);
    await db.query(`INSERT INTO support_chat_events(conversation_id, actor_user_id, event_type, payload)
      VALUES ($1, $2, 'STATUS_CHANGED', $3::JSONB)`, [id, user.id, JSON.stringify({ status })]);
    return current;
  });
  publishSupportChatUpdate({ type: 'conversation', conversationId: id, visitorId: row.visitor_id });
  return loadSupportConversation(id);
}

export async function sendSupportOperatorMessage(id, input, user) {
  const references = await resolveSupportProductReferences({ body: input.body });
  const result = await supportTransaction(async (db) => {
    const conversation = await lockSupportConversation(db, id);
    const existing = (await db.query('SELECT * FROM support_chat_messages WHERE conversation_id = $1 AND client_message_id = $2', [id, input.clientMessageId])).rows[0];
    if (existing) {
      if (existing.sender_type !== 'operator' || existing.sender_user_id !== user.id || existing.body !== input.body) throw new AppError(409, 'SUPPORT_CLIENT_MESSAGE_CONFLICT', 'Цей ідентифікатор уже використано для іншого повідомлення.');
      return { row: existing, created: false, conversation };
    }
    const sequence = await nextSupportMessageSequence(db, id);
    const inserted = await db.query(`INSERT INTO support_chat_messages
      (conversation_id, sender_type, sender_user_id, body, client_message_id, product_references, message_sequence)
      VALUES ($1, 'operator', $2, $3, $4, $5::JSONB, $6) RETURNING *`,
    [id, user.id, input.body, input.clientMessageId, JSON.stringify(references), sequence]);
    await db.query(`UPDATE support_chat_conversations SET assigned_user_id = COALESCE(assigned_user_id, $1),
      status = 'WAITING_CUSTOMER', first_response_at = COALESCE(first_response_at, NOW()), updated_at = NOW() WHERE id = $2`, [user.id, id]);
    return { row: inserted.rows[0], created: true, conversation };
  });
  if (result.created) publishSupportChatUpdate({ type: 'message', conversationId: id, messageId: result.row.id,
    visitorId: result.conversation.visitor_id, senderType: 'operator', senderId: user.id });
  const [hydrated] = await hydrateSupportProductCards([{ ...result.row, sender_name: user.name }]);
  return { message: serializeSupportMessage(hydrated), created: result.created };
}
