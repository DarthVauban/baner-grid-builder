import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import { getMaintenanceReason } from '../backups/maintenance.service.js';
import { decryptMobileValue } from './mobile-crypto.js';

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
              devices.fcm_token_ciphertext, devices.fcm_token_iv, devices.fcm_token_tag,
              notifications.title AS notification_title,
              notifications.message AS notification_message,
              login_requests.status AS login_request_status,
              login_requests.expires_at AS login_request_expires_at
       FROM mobile_push_outbox AS outbox
       JOIN mobile_devices AS devices ON devices.id = outbox.device_id
       LEFT JOIN notifications ON notifications.id = outbox.notification_id
       LEFT JOIN mobile_login_requests AS login_requests ON login_requests.id = outbox.login_request_id
       ${claimWhere(lockRows)}`,
      [now, batchSize]
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
  if (row.kind === 'login_request') {
    return { kind: 'login_request', requestId: String(row.login_request_id) };
  }
  if (row.kind === 'workspace_notification') {
    return { kind: 'workspace_notification', notificationId: String(row.notification_id) };
  }
  return { kind: 'device_revoked', deviceId: String(row.device_id) };
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
  }
  return message;
}

async function finishOutboxRow(dbPool, row, outcome, now) {
  if (outcome.clearToken) {
    await dbPool.query(
      `UPDATE mobile_devices
       SET fcm_token_ciphertext = NULL, fcm_token_iv = NULL,
           fcm_token_tag = NULL, fcm_token_hash = NULL
       WHERE id = $1`,
      [row.device_id]
    );
  }
  if (outcome.status === 'retry') {
    const delayMs = Math.min(6 * 60 * 60 * 1000, 30_000 * (2 ** Math.max(0, row.attempts - 1)));
    await dbPool.query(
      `UPDATE mobile_push_outbox
       SET status = 'retry', available_at = $1, last_error = $2
       WHERE id = $3`,
      [new Date(now.getTime() + delayMs), outcome.errorCode, row.id]
    );
    return;
  }
  await dbPool.query(
    `UPDATE mobile_push_outbox
     SET status = $1, processed_at = $2, last_error = $3
     WHERE id = $4`,
    [outcome.status, now, outcome.errorCode || null, row.id]
  );
}

async function deliverOutboxRow(row, messaging, now, dbPool) {
  if (row.device_revoked_at) {
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
    await finishOutboxRow(dbPool, row, { status: 'delivered' }, now);
    return 'delivered';
  } catch (error) {
    const errorCode = safeErrorCode(error);
    if (invalidTokenCodes.has(errorCode)) {
      await finishOutboxRow(dbPool, row, {
        status: 'failed',
        errorCode,
        clearToken: true
      }, now);
      return 'failed';
    }
    if (transientFirebaseCodes.has(errorCode) && row.attempts < maxAttempts) {
      await finishOutboxRow(dbPool, row, { status: 'retry', errorCode }, now);
      return 'retry';
    }
    await finishOutboxRow(dbPool, row, { status: 'failed', errorCode }, now);
    return 'failed';
  }
}

export async function processMobilePushOutbox({
  messaging,
  now = new Date(),
  batchSize = 20,
  lockRows = env.NODE_ENV !== 'test',
  dbPool = pool
} = {}) {
  if (getMaintenanceReason()) return { claimed: 0, delivered: 0, retried: 0, failed: 0 };
  const firebaseMessaging = messaging || resolveFirebaseMessaging();
  if (!firebaseMessaging) return { claimed: 0, delivered: 0, retried: 0, failed: 0 };
  const rows = await claimOutboxRows({
    dbPool,
    now,
    batchSize: Math.min(100, Math.max(1, Number(batchSize) || 20)),
    lockRows
  });
  const summary = { claimed: rows.length, delivered: 0, retried: 0, failed: 0 };
  for (const row of rows) {
    const outcome = await deliverOutboxRow(row, firebaseMessaging, now, dbPool);
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
