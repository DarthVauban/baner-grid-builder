import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://mobile-push-worker-tests';
process.env.JWT_SECRET = 'mobile-push-worker-test-secret-123456789';
process.env.MOBILE_TOKEN_PEPPER = 'mobile-push-worker-pepper-1234567890';
process.env.MOBILE_PUSH_ENABLED = 'false';
process.env.ADMIN_NAME = 'Push Worker Admin';
process.env.ADMIN_EMAIL = 'push-worker-admin@test.local';
process.env.ADMIN_PASSWORD = 'PushWorkerPassword123!';

const { pool, query } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');
const { createNotification } = await import('../src/modules/notifications/notification.service.js');
const { encryptMobileValue, hashFcmToken } = await import('../src/modules/mobile/mobile-crypto.js');
const {
  processMobilePushOutbox,
  startMobilePushWorker
} = await import('../src/modules/mobile/mobile-push.worker.js');

let userId;

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  const user = await query('SELECT id FROM users WHERE email = $1', [process.env.ADMIN_EMAIL]);
  userId = user.rows[0].id;
});

beforeEach(async () => {
  await query('DELETE FROM mobile_push_outbox');
  await query('DELETE FROM notifications');
  await query('DELETE FROM mobile_login_requests');
  await query('DELETE FROM mobile_devices');
});

after(async () => {
  await pool.end();
});

async function createPushDevice(name, token) {
  const encrypted = encryptMobileValue(token, 'fcm-token');
  const result = await query(
    `INSERT INTO mobile_devices (
       user_id, name, platform, access_token_hash,
       fcm_token_ciphertext, fcm_token_iv, fcm_token_tag, fcm_token_hash
     ) VALUES ($1, $2, 'android', $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      userId,
      name,
      `access-hash-${name}`,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      hashFcmToken(token)
    ]
  );
  return result.rows[0].id;
}

function firebaseError(code) {
  const error = new Error('Firebase rejected a hidden registration token.');
  error.code = code;
  return error;
}

test('push worker delivers a safe workspace notification payload', async () => {
  const token = 'raw-fcm-success-token-that-must-not-be-logged';
  const deviceId = await createPushDevice('success', token);
  const notificationId = await createNotification(pool, {
    userId,
    type: 'application_created',
    title: 'Нова заявка',
    message: 'Надійшла нова заявка.'
  });
  const sent = [];
  const summary = await processMobilePushOutbox({
    messaging: { send: async (message) => { sent.push(message); return 'message-id'; } },
    now: new Date('2030-08-12T12:00:00.000Z')
  });

  assert.deepEqual(summary, { claimed: 1, delivered: 1, retried: 0, failed: 0 });
  assert.deepEqual(sent, [{
    token,
    data: {
      kind: 'workspace_notification',
      notificationId,
      deploymentId: 'mt-workspace-test',
      environment: 'test',
      targetDeviceId: deviceId
    },
    notification: { title: 'Нова заявка', body: 'Надійшла нова заявка.' },
    android: { ttl: 86_400_000 }
  }]);
  const outbox = await query('SELECT status, attempts, processed_at, last_error FROM mobile_push_outbox');
  assert.equal(outbox.rows[0].status, 'delivered');
  assert.equal(outbox.rows[0].attempts, 1);
  assert.ok(outbox.rows[0].processed_at);
  assert.equal(outbox.rows[0].last_error, null);
});

test('push worker retries transient Firebase errors with exponential backoff', async () => {
  await createPushDevice('retry', 'raw-fcm-retry-token-that-must-not-be-logged');
  await createNotification(pool, {
    userId,
    type: 'task_reminder',
    title: 'Нагадування',
    message: 'Перевірте справу.'
  });
  const now = new Date('2030-08-12T12:00:00.000Z');
  const first = await processMobilePushOutbox({
    messaging: { send: async () => { throw firebaseError('messaging/internal-error'); } },
    now
  });
  assert.deepEqual(first, { claimed: 1, delivered: 0, retried: 1, failed: 0 });
  const retry = await query('SELECT status, attempts, available_at, last_error FROM mobile_push_outbox');
  assert.equal(retry.rows[0].status, 'retry');
  assert.equal(retry.rows[0].attempts, 1);
  assert.equal(new Date(retry.rows[0].available_at).toISOString(), '2030-08-12T12:00:30.000Z');
  assert.equal(retry.rows[0].last_error, 'messaging/internal-error');
  assert.equal(JSON.stringify(retry.rows[0]).includes('raw-fcm-retry-token'), false);

  const second = await processMobilePushOutbox({
    messaging: { send: async () => 'message-id' },
    now: new Date('2030-08-12T12:00:31.000Z')
  });
  assert.deepEqual(second, { claimed: 1, delivered: 1, retried: 0, failed: 0 });
});

test('invalid Firebase token is cleared without revoking the device', async () => {
  const deviceId = await createPushDevice('invalid', 'raw-fcm-invalid-token-that-must-not-be-logged');
  await createNotification(pool, {
    userId,
    type: 'publication_updated',
    title: 'Публікацію оновлено',
    message: 'Оновлено дані публікації.'
  });
  const summary = await processMobilePushOutbox({
    messaging: {
      send: async () => { throw firebaseError('messaging/registration-token-not-registered'); }
    },
    now: new Date('2030-08-12T12:00:00.000Z')
  });

  assert.deepEqual(summary, { claimed: 1, delivered: 0, retried: 0, failed: 1 });
  const device = await query('SELECT * FROM mobile_devices WHERE id = $1', [deviceId]);
  assert.equal(device.rows[0].revoked_at, null);
  assert.equal(device.rows[0].fcm_token_ciphertext, null);
  assert.equal(device.rows[0].fcm_token_hash, null);
  const outbox = await query('SELECT status, last_error FROM mobile_push_outbox');
  assert.deepEqual(outbox.rows[0], {
    status: 'failed',
    last_error: 'messaging/registration-token-not-registered'
  });
});

test('login request push contains only request id and respects challenge TTL', async () => {
  const token = 'raw-fcm-login-token-that-must-not-be-logged';
  const deviceId = await createPushDevice('login', token);
  const now = new Date('2030-08-12T12:00:00.000Z');
  const expiresAt = new Date(now.getTime() + 4 * 60 * 1000);
  const loginRequest = await query(
    `INSERT INTO mobile_login_requests (user_id, challenge_hash, expires_at)
     VALUES ($1, 'push-worker-login-challenge', $2)
     RETURNING id`,
    [userId, expiresAt]
  );
  await query(
    `INSERT INTO mobile_push_outbox (device_id, kind, login_request_id, payload)
     VALUES ($1, 'login_request', $2, $3::JSONB)`,
    [
      deviceId,
      loginRequest.rows[0].id,
      JSON.stringify({ kind: 'login_request', requestId: loginRequest.rows[0].id })
    ]
  );
  const sent = [];
  await processMobilePushOutbox({
    messaging: { send: async (message) => { sent.push(message); return 'message-id'; } },
    now
  });

  assert.deepEqual(sent, [{
    token,
    data: {
      kind: 'login_request',
      requestId: loginRequest.rows[0].id,
      deploymentId: 'mt-workspace-test',
      environment: 'test',
      targetDeviceId: deviceId
    },
    notification: {
      title: 'Новий запит на вхід',
      body: 'Відкрийте MT Workspace, щоб підтвердити або відхилити вхід.'
    },
    android: { priority: 'high', ttl: 240_000 }
  }]);
});

test('disabled push processing does not initialize Firebase', async () => {
  assert.deepEqual(await processMobilePushOutbox(), {
    claimed: 0,
    delivered: 0,
    retried: 0,
    failed: 0
  });
});

test('worker stop waits for the active delivery cycle', async () => {
  await createPushDevice('shutdown', 'raw-fcm-shutdown-token-that-must-not-be-logged');
  await createNotification(pool, {
    userId,
    type: 'task_reminder',
    title: 'Нагадування',
    message: 'Перевірте справу.'
  });
  let releaseSend;
  const sendStarted = new Promise((resolve) => {
    releaseSend = resolve;
  });
  let confirmDeliveryStarted;
  const deliveryStarted = new Promise((resolve) => {
    confirmDeliveryStarted = resolve;
  });
  const stop = startMobilePushWorker({
    intervalMs: 60_000,
    messaging: {
      send: async () => {
        confirmDeliveryStarted();
        await sendStarted;
        return 'message-id';
      }
    }
  });

  await deliveryStarted;
  let stopped = false;
  const stopping = stop().then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(stopped, false);
  releaseSend();
  await stopping;
  assert.equal(stopped, true);
  const outbox = await query('SELECT status FROM mobile_push_outbox');
  assert.equal(outbox.rows[0].status, 'delivered');
});
