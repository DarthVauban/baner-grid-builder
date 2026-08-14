import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { publishSupportChatUpdate, subscribeToSupportVisitorUpdates } from './support-chat.events.js';
import {
  createSupportSessionToken,
  hashSupportSessionToken,
  loadSupportSite,
  loadSupportVisitorByToken,
  normalizeSupportOrigin,
  normalizeSupportPageUrl,
  serializeSupportMessage,
  serializeSupportSettings,
  serializeSupportVisitor,
  supportWidgetEmbedScript
} from './support-chat.service.js';

const router = Router();

const publicLimiter = rateLimit({
  windowMs: 60_000,
  limit: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'SUPPORT_RATE_LIMITED', message: 'Забагато запитів до чату. Спробуйте трохи пізніше.' } }
});
const messageLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'SUPPORT_MESSAGE_RATE_LIMITED', message: 'Повідомлення надсилаються надто часто. Зачекайте хвилину.' } }
});
router.use(publicLimiter);

const sessionSchema = z.object({
  siteId: z.union([z.string().uuid(), z.literal('')]).optional().default(''),
  visitorToken: z.string().trim().max(200).optional().default(''),
  embedOrigin: z.string().trim().max(500).optional().default(''),
  pageUrl: z.string().trim().max(4000).optional().default(''),
  pageTitle: z.string().trim().max(500).optional().default('')
});
const messageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  clientMessageId: z.string().uuid(),
  pageUrl: z.string().trim().max(4000).optional().default(''),
  pageTitle: z.string().trim().max(500).optional().default('')
});
const contactSchema = z.object({
  email: z.union([z.string().trim().email().max(320), z.literal('')]).default(''),
  phone: z.string().trim().max(40).default('')
}).refine((value) => value.email || value.phone, {
  message: 'Вкажіть email або телефон.'
});

function bearerToken(req) {
  const value = String(req.get('authorization') || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function requestOrigin(req) {
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  try { return new URL(`${forwardedProto}://${host}`).origin; } catch { return ''; }
}

function settingsFromVisitor(visitor) {
  return serializeSupportSettings({
    id: visitor.site_id,
    public_id: visitor.public_id,
    name: visitor.site_name,
    enabled: visitor.enabled,
    allowed_origins: visitor.allowed_origins,
    accent_color: visitor.accent_color,
    welcome_text: visitor.welcome_text,
    auto_reply_text: visitor.auto_reply_text,
    contact_form_enabled: visitor.contact_form_enabled,
    contact_form_prompt: visitor.contact_form_prompt,
    updated_at: visitor.site_updated_at
  });
}

async function loadPublicConversation(visitorId) {
  const conversationResult = await query(
    `SELECT * FROM support_chat_conversations WHERE visitor_id = $1 LIMIT 1`,
    [visitorId]
  );
  const conversation = conversationResult.rows[0];
  if (!conversation) return null;
  const messages = await query(
    `SELECT message.*, users.name AS sender_name
     FROM support_chat_messages AS message
     LEFT JOIN users ON users.id = message.sender_user_id
     WHERE message.conversation_id = $1
     ORDER BY message.created_at, message.id
     LIMIT 300`,
    [conversation.id]
  );
  return {
    id: conversation.id,
    status: conversation.status,
    messages: messages.rows.map(serializeSupportMessage),
    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at
  };
}

async function publicSessionPayload(visitor, token) {
  return {
    token,
    settings: settingsFromVisitor(visitor),
    visitor: serializeSupportVisitor(visitor),
    conversation: await loadPublicConversation(visitor.id)
  };
}

router.post('/session', asyncHandler(async (req, res) => {
  const input = parseInput(sessionSchema, req.body);
  const site = await loadSupportSite(input.siteId, { requireEnabled: true });
  const embedOrigin = normalizeSupportOrigin(input.embedOrigin);
  const allowedOrigins = Array.isArray(site.allowed_origins) ? site.allowed_origins : [];
  const nativeOrigin = requestOrigin(req);
  if (allowedOrigins.length && embedOrigin !== nativeOrigin && (!embedOrigin || !allowedOrigins.includes(embedOrigin))) {
    throw new AppError(403, 'SUPPORT_ORIGIN_DENIED', 'Цей сайт не має доступу до віджета онлайн-підтримки.');
  }
  const pageUrl = normalizeSupportPageUrl(input.pageUrl);
  let token = input.visitorToken;
  let visitor = null;
  if (token) {
    try {
      visitor = await loadSupportVisitorByToken(token);
      if (visitor.site_id !== site.id) visitor = null;
    } catch {
      visitor = null;
    }
  }
  if (!visitor) {
    token = createSupportSessionToken();
    const created = await query(
      `INSERT INTO support_chat_visitors (
         site_id, session_token_hash, first_page_url, last_page_url, last_page_title
       ) VALUES ($1, $2, $3, $3, $4)
       RETURNING *`,
      [site.id, hashSupportSessionToken(token), pageUrl, input.pageTitle]
    );
    visitor = {
      ...created.rows[0],
      public_id: site.public_id,
      site_name: site.name,
      enabled: site.enabled,
      allowed_origins: site.allowed_origins,
      accent_color: site.accent_color,
      welcome_text: site.welcome_text,
      auto_reply_text: site.auto_reply_text,
      contact_form_enabled: site.contact_form_enabled,
      contact_form_prompt: site.contact_form_prompt,
      site_updated_at: site.updated_at
    };
  } else {
    const updated = await query(
      `UPDATE support_chat_visitors
       SET last_page_url = CASE WHEN $1 = '' THEN last_page_url ELSE $1 END,
           last_page_title = CASE WHEN $2 = '' THEN last_page_title ELSE $2 END,
           last_seen_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [pageUrl, input.pageTitle, visitor.id]
    );
    visitor = { ...visitor, ...updated.rows[0] };
  }
  res.json({ data: await publicSessionPayload(visitor, token) });
}));

router.get('/session', asyncHandler(async (req, res) => {
  const token = bearerToken(req);
  const visitor = await loadSupportVisitorByToken(token);
  await query('UPDATE support_chat_visitors SET last_seen_at = NOW() WHERE id = $1', [visitor.id]);
  res.json({ data: await publicSessionPayload(visitor, token) });
}));

router.post('/messages', messageLimiter, asyncHandler(async (req, res) => {
  const input = parseInput(messageSchema, req.body);
  const visitor = await loadSupportVisitorByToken(bearerToken(req));
  const pageUrl = normalizeSupportPageUrl(input.pageUrl);
  const client = await pool.connect();
  let conversationId;
  try {
    await client.query('BEGIN');
    const conversationResult = await client.query(
      `INSERT INTO support_chat_conversations (site_id, visitor_id)
       VALUES ($1, $2)
       ON CONFLICT (site_id, visitor_id)
       DO UPDATE SET
         status = CASE
           WHEN support_chat_conversations.status IN ('RESOLVED', 'CLOSED') THEN 'NEW'
           WHEN support_chat_conversations.status = 'WAITING_CUSTOMER' THEN 'OPEN'
           ELSE support_chat_conversations.status
         END,
         resolved_at = NULL,
         closed_at = NULL,
         updated_at = NOW()
       RETURNING *`,
      [visitor.site_id, visitor.id]
    );
    const conversation = conversationResult.rows[0];
    conversationId = conversation.id;
    const inserted = await client.query(
      `INSERT INTO support_chat_messages (
         conversation_id, sender_type, body, client_message_id
       ) VALUES ($1, 'visitor', $2, $3)
       ON CONFLICT (conversation_id, client_message_id) DO NOTHING
       RETURNING id`,
      [conversationId, input.body, input.clientMessageId]
    );
    if (inserted.rows[0] && !conversation.auto_reply_sent_at) {
      const claimedReply = await client.query(
        `UPDATE support_chat_conversations
         SET auto_reply_sent_at = NOW()
         WHERE id = $1 AND auto_reply_sent_at IS NULL
         RETURNING id`,
        [conversationId]
      );
      if (claimedReply.rows[0]) {
        await client.query(
          `INSERT INTO support_chat_messages (conversation_id, sender_type, body)
           VALUES ($1, 'system', $2)`,
          [conversationId, visitor.auto_reply_text]
        );
      }
    }
    await client.query(
      `UPDATE support_chat_visitors
       SET last_page_url = CASE WHEN $1 = '' THEN last_page_url ELSE $1 END,
           last_page_title = CASE WHEN $2 = '' THEN last_page_title ELSE $2 END,
           last_seen_at = NOW()
       WHERE id = $3`,
      [pageUrl, input.pageTitle, visitor.id]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  publishSupportChatUpdate({ type: 'message', conversationId, visitorId: visitor.id, senderType: 'visitor' });
  res.status(201).json({ data: await loadPublicConversation(visitor.id) });
}));

router.put('/contact', asyncHandler(async (req, res) => {
  const input = parseInput(contactSchema, req.body);
  const visitor = await loadSupportVisitorByToken(bearerToken(req));
  const updated = await query(
    `UPDATE support_chat_visitors
     SET email = $1, phone = $2, last_seen_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [input.email || null, input.phone || null, visitor.id]
  );
  const conversation = await query('SELECT id FROM support_chat_conversations WHERE visitor_id = $1', [visitor.id]);
  if (conversation.rows[0]) {
    await query(
      `INSERT INTO support_chat_events (conversation_id, event_type, payload)
       VALUES ($1, 'CONTACT_UPDATED', $2::JSONB)`,
      [conversation.rows[0].id, JSON.stringify({ hasEmail: Boolean(input.email), hasPhone: Boolean(input.phone) })]
    );
    publishSupportChatUpdate({ type: 'contact', conversationId: conversation.rows[0].id, visitorId: visitor.id });
  }
  res.json({ data: serializeSupportVisitor(updated.rows[0]) });
}));

router.post('/read', asyncHandler(async (req, res) => {
  const visitor = await loadSupportVisitorByToken(bearerToken(req));
  await query(
    `UPDATE support_chat_conversations SET visitor_last_read_at = NOW()
     WHERE visitor_id = $1`,
    [visitor.id]
  );
  res.status(204).end();
}));

router.get('/stream', asyncHandler(async (req, res) => {
  const visitor = await loadSupportVisitorByToken(bearerToken(req));
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (payload) => res.write(`event: support\ndata: ${JSON.stringify(payload)}\n\n`);
  const unsubscribe = subscribeToSupportVisitorUpdates(visitor.id, send);
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
  heartbeat.unref();
  res.write('event: connected\ndata: {}\n\n');
  req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
}));

router.get('/embed.js', asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('application/javascript').send(supportWidgetEmbedScript(requestOrigin(req)));
}));

export default router;
