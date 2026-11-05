import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import { getMaintenanceReason } from '../backups/maintenance.service.js';
import { decryptMobileValue } from './mobile-crypto.js';
import { recordMobileSecurityEvent } from './mobile-security.service.js';
import { createHash } from 'node:crypto';
import { currentSupportPushTarget, withSupportNotificationGate } from '../support-chat/support-chat.notifications.js';
import { createSupportPushTransport } from './mobile-support-push.transport.js';

const firebaseAppName = 'mt-mobile-push';
const processingLeaseMs = 5 * 60 * 1000;
const maxAttempts = 8;
const transientFirebaseCodes = new Set([
  'messaging/internal-error',
  'messaging/server-unavailable',
  'messaging/unknown-error',
  'messaging/quota-exceeded'
]);
const invalidTokenCodes = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered'
]);

function safeErrorCode(error) {
  const candidate = String(error?.code || 'FCM_DELIVERY_FAILED');
  return /^[A-Z0-9_/-]{1,160}$/i.test(candidate) ? candidate : 'FCM_DELIVERY_FAILED';
}

function configurationError(message) {
  const error = new Error(message);
  error.code = 'FCM_NOT_CONFIGURED';
  return error;
}

export function resolveFirebaseMessaging() {
  if (!env.mobilePushEnabled) return null;
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    throw configurationError('Firebase Admin credentials are not configured.');
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
  } catch (_error) {
    throw configurationError('Firebase Admin credentials are invalid.');
  }
  const existing = getApps().find((app) => app.name === firebaseAppName);
  const firebaseApp = existing || initializeApp({
    credential: cert(serviceAccount),
    projectId: env.FIREBASE_PROJECT_ID
  }, firebaseAppName);
  return getMessaging(firebaseApp);
}

function claimWhere(lockRows) {
  return `WHERE (
      outbox.status IN ('pending', 'retry')
      OR (outbox.status = 'processing' AND outbox.available_at <= $1)
    )
    AND outbox.available_at <= $1
    AND (outbox.kind <> 'support_chat_message' OR $3::BOOLEAN = TRUE)
    ORDER BY outbox.created_at
    LIMIT $2
    ${lockRows ? 'FOR UPDATE OF outbox SKIP LOCKED' : ''}`;
}

async function claimOutboxRows({ dbPool, now, batchSize, lockRows }) {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT outbox.*,
              devices.revoked_at AS device_revoked_at,
              devices.user_id AS device_user_id,
              devices.fcm_token_ciphertext, devices.fcm_token_iv, devices.fcm_token_tag,
              devices.fcm_token_hash,
              notifications.title AS notification_title,
              notifications.message AS notification_message,
              login_requests.status AS login_request_status,
               login_requests.expires_at AS login_request_expires_at,
               support_messages.conversation_id AS support_conversation_id
       FROM mobile_push_outbox AS outbox
       JOIN mobile_devices AS devices ON devices.id = outbox.device_id
       LEFT JOIN notifications ON notifications.id = outbox.notification_id
       LEFT JOIN mobile_login_requests AS login_requests ON login_requests.id = outbox.login_request_id
        LEFT JOIN support_chat_messages AS support_messages ON support_messages.id = outbox.support_message_id
       ${claimWhere(lockRows)}`,
      [now, batchSize, env.supportChatPushSendEnabled]
    );
    const leaseUntil = new Date(now.getTime() + processingLeaseMs);
    for (const row of result.rows) {
      await client.query(
        `UPDATE mobile_push_outbox
         SET status = 'processing', attempts = attempts + 1, available_at = $1
         WHERE id = $2`,
        [leaseUntil, row.id]
      );
      row.attempts = Number(row.attempts) + 1;
    }
    await client.query('COMMIT');
    return result.rows;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function pushData(row) {
  const routing = {
    deploymentId: env.mobileDeploymentId,
    environment: env.mobileEnvironment,
    targetDeviceId: String(row.device_id)
  };
  if (row.kind === 'login_request') {
    return { kind: 'login_request', requestId: String(row.login_request_id), ...routing };
  }
  if (row.kind === 'workspace_notification') {
    return { kind: 'workspace_notification', notificationId: String(row.notification_id), ...routing };
  }
  if (row.kind === 'support_chat_message') return { kind: row.kind, schemaVersion: '1', pushId: String(row.id),
    conversationId: String(row.support_conversation_id), messageId: String(row.support_message_id),
    expiresAt: new Date(row.expires_at).toISOString(), ...routing };
  if (row.kind === 'device_revoked') return { kind: 'device_revoked', deviceId: String(row.device_id), ...routing };
  throw Object.assign(new Error('Unknown push kind'), { code: 'UNKNOWN_PUSH_KIND' });
}

function buildFirebaseMessage(row, token, now) {
  const message = { token, data: pushData(row) };
  if (row.kind === 'login_request') {
    const expiresAt = new Date(row.login_request_expires_at);
    const ttl = Math.max(0, Math.min(5 * 60 * 1000, expiresAt.getTime() - now.getTime()));
    message.notification = {
      title: 'Новий запит на вхід',
      body: 'Відкрийте MT Workspace, щоб підтвердити або відхилити вхід.'
    };
    message.android = { priority: 'high', ttl };
  } else if (row.kind === 'workspace_notification') {
    message.notification = {
      title: String(row.notification_title || 'Нове сповіщення').slice(0, 160),
      body: String(row.notification_message || '').slice(0, 500)
    };
    message.android = { ttl: 24 * 60 * 60 * 1000 };
  } else if (row.kind === 'support_chat_message') {
    const ttl = Math.max(0, new Date(row.expires_at).getTime() - now.getTime());
    const notificationKey = 'mt-sc-' + createHash('sha256').update(`${env.mobileDeploymentId}:${row.device_id}:${row.id}`).digest('base64url');
    message.notification = { title: 'Нове повідомлення в онлайн-підтримці', body: 'Покупець написав у чат. Відкрийте MT Workspace, щоб відповісти.' };
    message.android = { priority: 'high', ttl, notification: { tag: notificationKey, channelId: 'support_chat_v1' } };
    message.apns = { headers: { 'apns-expiration': String(Math.floor(new Date(row.expires_at).getTime() / 1000)), 'apns-collapse-id': notificationKey } };
  }
  return message;
}

async function finishOutboxRow(dbPool, row, outcome, now) {
  if (outcome.clearToken) {
    const invalidated = await dbPool.query(
      `UPDATE mobile_devices
       SET fcm_token_ciphertext = NULL, fcm_token_iv = NULL,
           fcm_token_tag = NULL, fcm_token_hash = NULL
       WHERE ${outcome.clearToken === 'matching_hash' ? 'fcm_token_hash = $1' : 'id = $1'}
       RETURNING id, user_id`,
      [outcome.clearToken === 'matching_hash' ? row.fcm_token_hash : row.device_id]
    );
    if (outcome.clearToken === 'matching_hash') {
      for (const device of invalidated.rows) {
        await recordMobileSecurityEvent(dbPool, {
          userId: device.user_id,
          deviceId: device.id,
          eventType: 'fcm_token_invalidated',
          metadata: { reason: outcome.errorCode || 'invalid_registration_token' }
        });
      }
    }
  }
  if (outcome.status === 'retry') {
    const delayMs = Math.min(6 * 60 * 60 * 1000, 30_000 * (2 ** Math.max(0, row.attempts - 1)));
    if (row.kind === 'support_chat_message' && now.getTime() + delayMs >= new Date(row.expires_at).getTime()) {
      outcome = { status: 'cancelled', errorCode: 'SUPPORT_PUSH_EXPIRED' };
    } else {
      await dbPool.query(
        `UPDATE mobile_push_outbox
         SET status = 'retry', available_at = $1, last_error = $2
         WHERE id = $3 AND status = 'processing' AND attempts = $4`,
        [new Date(now.getTime() + delayMs), outcome.errorCode, row.id, row.attempts]
      );
      return;
    }
  }
  await dbPool.query(
    `UPDATE mobile_push_outbox
     SET status = $1, processed_at = $2, last_error = $3
     WHERE id = $4 AND status = 'processing' AND attempts = $5`,
    [outcome.status, now, outcome.errorCode || null, row.id, row.attempts]
  );
}

async function deliverOutboxRow(row, messaging, now, dbPool) {
  if (!['login_request', 'workspace_notification', 'device_revoked', 'support_chat_message'].includes(row.kind)) {
    await finishOutboxRow(dbPool, row, { status: 'failed', errorCode: 'UNKNOWN_PUSH_KIND' }, now);
    return 'failed';
  }
  if (row.device_revoked_at && row.kind !== 'device_revoked') {
    await finishOutboxRow(dbPool, row, { status: 'failed', errorCode: 'DEVICE_REVOKED' }, now);
    return 'failed';
  }
  if (!row.fcm_token_ciphertext || !row.fcm_token_iv || !row.fcm_token_tag) {
    await finishOutboxRow(dbPool, row, { status: 'failed', errorCode: 'FCM_NOT_CONFIGURED' }, now);
    return 'failed';
  }
  if (row.kind === 'login_request' && (
    row.login_request_status !== 'pending'
    || new Date(row.login_request_expires_at).getTime() <= now.getTime()
  )) {
    await finishOutboxRow(dbPool, row, { status: 'failed', errorCode: 'LOGIN_REQUEST_EXPIRED' }, now);
    return 'failed';
  }

  let token;
  try {
    token = decryptMobileValue({
      ciphertext: row.fcm_token_ciphertext,
      iv: row.fcm_token_iv,
      tag: row.fcm_token_tag
    }, 'fcm-token');
  } catch (_error) {
    await finishOutboxRow(dbPool, row, { status: 'failed', errorCode: 'FCM_TOKEN_DECRYPTION_FAILED' }, now);
    return 'failed';
  }

  try {
    await messaging.send(buildFirebaseMessage(row, token, now));
  } catch (error) {
    const errorCode = safeErrorCode(error);
    if (invalidTokenCodes.has(errorCode)) {
      await finishOutboxRow(dbPool, row, {
        status: 'failed',
        errorCode,
        clearToken: 'matching_hash'
      }, now);
      return 'failed';
    }
    if (transientFirebaseCodes.has(errorCode) && row.attempts < maxAttempts) {
      await finishOutboxRow(dbPool, row, { status: 'retry', errorCode }, now);
      return 'retry';
    }
    await finishOutboxRow(dbPool, row, {
      status: 'failed',
      errorCode,
      clearToken: row.kind === 'device_revoked' ? 'device' : null
    }, now);
    return 'failed';
  }
  // An acknowledgment DB failure is an ambiguous delivery, not an FCM rejection.
  // Let the lease/retry path handle it without falsely marking it terminal.
  await finishOutboxRow(dbPool, row, {
    status: 'delivered', clearToken: row.kind === 'device_revoked' ? 'device' : null
  }, now);
  return 'delivered';
}

async function deliverSupportOutboxRow(row, messaging, currentTime, dbPool) {
  try {
    const transport = await createSupportPushTransport(messaging);
    return await withSupportNotificationGate(row.device_user_id, async (db) => {
      const fresh = (await db.query('SELECT * FROM mobile_push_outbox WHERE id = $1', [row.id])).rows[0];
      if (!fresh || fresh.status !== 'processing' || Number(fresh.attempts) !== row.attempts) return 'failed';
      const now = currentTime();
      const target = await currentSupportPushTarget(db, row.device_id);
      if (!env.supportChatPushSendEnabled || !target || new Date(fresh.expires_at).getTime() <= now.getTime()) {
        await finishOutboxRow(db, row, { status: 'cancelled', errorCode: 'SUPPORT_PUSH_INELIGIBLE' }, now);
        return 'failed';
      }
      const renewed = await db.query(`UPDATE mobile_push_outbox SET available_at = $1
        WHERE id = $2 AND status = 'processing' AND attempts = $3 RETURNING id`,
      [new Date(now.getTime() + processingLeaseMs), row.id, row.attempts]);
      if (!renewed.rowCount) return 'failed';
      for (const key of ['fcm_token_ciphertext', 'fcm_token_iv', 'fcm_token_tag', 'fcm_token_hash']) row[key] = target[key];
      return deliverOutboxRow(row, transport, now, db);
    }, dbPool);
  } catch {
    // A failed eligibility lookup is never permission to send. DB failure can
    // also prevent this update; in that case the processing lease is reclaimed.
    await finishOutboxRow(dbPool, row, { status: 'retry', errorCode: 'SUPPORT_ELIGIBILITY_UNAVAILABLE' }, currentTime());
    return 'retry';
  }
}

export async function processMobilePushOutbox({
  messaging,
  now,
  batchSize = 20,
  lockRows = env.NODE_ENV !== 'test',
  dbPool = pool
} = {}) {
  if (getMaintenanceReason()) return { claimed: 0, delivered: 0, retried: 0, failed: 0 };
  const firebaseMessaging = messaging || resolveFirebaseMessaging();
  if (!firebaseMessaging) return { claimed: 0, delivered: 0, retried: 0, failed: 0 };
  const currentTime = () => now || new Date();
  const rows = await claimOutboxRows({
    dbPool,
    now: currentTime(),
    batchSize: Math.min(100, Math.max(1, Number(batchSize) || 20)),
    lockRows
  });
  const summary = { claimed: rows.length, delivered: 0, retried: 0, failed: 0 };
  for (const row of rows) {
    const outcome = row.kind === 'support_chat_message'
      ? await deliverSupportOutboxRow(row, firebaseMessaging, currentTime, dbPool)
      : await deliverOutboxRow(row, firebaseMessaging, currentTime(), dbPool);
    if (outcome === 'delivered') summary.delivered += 1;
    else if (outcome === 'retry') summary.retried += 1;
    else summary.failed += 1;
  }
  return summary;
}

export function startMobilePushWorker({ intervalMs = 5_000, messaging } = {}) {
  if (!env.mobilePushEnabled && !messaging) return async () => {};
  let firebaseMessaging;
  try {
    firebaseMessaging = messaging || resolveFirebaseMessaging();
  } catch (error) {
    console.error('Mobile push worker disabled', safeErrorCode(error));
    return async () => {};
  }
  let stopped = false;
  let running = null;
  const run = () => {
    if (stopped || running) return running;
    running = processMobilePushOutbox({ messaging: firebaseMessaging })
      .catch((error) => console.error('Mobile push worker failed', safeErrorCode(error)))
      .finally(() => { running = null; });
    return running;
  };
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
  void run();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await running;
  };
}

export { buildFirebaseMessage, maxAttempts, processingLeaseMs };
