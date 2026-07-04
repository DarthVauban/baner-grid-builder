import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { subscribeToNotificationUpdates } from './notification.events.js';
import { serializeNotification } from './notification.service.js';

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
  const result = await query(
    `SELECT id, task_id, publication_id, type, title, message, read_at, created_at
     FROM notifications
     WHERE user_id = $1 AND ($2::BOOLEAN = FALSE OR read_at IS NULL)
     ORDER BY created_at DESC
     LIMIT 100`,
    [req.user.id, unreadOnly]
  );
  const countResult = await query(
    'SELECT COUNT(*)::INTEGER AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [req.user.id]
  );

  res.json({
    data: {
      items: result.rows.map(serializeNotification),
      unreadCount: countResult.rows[0]?.count || 0
    }
  });
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const result = await query(
    `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2
     RETURNING id, task_id, publication_id, type, title, message, read_at, created_at`,
    [id, req.user.id]
  );
  if (!result.rows[0]) throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Сповіщення не знайдено.');
  res.json({ data: serializeNotification(result.rows[0]) });
}));

router.post('/read-all', asyncHandler(async (req, res) => {
  await query(
    'UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL',
    [req.user.id]
  );
  res.status(204).end();
}));

export default router;
