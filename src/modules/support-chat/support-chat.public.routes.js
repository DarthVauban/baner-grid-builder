import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env.js';
import { z } from 'zod';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { publishSupportChatUpdate, subscribeToSupportVisitorUpdates } from './support-chat.events.js';
import { lockSupportConversation, nextSupportMessageSequence } from './support-chat.sequence.js';
import { enqueueSupportMessagePush } from './support-chat.notifications.js';
import {
  filterRepeatedPageReferences,
  hydrateSupportProductCards,
  resolveSupportProductReferences
} from './support-chat.products.js';
import {
  createSupportSessionToken,
  hashSupportSessionToken,
  isWithinSupportWorkingHours,
  loadSupportSite,
  loadSupportVisitorByToken,
  normalizeSupportOrigin,
  normalizeSupportPageUrl,
  serializeSupportMessage,
  serializeSupportSettings,
  serializeSupportVisitor,
  supportWidgetEmbedScript,
  supportSessionLifetimeMs
} from './support-chat.service.js';

const router = Router();

router.use((req, res, next) => {
  if (req.path !== '/embed.js') res.setHeader('Cache-Control', 'no-store');
  next();
});

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

const siteSchema = z.union([z.string().uuid(), z.literal('')]);
const sessionSchema = z.object({
  siteId: siteSchema.optional().default(''),
  transport: z.enum(['cookie', 'bearer']).default('bearer'),
  visitorToken: z.string().trim().max(200).optional().default(''),
  embedOrigin: z.string().trim().max(500).optional().default(''),
  pageUrl: z.string().trim().max(4000).optional().default('')
});
const messageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  clientMessageId: z.string().uuid(),
  pageUrl: z.string().trim().max(4000).optional().default('')
});
const contactSchema = z.object({
  name: z.string().trim().max(160).default(''),
  email: z.union([z.string().trim().email().max(320), z.literal('')]).default(''),
  phone: z.string().trim().max(40).default('')
}).refine((value) => value.name || value.email || value.phone, {
  message: 'Вкажіть ім’я, email або телефон.'
});

function bearerToken(req) {
  const value = String(req.get('authorization') || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function requireSameOrigin(req) {
  const origin = req.get('origin');
  const fetchSite = req.get('sec-fetch-site');
  const apiOrigin = requestOrigin(req);
  if ((origin && origin !== apiOrigin) || (fetchSite && fetchSite !== 'same-origin')) {
    throw new AppError(403, 'SUPPORT_ORIGIN_DENIED', 'Запит до сесії чату дозволено лише з віджета.');
  }
}

function supportCookie(req, key) {
  const secure = req.secure || env.isProduction;
  return {
    name: `${secure ? '__Host-' : ''}mt-support-${key.toLowerCase()}`,
    options: {
      httpOnly: true,
      secure,
      sameSite: secure ? 'none' : 'lax',
      partitioned: secure,
      path: secure ? '/' : '/api/public/support-chat'
    }
  };
}

function visitorCredential(req) {
  const token = bearerToken(req);
  if (token) return { token, transport: 'bearer' };
  requireSameOrigin(req);
  const siteId = parseInput(siteSchema, req.get('x-support-chat-site') || '');
  const cookie = supportCookie(req, siteId || 'default');
  return { token: req.cookies?.[cookie.name], transport: 'cookie' };
}

async function authenticatedVisitor(req) {
  const { token, transport } = visitorCredential(req);
  return loadSupportVisitorByToken(token, transport);
}

function requestOrigin(req) {
  const host = req.get('host');
  return host ? normalizeSupportOrigin(`${req.protocol}://${host}`) : '';
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
    working_hours_enabled: visitor.working_hours_enabled,
    working_hours_timezone: visitor.working_hours_timezone,
    working_hours_schedule: visitor.working_hours_schedule,
    offline_reply_text: visitor.offline_reply_text,
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
      ORDER BY message.message_sequence DESC NULLS LAST, message.created_at DESC, message.id DESC
     LIMIT 300`,
    [conversation.id]
  );
  const hydratedMessages = await hydrateSupportProductCards(messages.rows.reverse());
  return {
    id: conversation.id,
    status: conversation.status,
    messages: hydratedMessages.map(serializeSupportMessage),
    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at
  };
}

async function publicSessionPayload(visitor) {
  return {
    settings: settingsFromVisitor(visitor),
    visitor: serializeSupportVisitor(visitor),
    conversation: await loadPublicConversation(visitor.id)
  };
}

router.get('/session/transport', (req, res) => {
  requireSameOrigin(req);
  const probe = supportCookie(req, 'transport');
  const available = req.cookies?.[probe.name] === '1';
  if (!available) res.cookie(probe.name, '1', { ...probe.options, maxAge: 10 * 60_000 });
  res.json({ data: { cookie: available } });
});

router.post('/session', asyncHandler(async (req, res) => {
  const input = parseInput(sessionSchema, req.body);
  const transport = input.transport;
  if (transport === 'cookie') requireSameOrigin(req);
  const cookie = supportCookie(req, input.siteId || 'default');
  const site = await loadSupportSite(input.siteId, { requireEnabled: true });
  const embedOrigin = normalizeSupportOrigin(input.embedOrigin);
  const allowedOrigins = Array.isArray(site.allowed_origins) ? site.allowed_origins : [];
  const nativeOrigin = requestOrigin(req);
  if (allowedOrigins.length && embedOrigin !== nativeOrigin && (!embedOrigin || !allowedOrigins.includes(embedOrigin))) {
    throw new AppError(403, 'SUPPORT_ORIGIN_DENIED', 'Цей сайт не має доступу до віджета онлайн-підтримки.');
  }
  const pageReferences = await resolveSupportProductReferences({ pageUrl: normalizeSupportPageUrl(input.pageUrl) });
  const pageUrl = pageReferences[0]?.url || '';

  async function resume(token, tokenTransport) {
    if (!token) return null;
    try {
      const visitor = await loadSupportVisitorByToken(token, tokenTransport);
      return visitor.site_id === site.id ? visitor : null;
    } catch (error) {
      if (!(error instanceof AppError) || error.status !== 401) throw error;
      return null;
    }
  }

  let token = transport === 'cookie' ? req.cookies?.[cookie.name] : input.visitorToken;
  let visitor = await resume(token, transport);
  if (!visitor && transport === 'cookie' && input.visitorToken) {
    const previous = await resume(input.visitorToken, 'bearer');
    if (previous) {
      token = createSupportSessionToken();
      const migrated = await query(
        `UPDATE support_chat_visitors
         SET session_token_hash = $1, session_transport = 'cookie', session_expires_at = $2
         WHERE id = $3 AND session_token_hash = $4 AND session_revoked_at IS NULL AND session_expires_at > NOW()
         RETURNING id`,
        [hashSupportSessionToken(token), new Date(Date.now() + supportSessionLifetimeMs.cookie), previous.id, hashSupportSessionToken(input.visitorToken)]
      );
      if (!migrated.rows[0]) throw new AppError(409, 'SUPPORT_SESSION_CHANGED', 'Сесія чату оновилась. Завантажте віджет повторно.');
      visitor = await loadSupportVisitorByToken(token, 'cookie');
    }
  }
  if (!visitor) {
    token = createSupportSessionToken();
    const created = await query(
      `INSERT INTO support_chat_visitors (
         site_id, session_token_hash, first_page_url, last_page_url, session_transport, session_expires_at
       ) VALUES ($1, $2, $3, $3, $4, $5)
       RETURNING *`,
      [site.id, hashSupportSessionToken(token), pageUrl, transport, new Date(Date.now() + supportSessionLifetimeMs[transport])]
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
      working_hours_enabled: site.working_hours_enabled,
      working_hours_timezone: site.working_hours_timezone,
      working_hours_schedule: site.working_hours_schedule,
      offline_reply_text: site.offline_reply_text,
      site_updated_at: site.updated_at
    };
  } else {
    const updated = await query(
      `UPDATE support_chat_visitors
       SET last_page_url = CASE WHEN $1 = '' THEN last_page_url ELSE $1 END,
           last_seen_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [pageUrl, visitor.id]
    );
    visitor = { ...visitor, ...updated.rows[0] };
  }
  const data = await publicSessionPayload(visitor);
  if (transport === 'cookie') {
    const expires = new Date(visitor.session_expires_at);
    res.cookie(cookie.name, token, { ...cookie.options, expires });
  }
  res.json({ data: transport === 'bearer' ? { ...data, token } : data });
}));

router.get('/session', asyncHandler(async (req, res) => {
  const visitor = await authenticatedVisitor(req);
  await query('UPDATE support_chat_visitors SET last_seen_at = NOW() WHERE id = $1', [visitor.id]);
  res.json({ data: await publicSessionPayload(visitor) });
}));

router.post('/messages', messageLimiter, asyncHandler(async (req, res) => {
  const input = parseInput(messageSchema, req.body);
  const visitor = await authenticatedVisitor(req);
  const withinWorkingHours = isWithinSupportWorkingHours(visitor);
  const resolvedProductReferences = await resolveSupportProductReferences({ body: input.body, pageUrl: normalizeSupportPageUrl(input.pageUrl) });
  const pageUrl = resolvedProductReferences.find((reference) => reference.source === 'page')?.url || '';
  const client = await pool.connect();
  let conversationId;
  let insertedMessageId = null;
  try {
    await client.query('BEGIN');
    const conversationResult = await client.query(
      `INSERT INTO support_chat_conversations (site_id, visitor_id)
       VALUES ($1, $2)
       ON CONFLICT (site_id, visitor_id)
        DO UPDATE SET visitor_id = EXCLUDED.visitor_id
       RETURNING *`,
      [visitor.site_id, visitor.id]
    );
    const conversation = await lockSupportConversation(client, conversationResult.rows[0].id);
    conversationId = conversation.id;
    const existingMessage = (await client.query(
      'SELECT * FROM support_chat_messages WHERE conversation_id = $1 AND client_message_id = $2',
      [conversationId, input.clientMessageId]
    )).rows[0];
    if (existingMessage && (existingMessage.sender_type !== 'visitor' || existingMessage.body !== input.body)) {
      throw new AppError(409, 'SUPPORT_CLIENT_MESSAGE_CONFLICT', 'Цей ідентифікатор уже використано для іншого повідомлення.');
    }
    const previousReferences = await client.query(
      `SELECT product_references
       FROM support_chat_messages
       WHERE conversation_id = $1 AND product_references <> '[]'::JSONB`,
      [conversationId]
    );
    const productReferences = filterRepeatedPageReferences(resolvedProductReferences, previousReferences.rows);
    const inserted = existingMessage ? { rows: [] } : await client.query(
      `INSERT INTO support_chat_messages (
         conversation_id, sender_type, body, client_message_id, product_references, message_sequence
       ) VALUES ($1, 'visitor', $2, $3, $4::JSONB, $5)
       ON CONFLICT (conversation_id, client_message_id) DO NOTHING
       RETURNING id`,
      [conversationId, input.body, input.clientMessageId, JSON.stringify(productReferences), await nextSupportMessageSequence(client, conversationId)]
    );
    if (inserted.rows[0]) {
      insertedMessageId = inserted.rows[0].id;
      await client.query(`UPDATE support_chat_conversations SET status = CASE
        WHEN status IN ('RESOLVED', 'CLOSED') THEN 'NEW' WHEN status = 'WAITING_CUSTOMER' THEN 'OPEN' ELSE status END,
        resolved_at = NULL, closed_at = NULL, updated_at = NOW() WHERE id = $1`, [conversationId]);
      await enqueueSupportMessagePush(client, insertedMessageId);
      let replyText = '';
      if (!withinWorkingHours) {
        const offlineReplyBefore = new Date(Date.now() - 12 * 60 * 60 * 1000);
        const claimedReply = await client.query(
          `UPDATE support_chat_conversations
           SET last_offline_reply_at = NOW(),
               auto_reply_sent_at = COALESCE(auto_reply_sent_at, NOW())
           WHERE id = $1
             AND (last_offline_reply_at IS NULL OR last_offline_reply_at < $2)
           RETURNING id`,
          [conversationId, offlineReplyBefore]
        );
        if (claimedReply.rows[0]) replyText = visitor.offline_reply_text;
      } else if (!conversation.auto_reply_sent_at) {
        const claimedReply = await client.query(
          `UPDATE support_chat_conversations
           SET auto_reply_sent_at = NOW()
           WHERE id = $1 AND auto_reply_sent_at IS NULL
           RETURNING id`,
          [conversationId]
        );
        if (claimedReply.rows[0]) replyText = visitor.auto_reply_text;
      }
      if (replyText) {
        await client.query(
          `INSERT INTO support_chat_messages (conversation_id, sender_type, body, message_sequence)
           VALUES ($1, 'system', $2, $3)`,
          [conversationId, replyText, await nextSupportMessageSequence(client, conversationId)]
        );
      }
    }
    await client.query(
      `UPDATE support_chat_visitors
       SET last_page_url = CASE WHEN $1 = '' THEN last_page_url ELSE $1 END,
           last_seen_at = NOW()
       WHERE id = $2`,
      [pageUrl, visitor.id]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  if (insertedMessageId) publishSupportChatUpdate({
    type: 'message',
    messageId: insertedMessageId,
    conversationId,
    visitorId: visitor.id,
    senderType: 'visitor',
    visitorName: visitor.name || 'Покупець',
    messagePreview: input.body.slice(0, 180)
  });
  res.status(201).json({ data: await loadPublicConversation(visitor.id) });
}));

router.put('/contact', asyncHandler(async (req, res) => {
  const input = parseInput(contactSchema, req.body);
  const visitor = await authenticatedVisitor(req);
  const updated = await query(
    `UPDATE support_chat_visitors
     SET name = $1, email = $2, phone = $3, last_seen_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [input.name || null, input.email || null, input.phone || null, visitor.id]
  );
  const conversation = await query('SELECT id FROM support_chat_conversations WHERE visitor_id = $1', [visitor.id]);
  if (conversation.rows[0]) {
    await query(
      `INSERT INTO support_chat_events (conversation_id, event_type, payload)
       VALUES ($1, 'CONTACT_UPDATED', $2::JSONB)`,
      [conversation.rows[0].id, JSON.stringify({ hasName: Boolean(input.name), hasEmail: Boolean(input.email), hasPhone: Boolean(input.phone) })]
    );
    publishSupportChatUpdate({ type: 'contact', conversationId: conversation.rows[0].id, visitorId: visitor.id });
  }
  res.json({ data: serializeSupportVisitor(updated.rows[0]) });
}));

router.post('/read', asyncHandler(async (req, res) => {
  const visitor = await authenticatedVisitor(req);
  await query(
    `UPDATE support_chat_conversations SET visitor_last_read_at = NOW()
     WHERE visitor_id = $1`,
    [visitor.id]
  );
  res.status(204).end();
}));

router.get('/stream', asyncHandler(async (req, res) => {
  const { token, transport } = visitorCredential(req);
  const visitor = await loadSupportVisitorByToken(token, transport);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  let checking = false;
  let invalidated = false;
  let closed = false;
  function cleanup() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
  }
  async function send(updated = false) {
    invalidated ||= updated;
    if (checking || closed) return;
    checking = true;
    try {
      await loadSupportVisitorByToken(token, transport);
      if (closed) return;
      res.write(invalidated ? 'event: support\ndata: {}\n\n' : ': keep-alive\n\n');
      invalidated = false;
    } catch (error) {
      if (closed) return;
      if (error instanceof AppError && error.status === 401) res.write('event: session_ended\ndata: {}\n\n');
      res.end();
      cleanup();
    } finally {
      checking = false;
    }
  }
  const unsubscribe = subscribeToSupportVisitorUpdates(visitor.id, () => { void send(true); });
  const heartbeat = setInterval(() => { void send(); }, 25_000);
  heartbeat.unref();
  res.write('event: connected\ndata: {}\n\n');
  res.on('close', cleanup);
}));

router.get('/embed.js', asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('application/javascript').send(supportWidgetEmbedScript(requestOrigin(req)));
}));

export default router;
