import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { subscribeToNotificationUpdates } from './notification.events.js';
import {
  listUserNotifications,
  markAllUserNotificationsRead,
  markUserNotificationRead
} from './notification.service.js';

const router = Router();
router.use(requireAuth);

const idSchema = z.string().uuid();

router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendUpdate = () => res.write('event: notifications\ndata: {}\n\n');
  const unsubscribe = subscribeToNotificationUpdates(req.user.id, sendUpdate);
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
  heartbeat.unref();
  res.write('event: connected\ndata: {}\n\n');

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

router.get('/', asyncHandler(async (req, res) => {
  const unreadOnly = String(req.query.unreadOnly || '') === 'true';
  res.json({ data: await listUserNotifications(req.user.id, { unreadOnly }) });
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  res.json({ data: await markUserNotificationRead(req.user.id, id) });
}));

router.post('/read-all', asyncHandler(async (req, res) => {
  await markAllUserNotificationsRead(req.user.id);
  res.status(204).end();
}));

export default router;
