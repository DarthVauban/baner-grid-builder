import { Router } from 'express';
import { randomUUID } from 'node:crypto';
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
  loadMessageReactions,
  serializeChatMessage
} from './chat.service.js';

const router = Router();
router.use(requireAuth, requireToolAccess('chat'));

const idSchema = z.string().uuid();
const createConversationSchema = z.object({
  userId: z.string().uuid(),
  body: z.string().trim().min(1).max(5000)
});
const createGroupSchema = z.object({
  title: z.string().trim().min(2).max(120),
  participantIds: z.array(z.string().uuid()).min(2).max(99)
}).transform((input) => ({ ...input, participantIds: [...new Set(input.participantIds)] })).refine(
  (input) => input.participantIds.length >= 2,
  { path: ['participantIds'], message: 'Оберіть щонайменше двох учасників.' }
);
const messageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  replyToId: z.string().uuid().nullable().optional().default(null)
});
const reactionSchema = z.object({
  emoji: z.enum(['👍', '❤️', '😂', '😮', '😢', '🎉']).nullable()
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
    `SELECT conversation.id, conversation.conversation_type, conversation.title,
            conversation.created_by, conversation.updated_at,
            member.last_read_at, member.joined_at
     FROM chat_conversations AS conversation
     JOIN chat_members AS member ON member.conversation_id = conversation.id AND member.user_id = $1
     LEFT JOIN (SELECT DISTINCT conversation_id FROM chat_messages) AS populated
       ON populated.conversation_id = conversation.id
     WHERE conversation.conversation_type = 'group'
        OR populated.conversation_id IS NOT NULL
     ORDER BY conversation.updated_at DESC
     LIMIT 200`,
    [req.user.id]
  );
  const conversationIds = result.rows.map((row) => row.id);
  const membersByConversation = new Map(conversationIds.map((id) => [id, []]));
  if (conversationIds.length) {
    const placeholders = conversationIds.map((_, index) => `$${index + 1}`).join(', ');
    const membersResult = await query(
      `SELECT member.conversation_id, users.id, users.name, users.email, users.avatar_mime, users.updated_at
       FROM chat_members AS member
       JOIN users ON users.id = member.user_id
       WHERE member.conversation_id IN (${placeholders})
       ORDER BY lower(users.name), users.id`,
      conversationIds
    );
    for (const member of membersResult.rows) membersByConversation.get(member.conversation_id)?.push({
      id: member.id,
      name: member.name,
      email: member.email,
      avatarUrl: member.avatar_mime ? `/api/users/${member.id}/avatar?v=${encodeURIComponent(member.updated_at || '')}` : ''
    });
  }
  const conversations = await Promise.all(result.rows.map(async (row) => {
    const members = membersByConversation.get(row.id) || [];
    const contact = row.conversation_type === 'direct'
      ? members.find((member) => member.id !== req.user.id) || null
      : null;
    const latest = await query(
      `SELECT message.body, message.created_at, sender.name AS sender_name
       FROM chat_messages AS message
       JOIN users AS sender ON sender.id = message.sender_id
       WHERE message.conversation_id = $1 ORDER BY message.created_at DESC LIMIT 1`,
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
      type: row.conversation_type,
      title: row.conversation_type === 'group' ? row.title : contact?.name || 'Недоступний контакт',
      contact,
      members,
      createdBy: row.created_by,
      lastMessage: latest.rows[0] ? {
        body: latest.rows[0].body,
        senderName: latest.rows[0].sender_name,
        createdAt: latest.rows[0].created_at
      } : null,
      unreadCount: Number(unread.rows[0]?.count || 0),
      updatedAt: row.updated_at
    };
  }));
  res.json({ data: conversations });
}));

router.post('/conversations/groups', asyncHandler(async (req, res) => {
  const { title, participantIds } = parseInput(createGroupSchema, req.body);
  if (participantIds.includes(req.user.id)) throw new AppError(422, 'INVALID_GROUP_MEMBERS', 'Не додавайте себе до списку учасників.');
  const placeholders = participantIds.map((_, index) => `$${index + 1}`).join(', ');
  const contacts = await query(
    `SELECT users.id, users.name, users.email, users.avatar_mime, users.updated_at
     FROM users
     LEFT JOIN user_tool_access AS chat_access
       ON chat_access.user_id = users.id AND chat_access.tool_id = 'chat'
     WHERE users.id IN (${placeholders}) AND users.status = 'approved'
       AND (users.role = 'admin' OR chat_access.user_id IS NOT NULL)
     ORDER BY lower(users.name), users.id`,
    participantIds
  );
  if (contacts.rows.length !== participantIds.length) throw new AppError(422, 'INVALID_GROUP_MEMBERS', 'Один або кілька учасників недоступні у чаті.');

  const client = await pool.connect();
  let conversationId;
  try {
    await client.query('BEGIN');
    const created = await client.query(
      `INSERT INTO chat_conversations (direct_key, conversation_type, title, created_by)
       VALUES ($1, 'group', $2, $3) RETURNING id`,
      [`group:${randomUUID()}`, title, req.user.id]
    );
    conversationId = created.rows[0].id;
    await client.query(
      `INSERT INTO chat_members (conversation_id, user_id, last_read_at)
       VALUES ($1, $2, NOW())`,
      [conversationId, req.user.id]
    );
    for (const participantId of participantIds) {
      await client.query(
        `INSERT INTO chat_members (conversation_id, user_id, last_read_at)
         VALUES ($1, $2, NULL)`,
        [conversationId, participantId]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }

  const members = [
    { id: req.user.id, name: req.user.name, email: req.user.email, avatarUrl: req.user.avatarUrl || '' },
    ...contacts.rows.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      avatarUrl: member.avatar_mime ? `/api/users/${member.id}/avatar?v=${encodeURIComponent(member.updated_at || '')}` : ''
    }))
  ];
  publishChatUpdates(members.map((member) => member.id), { type: 'conversation', conversationId, senderId: req.user.id });
  res.status(201).json({ data: {
    id: conversationId,
    type: 'group',
    title,
    contact: null,
    members,
    createdBy: req.user.id,
    lastMessage: null,
    unreadCount: 0,
    updatedAt: new Date().toISOString()
  } });
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
  const reactions = await loadMessageReactions(result.rows.map((row) => row.id), req.user.id);
  const messages = [];
  for (const row of [...result.rows].reverse()) {
    row.reactions = reactions.get(row.id) || [];
    messages.push(await serializeChatMessage(row, req.user, allowedOrigins));
  }
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
    senderName: req.user.name,
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

router.put('/messages/:id/reaction', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const { emoji } = parseInput(reactionSchema, req.body);
  const message = await query(
    `SELECT message.conversation_id
     FROM chat_messages AS message
     JOIN chat_members AS member ON member.conversation_id = message.conversation_id
     WHERE message.id = $1 AND member.user_id = $2`,
    [id, req.user.id]
  );
  if (!message.rows[0]) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Повідомлення не знайдено.');
  if (emoji === null) {
    await query('DELETE FROM chat_message_reactions WHERE message_id = $1 AND user_id = $2', [id, req.user.id]);
  } else {
    await query(
      `INSERT INTO chat_message_reactions (message_id, user_id, emoji)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = NOW()`,
      [id, req.user.id, emoji]
    );
  }
  const reactions = await loadMessageReactions([id], req.user.id);
  const conversationId = message.rows[0].conversation_id;
  const members = await loadConversationMembers(conversationId);
  publishChatUpdates(members, { type: 'reaction', conversationId, messageId: id, senderId: req.user.id });
  res.json({ data: reactions.get(id) || [] });
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
