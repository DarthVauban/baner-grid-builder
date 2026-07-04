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
const createConversationSchema = z.object({ userId: z.string().uuid() });
const messageSchema = z.object({ body: z.string().trim().min(1).max(5000) });

router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const sendUpdate = () => res.write('event: chat\ndata: {}\n\n');
  const unsubscribe = subscribeToChatUpdates(req.user.id, sendUpdate);
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
  heartbeat.unref();
  res.write('event: connected\ndata: {}\n\n');
  req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
});

router.get('/contacts', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT users.id, users.name, users.email
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
  res.json({ data: result.rows });
}));

router.get('/conversations', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT conversation.id, conversation.updated_at,
            other_user.id AS other_id, other_user.name AS other_name, other_user.email AS other_email,
            member.last_read_at, member.joined_at
     FROM chat_conversations AS conversation
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
      contact: { id: row.other_id, name: row.other_name, email: row.other_email },
      lastMessage: latest.rows[0] ? { body: latest.rows[0].body, createdAt: latest.rows[0].created_at } : null,
      unreadCount: Number(unread.rows[0]?.count || 0),
      updatedAt: row.updated_at
    };
  }));
  res.json({ data: conversations });
}));

router.post('/conversations', asyncHandler(async (req, res) => {
  const { userId } = parseInput(createConversationSchema, req.body);
  if (userId === req.user.id) throw new AppError(422, 'INVALID_CONTACT', 'Не можна створити діалог із собою.');
  const contact = await query(
    `SELECT users.id, users.name, users.email FROM users
     LEFT JOIN user_tool_access AS chat_access
       ON chat_access.user_id = users.id AND chat_access.tool_id = 'chat'
     WHERE users.id = $1 AND users.status = 'approved'
       AND (users.role = 'admin' OR chat_access.user_id IS NOT NULL)`,
    [userId]
  );
  if (!contact.rows[0]) throw new AppError(404, 'CONTACT_NOT_FOUND', 'Контакт недоступний у чаті.');
  const key = directConversationKey(req.user.id, userId);
  const client = await pool.connect();
  let conversationId;
  try {
    await client.query('BEGIN');
    const created = await client.query(
      `INSERT INTO chat_conversations (direct_key) VALUES ($1)
       ON CONFLICT (direct_key) DO UPDATE SET direct_key = EXCLUDED.direct_key
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
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  res.status(201).json({ data: { id: conversationId, contact: contact.rows[0] } });
}));

router.get('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  if (!await assertConversationMember(id, req.user.id)) throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Діалог не знайдено.');
  const result = await query(
    `SELECT message.*, sender.name AS sender_name, sender.email AS sender_email
     FROM chat_messages AS message
     JOIN users AS sender ON sender.id = message.sender_id
     WHERE message.conversation_id = $1
     ORDER BY message.created_at DESC
     LIMIT 100`,
    [id]
  );
  const messages = [];
  for (const row of [...result.rows].reverse()) messages.push(await serializeChatMessage(row, req.user));
  res.json({ data: messages });
}));

router.post('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const { body } = parseInput(messageSchema, req.body);
  if (!await assertConversationMember(id, req.user.id)) throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Діалог не знайдено.');
  const allowedOrigin = new URL(env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`).origin;
  const references = extractEntityReferences(body, allowedOrigin);
  const result = await query(
    `INSERT INTO chat_messages (conversation_id, sender_id, body, entity_references)
     VALUES ($1, $2, $3, $4::JSONB)
     RETURNING *, $5::VARCHAR AS sender_name, $6::VARCHAR AS sender_email`,
    [id, req.user.id, body, JSON.stringify(references), req.user.name, req.user.email]
  );
  await query('UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1', [id]);
  await query('UPDATE chat_members SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2', [id, req.user.id]);
  const members = await loadConversationMembers(id);
  publishChatUpdates(members);
  res.status(201).json({ data: await serializeChatMessage(result.rows[0], req.user) });
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
