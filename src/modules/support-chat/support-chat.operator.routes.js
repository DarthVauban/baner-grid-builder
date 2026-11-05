import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { serializeUser } from '../../lib/serializers.js';
import { subscribeToSupportOperatorUpdates } from './support-chat.events.js';
import { supportAccessReason, getSupportNotificationPreference, setSupportNotificationPreference } from './support-chat.notifications.js';
import { claimSupportConversation, listSupportConversations, listSupportMessages, loadSupportConversation,
  markSupportConversationRead, sendSupportOperatorMessage, setSupportConversationStatus, supportUnreadCount, updateSupportCustomer } from './support-chat.operator.service.js';

const idSchema = z.string().uuid();
const statusSchema = z.enum(['NEW', 'OPEN', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED']);
const pageSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().max(4096).default('') });
const messageSchema = z.object({ body: z.string().trim().min(1).max(5000), clientMessageId: idSchema });
const customerSchema = z.object({ name: z.string().trim().max(160),
  email: z.union([z.string().trim().email().max(320), z.literal('')]), phone: z.string().trim().max(40) });

export function createSupportPreferenceRouter() {
  const router = Router();
  router.get('/notification-preference', asyncHandler(async (req, res) => {
    res.json({ data: await getSupportNotificationPreference(req.user.id) });
  }));
  router.put('/notification-preference', asyncHandler(async (req, res) => {
    const input = parseInput(z.object({ enabled: z.boolean(), expectedVersion: z.number().int().min(0) }), req.body);
    res.json({ data: await setSupportNotificationPreference(req.user, input) });
  }));
  return router;
}

function supportStream(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  let closed = false;
  let pending = Promise.resolve();
  const access = async () => {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows[0] || result.rows[0].status !== 'approved') return 'INVALID_DEVICE_TOKEN';
    if (req.mobileDevice) {
      const devices = await pool.query('SELECT revoked_at FROM mobile_devices WHERE id = $1 AND user_id = $2', [req.mobileDevice.id, req.user.id]);
      if (!devices.rows[0] || devices.rows[0].revoked_at) return 'DEVICE_REVOKED';
    }
    return supportAccessReason(serializeUser(result.rows[0]));
  };
  const send = (payload) => {
    if (payload.userId && payload.userId !== req.user.id) return;
    pending = pending.then(async () => {
      if (closed) return;
      const reason = await access();
      if (reason) { res.write(`event: access_revoked\ndata: ${JSON.stringify({ code: reason })}\n\n`); res.end(); cleanup(); return; }
      // Preserve the web desktop payload; mobile receives only invalidation IDs.
      const data = req.mobileDevice ? { type: payload.type, conversationId: payload.conversationId,
        messageId: payload.messageId, senderType: payload.senderType } : payload;
      res.write(`event: support\ndata: ${JSON.stringify(data)}\n\n`);
    }).catch(() => { if (!closed) { res.end(); cleanup(); } });
  };
  const unsubscribe = subscribeToSupportOperatorUpdates(send);
  const heartbeat = setInterval(() => send({ type: 'heartbeat' }), 25_000);
  heartbeat.unref();
  function cleanup() { if (closed) return; closed = true; clearInterval(heartbeat); unsubscribe(); }
  res.write('event: connected\ndata: {"contractVersion":1}\n\n');
  req.on('close', cleanup);
}

export function createSupportOperatorRouter({ mobile = false } = {}) {
  const router = Router();
  router.get('/stream', supportStream);
  router.get('/unread-count', asyncHandler(async (req, res) => res.json({ data: await supportUnreadCount() })));
  router.get('/conversations', asyncHandler(async (req, res) => {
    const filters = parseInput(z.object({ status: z.union([statusSchema, z.literal('')]).default(''), search: z.string().trim().max(160).default('') }), req.query);
    const page = mobile ? parseInput(pageSchema, req.query) : { limit: 250 };
    const result = await listSupportConversations({ ...filters, ...page });
    res.json({ data: mobile ? result : result.items });
  }));
  router.get('/conversations/:id', asyncHandler(async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    const conversation = await loadSupportConversation(id);
    if (mobile) return res.json({ data: conversation });
    const messages = await listSupportMessages(id, { limit: 100 });
    res.json({ data: { conversation, messages: messages.items, olderCursor: messages.nextCursor, hasMore: messages.hasMore } });
  }));
  router.get('/conversations/:id/messages', asyncHandler(async (req, res) => {
    res.json({ data: await listSupportMessages(parseInput(idSchema, req.params.id), parseInput(pageSchema, req.query)) });
  }));
  router.post('/conversations/:id/read', asyncHandler(async (req, res) => {
    const id = parseInput(idSchema, req.params.id);
    // Cached old web clients have no observed boundary. Acknowledge without
    // advancing it rather than marking messages that they never rendered.
    if (!mobile && !req.body?.lastReadMessageId) { await loadSupportConversation(id); return res.status(204).end(); }
    const input = parseInput(z.object({ lastReadMessageId: idSchema }), req.body);
    const readState = await markSupportConversationRead(id, input.lastReadMessageId);
    if (!mobile) return res.status(204).end();
    res.json({ data: readState });
  }));
  router.post('/conversations/:id/claim', asyncHandler(async (req, res) => {
    res.json({ data: await claimSupportConversation(parseInput(idSchema, req.params.id), req.user) });
  }));
  router.patch('/conversations/:id/customer', asyncHandler(async (req, res) => {
    res.json({ data: await updateSupportCustomer(parseInput(idSchema, req.params.id), parseInput(customerSchema, req.body), req.user) });
  }));
  router.patch('/conversations/:id/status', asyncHandler(async (req, res) => {
    const { status } = parseInput(z.object({ status: statusSchema }), req.body);
    res.json({ data: await setSupportConversationStatus(parseInput(idSchema, req.params.id), status, req.user) });
  }));
  router.post('/conversations/:id/messages', asyncHandler(async (req, res) => {
    const result = await sendSupportOperatorMessage(parseInput(idSchema, req.params.id), parseInput(messageSchema, req.body), req.user);
    res.status(!mobile || result.created ? 201 : 200).json({ data: result.message });
  }));
  return router;
}
