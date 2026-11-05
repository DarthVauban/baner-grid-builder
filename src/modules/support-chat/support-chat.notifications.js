import { createHash, randomUUID } from 'node:crypto';
import { pool } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/app-error.js';
import { serializeUser } from '../../lib/serializers.js';
import { getUserToolAccess } from '../access/access.service.js';
import { publishSupportChatUpdate } from './support-chat.events.js';
import { recordMobileSecurityEvent } from '../mobile/mobile-security.service.js';

export const supportPushTtlMs = 15 * 60 * 1000;
const gateNamespace = 73418292;

export async function withSupportNotificationGate(userId, work, dbPool = pool) {
  const db = await dbPool.connect();
  const key = createHash('sha256').update(userId).digest().readInt32BE(0);
  try {
    if (!env.DATABASE_URL.startsWith('pg-mem://')) {
      await db.query("SET statement_timeout = '5s'");
      await db.query("SET lock_timeout = '5s'");
      try { await db.query('SELECT pg_advisory_lock($1, $2)', [gateNamespace, key]); }
      catch (error) {
        if (['55P03', '57014'].includes(error.code)) throw new AppError(503, 'SUPPORT_NOTIFICATION_BUSY', 'Доставка ще триває. Повторіть зміну підписки.');
        throw error;
      }
    }
    return await work(db);
  } finally {
    let destroy = false;
    if (!env.DATABASE_URL.startsWith('pg-mem://')) {
      try {
        await db.query('SELECT pg_advisory_unlock($1, $2)', [gateNamespace, key]);
        await db.query('RESET statement_timeout');
        await db.query('RESET lock_timeout');
      }
      catch { destroy = true; }
    }
    db.release(destroy);
  }
}

export async function supportAccessReason(user, db = pool) {
  if (!user || user.status !== 'approved') return 'TOOL_ACCESS_DENIED';
  if ((await getUserToolAccess(user, db)).includes('online_support')) return null;
  if (user.role === 'admin' || (await db.query(
    "SELECT user_id FROM user_tool_access WHERE user_id = $1 AND tool_id = 'online_support'", [user.id]
  )).rowCount) return 'TOOL_2FA_REQUIRED';
  return 'TOOL_ACCESS_DENIED';
}

export async function getSupportNotificationPreference(userId, db = pool) {
  const result = await db.query('SELECT * FROM user_support_chat_notification_preferences WHERE user_id = $1', [userId]);
  const row = result.rows[0];
  return { enabled: row?.enabled === true, configured: Boolean(row), version: row?.version || 0, updatedAt: row?.updated_at || null };
}

export async function setSupportNotificationPreference(user, input, dbPool = pool) {
  return withSupportNotificationGate(user.id, async (db) => {
    await db.query('BEGIN');
    try {
      if (input.enabled) {
        const currentUser = (await db.query('SELECT * FROM users WHERE id = $1', [user.id])).rows[0];
        const reason = await supportAccessReason(currentUser ? serializeUser(currentUser) : null, db);
        if (reason) throw new AppError(403, reason, 'Немає доступу до сповіщень онлайн-підтримки.');
      }
      const current = await getSupportNotificationPreference(user.id, db);
      if (current.version !== input.expectedVersion) throw new AppError(409, 'SUPPORT_NOTIFICATION_PREFERENCE_CONFLICT', 'Налаштування вже змінено. Оновіть сторінку.');
      await db.query(
        `INSERT INTO user_support_chat_notification_preferences(user_id, enabled, version)
         VALUES ($1, $2, 1) ON CONFLICT (user_id) DO UPDATE
         SET enabled = $2, version = user_support_chat_notification_preferences.version + 1, updated_at = NOW()`,
        [user.id, input.enabled]
      );
      if (!input.enabled) await db.query(
        `UPDATE mobile_push_outbox SET status = 'cancelled', processed_at = NOW(), last_error = 'SUPPORT_NOTIFICATION_DISABLED'
         WHERE device_id IN (SELECT id FROM mobile_devices WHERE user_id = $1)
           AND kind = 'support_chat_message' AND status IN ('pending', 'retry', 'processing')`, [user.id]
      );
      const result = await getSupportNotificationPreference(user.id, db);
      await recordMobileSecurityEvent(db, { userId: user.id, eventType: 'support_chat_preference_changed', metadata: { enabled: result.enabled, version: result.version } });
      await db.query('COMMIT');
      publishSupportChatUpdate({ type: 'notification_preference', userId: user.id });
      return result;
    } catch (error) { await db.query('ROLLBACK'); throw error; }
  }, dbPool);
}

export async function enqueueSupportMessagePush(db, messageId) {
  if (!env.supportChatPushEnqueueEnabled) return;
  const message = (await db.query('SELECT created_at FROM support_chat_messages WHERE id = $1', [messageId])).rows[0];
  if (!message) throw new Error('Support message disappeared inside its transaction');
  const expiresAt = new Date(new Date(message.created_at).getTime() + supportPushTtlMs);
  const users = await db.query(
    `SELECT users.* FROM users JOIN user_support_chat_notification_preferences AS preference
     ON preference.user_id = users.id WHERE users.status = 'approved' AND preference.enabled = TRUE`
  );
  for (const user of users.rows) {
    const reason = await supportAccessReason(serializeUser(user), db);
    if (reason) continue;
    const devices = await db.query(`SELECT id FROM mobile_devices WHERE user_id = $1
      AND revoked_at IS NULL AND support_chat_contract_version = 1 AND fcm_token_hash IS NOT NULL`, [user.id]);
    for (const device of devices.rows) await db.query(
      `INSERT INTO mobile_push_outbox(id, device_id, kind, support_message_id, expires_at, payload)
       VALUES ($1, $2, 'support_chat_message', $3, $4, $5::JSONB) ON CONFLICT DO NOTHING`,
      [randomUUID(), device.id, messageId, expiresAt, JSON.stringify({ kind: 'support_chat_message' })]
    );
  }
}

export async function currentSupportPushTarget(db, deviceId) {
  const devices = await db.query('SELECT * FROM mobile_devices WHERE id = $1', [deviceId]);
  const device = devices.rows[0];
  if (!device || device.revoked_at || device.support_chat_contract_version !== 1 || !device.fcm_token_hash) return null;
  const users = await db.query('SELECT * FROM users WHERE id = $1', [device.user_id]);
  const user = users.rows[0];
  if (!user || await supportAccessReason(serializeUser(user), db)) return null;
  if (!(await getSupportNotificationPreference(user.id, db)).enabled) return null;
  return device;
}
