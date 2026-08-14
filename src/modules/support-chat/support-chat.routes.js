import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import { publishSupportChatUpdate, subscribeToSupportOperatorUpdates } from './support-chat.events.js';
import {
  loadSupportSite,
  normalizeSupportOrigin,
  serializeSupportConversation,
  serializeSupportMessage,
  serializeSupportSettings,
  supportChatToolId
} from './support-chat.service.js';

const router = Router();
router.use(requireAuth, requireToolAccess(supportChatToolId));

const idSchema = z.string().uuid();
const conversationStatusSchema = z.object({
  status: z.enum(['NEW', 'OPEN', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'])
});
const operatorMessageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  clientMessageId: z.string().uuid()
});
const customerSchema = z.object({
  name: z.string().trim().max(160).default(''),
  email: z.union([z.string().trim().email().max(320), z.literal('')]).default(''),
  phone: z.string().trim().max(40).default('')
});
const settingsSchema = z.object({
  name: z.string().trim().min(1).max(160),
  enabled: z.boolean(),
  allowedOrigins: z.array(z.string().trim().max(500)).max(50).transform((values) => (
    [...new Set(values.map(normalizeSupportOrigin).filter(Boolean))]
  )),
  accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/),
  welcomeText: z.string().trim().min(1).max(500),
  autoReplyText: z.string().trim().min(1).max(1000),
  contactFormEnabled: z.boolean(),
  contactFormPrompt: z.string().trim().min(1).max(500)
});

async function loadConversationRow(id) {
  const result = await query(
    `SELECT conversation.*,
            visitor.id AS visitor_id, visitor.name, visitor.email, visitor.phone,
            visitor.first_page_url, visitor.last_page_url, visitor.last_page_title,
            visitor.created_at AS visitor_created_at, visitor.last_seen_at,
            assignee.name AS assigned_user_name
     FROM support_chat_conversations AS conversation
     JOIN support_chat_visitors AS visitor ON visitor.id = conversation.visitor_id
     LEFT JOIN users AS assignee ON assignee.id = conversation.assigned_user_id
     WHERE conversation.id = $1`,
    [id]
  );
  if (!result.rows[0]) throw new AppError(404, 'SUPPORT_CONVERSATION_NOT_FOUND', 'Діалог онлайн-підтримки не знайдено.');
  return result.rows[0];
}

async function loadConversationMessages(id) {
  const result = await query(
    `SELECT message.*, users.name AS sender_name
     FROM support_chat_messages AS message
     LEFT JOIN users ON users.id = message.sender_user_id
     WHERE message.conversation_id = $1
     ORDER BY message.created_at, message.id
     LIMIT 500`,
    [id]
  );
  return result.rows.map(serializeSupportMessage);
}

router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (payload) => res.write(`event: support\ndata: ${JSON.stringify(payload)}\n\n`);
  const unsubscribe = subscribeToSupportOperatorUpdates(send);
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
  heartbeat.unref();
  res.write('event: connected\ndata: {}\n\n');
  req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
});

router.get('/settings', asyncHandler(async (req, res) => {
  const site = await loadSupportSite('', { requireEnabled: false });
  res.json({ data: serializeSupportSettings(site) });
}));

router.put('/settings', asyncHandler(async (req, res) => {
  const input = parseInput(settingsSchema, req.body);
  const current = await loadSupportSite('', { requireEnabled: false });
  const result = await query(
    `UPDATE support_chat_sites
     SET name = $1, enabled = $2, allowed_origins = $3::JSONB,
         accent_color = $4, welcome_text = $5, auto_reply_text = $6,
         contact_form_enabled = $7, contact_form_prompt = $8,
         updated_by = $9, updated_at = NOW()
     WHERE id = $10
     RETURNING *`,
    [
      input.name,
      input.enabled,
      JSON.stringify(input.allowedOrigins),
      input.accentColor,
      input.welcomeText,
      input.autoReplyText,
      input.contactFormEnabled,
      input.contactFormPrompt,
      req.user.id,
      current.id
    ]
  );
  publishSupportChatUpdate({ type: 'settings' });
  res.json({ data: serializeSupportSettings(result.rows[0]) });
}));

router.get('/unread-count', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT COUNT(*)::INTEGER AS count
     FROM support_chat_messages AS message
     JOIN support_chat_conversations AS conversation ON conversation.id = message.conversation_id
     WHERE message.sender_type = 'visitor'
       AND (conversation.operator_last_read_at IS NULL OR message.created_at > conversation.operator_last_read_at)
       AND conversation.status <> 'CLOSED'`
  );
  res.json({ data: Number(result.rows[0]?.count || 0) });
}));

router.get('/conversations', asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim().slice(0, 160);
  const status = String(req.query.status || '').toUpperCase();
  const allowedStatuses = ['NEW', 'OPEN', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'];
  const rows = await query(
    `SELECT conversation.*,
            visitor.id AS visitor_id, visitor.name, visitor.email, visitor.phone,
            visitor.first_page_url, visitor.last_page_url, visitor.last_page_title,
            visitor.created_at AS visitor_created_at, visitor.last_seen_at,
            assignee.name AS assigned_user_name
     FROM support_chat_conversations AS conversation
     JOIN support_chat_visitors AS visitor ON visitor.id = conversation.visitor_id
     LEFT JOIN users AS assignee ON assignee.id = conversation.assigned_user_id
     WHERE ($1 = '' OR conversation.status = $1)
       AND ($2 = '' OR COALESCE(visitor.name, '') ILIKE '%' || $2 || '%'
         OR COALESCE(visitor.email, '') ILIKE '%' || $2 || '%'
         OR COALESCE(visitor.phone, '') ILIKE '%' || $2 || '%'
         OR visitor.last_page_title ILIKE '%' || $2 || '%')
     ORDER BY conversation.updated_at DESC
     LIMIT 250`,
    [allowedStatuses.includes(status) ? status : '', search]
  );
  const conversations = [];
  for (const row of rows.rows) {
    const latest = await query(
      `SELECT body, sender_type, created_at
       FROM support_chat_messages WHERE conversation_id = $1
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [row.id]
    );
    const unread = await query(
      `SELECT COUNT(*)::INTEGER AS count
       FROM support_chat_messages
       WHERE conversation_id = $1 AND sender_type = 'visitor'
         AND ($2::TIMESTAMPTZ IS NULL OR created_at > $2::TIMESTAMPTZ)`,
      [row.id, row.operator_last_read_at]
    );
    const last = latest.rows[0];
    conversations.push(serializeSupportConversation({
      ...row,
      last_message_body: last?.body,
      last_message_sender_type: last?.sender_type,
      last_message_created_at: last?.created_at,
      unread_count: unread.rows[0]?.count
    }));
  }
  res.json({ data: conversations });
}));

router.get('/conversations/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const row = await loadConversationRow(id);
  res.json({ data: {
    conversation: serializeSupportConversation(row),
    messages: await loadConversationMessages(id)
  } });
}));

router.post('/conversations/:id/read', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const updated = await query(
    `UPDATE support_chat_conversations SET operator_last_read_at = NOW()
     WHERE id = $1 RETURNING id, visitor_id`,
    [id]
  );
  if (!updated.rows[0]) throw new AppError(404, 'SUPPORT_CONVERSATION_NOT_FOUND', 'Діалог онлайн-підтримки не знайдено.');
  res.status(204).end();
}));

router.post('/conversations/:id/claim', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const updated = await query(
    `UPDATE support_chat_conversations
     SET assigned_user_id = $1,
         status = CASE WHEN status = 'NEW' THEN 'OPEN' ELSE status END,
         updated_at = NOW()
     WHERE id = $2 AND (assigned_user_id IS NULL OR assigned_user_id = $1)
     RETURNING id, visitor_id`,
    [req.user.id, id]
  );
  if (!updated.rows[0]) {
    const exists = await query('SELECT id FROM support_chat_conversations WHERE id = $1', [id]);
    if (!exists.rows[0]) throw new AppError(404, 'SUPPORT_CONVERSATION_NOT_FOUND', 'Діалог онлайн-підтримки не знайдено.');
    throw new AppError(409, 'SUPPORT_CONVERSATION_ALREADY_ASSIGNED', 'Цей діалог уже взяв у роботу інший оператор.');
  }
  await query(
    `INSERT INTO support_chat_events (conversation_id, actor_user_id, event_type, payload)
     VALUES ($1, $2, 'ASSIGNED', $3::JSONB)`,
    [id, req.user.id, JSON.stringify({ assignedUserId: req.user.id })]
  );
  publishSupportChatUpdate({ type: 'conversation', conversationId: id, visitorId: updated.rows[0].visitor_id });
  res.json({ data: serializeSupportConversation(await loadConversationRow(id)) });
}));

router.patch('/conversations/:id/customer', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(customerSchema, req.body);
  const conversation = await loadConversationRow(id);
  await query(
    `UPDATE support_chat_visitors
     SET name = $1, email = $2, phone = $3
     WHERE id = $4`,
    [input.name || null, input.email || null, input.phone || null, conversation.visitor_id]
  );
  await query(
    `INSERT INTO support_chat_events (conversation_id, actor_user_id, event_type, payload)
     VALUES ($1, $2, 'CONTACT_UPDATED', $3::JSONB)`,
    [id, req.user.id, JSON.stringify({ source: 'operator', hasName: Boolean(input.name), hasEmail: Boolean(input.email), hasPhone: Boolean(input.phone) })]
  );
  publishSupportChatUpdate({ type: 'contact', conversationId: id, visitorId: conversation.visitor_id });
  res.json({ data: serializeSupportConversation(await loadConversationRow(id)) });
}));

router.patch('/conversations/:id/status', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const { status } = parseInput(conversationStatusSchema, req.body);
  const updated = await query(
    `UPDATE support_chat_conversations
     SET status = $1,
         resolved_at = CASE WHEN $1 = 'RESOLVED' THEN NOW() ELSE NULL END,
         closed_at = CASE WHEN $1 = 'CLOSED' THEN NOW() ELSE NULL END,
         updated_at = NOW()
     WHERE id = $2
     RETURNING id, visitor_id`,
    [status, id]
  );
  if (!updated.rows[0]) throw new AppError(404, 'SUPPORT_CONVERSATION_NOT_FOUND', 'Діалог онлайн-підтримки не знайдено.');
  await query(
    `INSERT INTO support_chat_events (conversation_id, actor_user_id, event_type, payload)
     VALUES ($1, $2, 'STATUS_CHANGED', $3::JSONB)`,
    [id, req.user.id, JSON.stringify({ status })]
  );
  publishSupportChatUpdate({ type: 'conversation', conversationId: id, visitorId: updated.rows[0].visitor_id });
  res.json({ data: serializeSupportConversation(await loadConversationRow(id)) });
}));

router.post('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(operatorMessageSchema, req.body);
  const conversation = await loadConversationRow(id);
  const inserted = await query(
    `INSERT INTO support_chat_messages (
       conversation_id, sender_type, sender_user_id, body, client_message_id
     ) VALUES ($1, 'operator', $2, $3, $4)
     ON CONFLICT (conversation_id, client_message_id) DO UPDATE SET body = support_chat_messages.body
     RETURNING *`,
    [id, req.user.id, input.body, input.clientMessageId]
  );
  await query(
    `UPDATE support_chat_conversations
     SET assigned_user_id = COALESCE(assigned_user_id, $1),
         status = 'WAITING_CUSTOMER',
         first_response_at = COALESCE(first_response_at, NOW()),
         operator_last_read_at = NOW(),
         updated_at = NOW()
     WHERE id = $2`,
    [req.user.id, id]
  );
  publishSupportChatUpdate({ type: 'message', conversationId: id, visitorId: conversation.visitor_id, senderType: 'operator', senderId: req.user.id });
  res.status(201).json({ data: serializeSupportMessage({ ...inserted.rows[0], sender_name: req.user.name }) });
}));

export default router;
