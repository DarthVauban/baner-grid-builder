import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import { publishChatUpdates, subscribeToChatUpdates } from './chat.events.js';
import {
  assertConversationMember,
  directConversationKey,
  extractEntityReferences,
  loadConversationMembers,
  serializeChatMessage
} from './chat.service.js';

const router = Router();
router.use(requireAuth, requireToolAccess('chat'));

const idSchema = z.string().uuid();
const createConversationSchema = z.object({
  userId: z.string().uuid(),
  body: z.string().trim().min(1).max(5000)
});
const messageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  replyToId: z.string().uuid().nullable().optional().default(null)
});
const typingSchema = z.object({ isTyping: z.boolean() });

function getAllowedOrigins(req) {
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const candidates = [
    env.APP_ORIGIN,
    `${req.protocol}://${req.get('host')}`,
    req.get('origin'),
    forwardedHost ? `${forwardedProto}://${forwardedHost}` : ''
  ];
  return [...new Set(candidates.filter(Boolean).flatMap((candidate) => {
    try { return [new URL(candidate).origin]; } catch { return []; }
  }))];
}

router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const sendUpdate = (payload) => res.write(`event: chat\ndata: ${JSON.stringify(payload)}\n\n`);
  const unsubscribe = subscribeToChatUpdates(req.user.id, sendUpdate);
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
  heartbeat.unref();
  res.write('event: connected\ndata: {}\n\n');
  req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
});

router.get('/contacts', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT users.id, users.name, users.email, users.avatar_mime, users.updated_at
     FROM users
     LEFT JOIN user_tool_access AS chat_access
       ON chat_access.user_id = users.id AND chat_access.tool_id = 'chat'
     WHERE users.status = 'approved'
       AND users.id <> $1
       AND (users.role = 'admin' OR chat_access.user_id IS NOT NULL)
     ORDER BY lower(users.name), lower(users.email)
     LIMIT 500`,
    [req.user.id]
  );
  res.json({ data: result.rows.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatar_mime ? `/api/users/${user.id}/avatar?v=${encodeURIComponent(user.updated_at || '')}` : ''
  })) });
}));

router.get('/unread-count', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT COUNT(*)::INTEGER AS count
     FROM chat_messages AS message
     JOIN chat_members AS member ON member.conversation_id = message.conversation_id
     WHERE member.user_id = $1
       AND message.sender_id <> $1
       AND message.created_at > COALESCE(member.last_read_at, member.joined_at)`,
    [req.user.id]
  );
  res.json({ data: Number(result.rows[0]?.count || 0) });
}));

router.get('/conversations', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT conversation.id, conversation.updated_at,
            other_user.id AS other_id, other_user.name AS other_name, other_user.email AS other_email,
            other_user.avatar_mime AS other_avatar_mime, other_user.updated_at AS other_updated_at,
            member.last_read_at, member.joined_at
     FROM chat_conversations AS conversation
     JOIN (SELECT DISTINCT conversation_id FROM chat_messages) AS populated
       ON populated.conversation_id = conversation.id
     JOIN chat_members AS member ON member.conversation_id = conversation.id AND member.user_id = $1
     JOIN chat_members AS other_member ON other_member.conversation_id = conversation.id AND other_member.user_id <> $1
     JOIN users AS other_user ON other_user.id = other_member.user_id
     ORDER BY conversation.updated_at DESC
     LIMIT 200`,
    [req.user.id]
  );
  const conversations = await Promise.all(result.rows.map(async (row) => {
    const latest = await query(
      `SELECT body, created_at FROM chat_messages
       WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [row.id]
    );
    const unread = await query(
      `SELECT COUNT(*)::INTEGER AS count FROM chat_messages
       WHERE conversation_id = $1 AND sender_id <> $2
         AND created_at > COALESCE($3::TIMESTAMPTZ, $4::TIMESTAMPTZ)`,
      [row.id, req.user.id, row.last_read_at, row.joined_at]
    );
    return {
      id: row.id,
      contact: {
        id: row.other_id,
        name: row.other_name,
        email: row.other_email,
        avatarUrl: row.other_avatar_mime ? `/api/users/${row.other_id}/avatar?v=${encodeURIComponent(row.other_updated_at || '')}` : ''
      },
      lastMessage: latest.rows[0] ? { body: latest.rows[0].body, createdAt: latest.rows[0].created_at } : null,
      unreadCount: Number(unread.rows[0]?.count || 0),
      updatedAt: row.updated_at
    };
  }));
  res.json({ data: conversations });
}));

router.post('/conversations', asyncHandler(async (req, res) => {
  const { userId, body } = parseInput(createConversationSchema, req.body);
  if (userId === req.user.id) throw new AppError(422, 'INVALID_CONTACT', 'Не можна створити діалог із собою.');
  const contact = await query(
    `SELECT users.id, users.name, users.email, users.avatar_mime, users.updated_at FROM users
     LEFT JOIN user_tool_access AS chat_access
       ON chat_access.user_id = users.id AND chat_access.tool_id = 'chat'
     WHERE users.id = $1 AND users.status = 'approved'
       AND (users.role = 'admin' OR chat_access.user_id IS NOT NULL)`,
    [userId]
  );
  if (!contact.rows[0]) throw new AppError(404, 'CONTACT_NOT_FOUND', 'Контакт недоступний у чаті.');
  const contactView = {
    id: contact.rows[0].id,
    name: contact.rows[0].name,
    email: contact.rows[0].email,
    avatarUrl: contact.rows[0].avatar_mime
      ? `/api/users/${contact.rows[0].id}/avatar?v=${encodeURIComponent(contact.rows[0].updated_at || '')}`
      : ''
  };
  const key = directConversationKey(req.user.id, userId);
  const allowedOrigins = getAllowedOrigins(req);
  const references = extractEntityReferences(body, allowedOrigins);
  const client = await pool.connect();
  let conversationId;
  let message;
  try {
    await client.query('BEGIN');
    const created = await client.query(
      `INSERT INTO chat_conversations (direct_key) VALUES ($1)
       ON CONFLICT (direct_key) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [key]
    );
    conversationId = created.rows[0].id;
    await client.query(
      `INSERT INTO chat_members (conversation_id, user_id, last_read_at)
       VALUES ($1, $2, NOW()), ($1, $3, NULL)
       ON CONFLICT (conversation_id, user_id) DO NOTHING`,
      [conversationId, req.user.id, userId]
    );
    const insertedMessage = await client.query(
      `INSERT INTO chat_messages (conversation_id, sender_id, body, entity_references)
       VALUES ($1, $2, $3, $4::JSONB)
       RETURNING *, $5::VARCHAR AS sender_name, $6::VARCHAR AS sender_email`,
      [conversationId, req.user.id, body, JSON.stringify(references), req.user.name, req.user.email]
    );
    message = insertedMessage.rows[0];
    await client.query(
      'UPDATE chat_members SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, req.user.id]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  const members = await loadConversationMembers(conversationId);
  publishChatUpdates(members, { type: 'message', conversationId, senderId: req.user.id });
  res.status(201).json({
    data: {
      id: conversationId,
      contact: contactView,
      message: await serializeChatMessage(message, req.user, allowedOrigins)
    }
  });
}));

router.get('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  if (!await assertConversationMember(id, req.user.id)) throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Діалог не знайдено.');
  const result = await query(
    `SELECT message.*, sender.name AS sender_name, sender.email AS sender_email,
            sender.avatar_mime AS sender_avatar_mime, sender.updated_at AS sender_updated_at,
            reply.body AS reply_body, reply.sender_id AS reply_sender_id,
            reply_sender.name AS reply_sender_name
     FROM chat_messages AS message
     JOIN users AS sender ON sender.id = message.sender_id
     LEFT JOIN chat_messages AS reply ON reply.id = message.reply_to_id
     LEFT JOIN users AS reply_sender ON reply_sender.id = reply.sender_id
     WHERE message.conversation_id = $1
     ORDER BY message.created_at DESC
     LIMIT 100`,
    [id]
  );
  const allowedOrigins = getAllowedOrigins(req);
  const messages = [];
  for (const row of [...result.rows].reverse()) messages.push(await serializeChatMessage(row, req.user, allowedOrigins));
  res.json({ data: messages });
}));

router.post('/conversations/:id/typing', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const { isTyping } = parseInput(typingSchema, req.body);
  if (!await assertConversationMember(id, req.user.id)) throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Діалог не знайдено.');
  const members = await loadConversationMembers(id);
  publishChatUpdates(members.filter((userId) => userId !== req.user.id), {
    type: 'typing',
    conversationId: id,
    senderId: req.user.id,
    isTyping
  });
  res.status(204).end();
}));

router.post('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const { body, replyToId } = parseInput(messageSchema, req.body);
  if (!await assertConversationMember(id, req.user.id)) throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Діалог не знайдено.');
  let reply = null;
  if (replyToId) {
    const replyResult = await query(
      `SELECT message.id, message.body, message.sender_id, sender.name AS sender_name
       FROM chat_messages AS message
       JOIN users AS sender ON sender.id = message.sender_id
       WHERE message.id = $1 AND message.conversation_id = $2`,
      [replyToId, id]
    );
    reply = replyResult.rows[0];
    if (!reply) throw new AppError(422, 'INVALID_REPLY_TARGET', 'Повідомлення для відповіді не знайдено в цьому діалозі.');
  }
  const allowedOrigins = getAllowedOrigins(req);
  const references = extractEntityReferences(body, allowedOrigins);
  const result = await query(
    `INSERT INTO chat_messages (conversation_id, sender_id, body, entity_references, reply_to_id)
     VALUES ($1, $2, $3, $4::JSONB, $5)
     RETURNING *, $6::VARCHAR AS sender_name, $7::VARCHAR AS sender_email`,
    [id, req.user.id, body, JSON.stringify(references), replyToId, req.user.name, req.user.email]
  );
  if (reply) Object.assign(result.rows[0], {
    reply_body: reply.body,
    reply_sender_id: reply.sender_id,
    reply_sender_name: reply.sender_name
  });
  await query('UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1', [id]);
  await query('UPDATE chat_members SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2', [id, req.user.id]);
  const members = await loadConversationMembers(id);
  publishChatUpdates(members, { type: 'message', conversationId: id, senderId: req.user.id });
  res.status(201).json({ data: await serializeChatMessage(result.rows[0], req.user, allowedOrigins) });
}));

router.post('/conversations/:id/read', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const result = await query(
    `UPDATE chat_members SET last_read_at = NOW()
     WHERE conversation_id = $1 AND user_id = $2 RETURNING conversation_id`,
    [id, req.user.id]
  );
  if (!result.rows[0]) throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Діалог не знайдено.');
  res.status(204).end();
}));

export default router;
