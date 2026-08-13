import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://mobile-security-cleanup-tests';
process.env.JWT_SECRET = 'mobile-security-cleanup-secret-123456789';
process.env.MOBILE_TOKEN_PEPPER = 'mobile-security-pepper-123456789012345';
process.env.MOBILE_PUSH_ENABLED = 'true';
process.env.COOKIE_SECURE = 'false';
process.env.ADMIN_NAME = 'Security Cleanup Admin';
process.env.ADMIN_EMAIL = 'security-cleanup-admin@test.local';
process.env.ADMIN_PASSWORD = 'SecurityCleanupAdmin123!';

const { default: app } = await import('../src/app.js');
const { pool, query } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');
const {
  encryptMobileValue,
  hashDeviceAccessToken,
  hashFcmToken
} = await import('../src/modules/mobile/mobile-crypto.js');
const {
  encryptTwoFactorSecret,
  generateTwoFactorSecret,
  hashTwoFactorRecoveryCode
} = await import('../src/modules/auth/two-factor.service.js');
const { processMobilePushOutbox } = await import('../src/modules/mobile/mobile-push.worker.js');

let adminId;

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  const admin = await query('SELECT id FROM users WHERE email = $1', [process.env.ADMIN_EMAIL]);
  adminId = admin.rows[0].id;
});

beforeEach(async () => {
  await query('DELETE FROM users WHERE id <> $1', [adminId]);
});

after(async () => {
  await pool.end();
});

async function createUser(label, { twoFactor = false } = {}) {
  const email = `${label}@test.local`;
  const password = `Password-${label}-123!`;
  const passwordHash = await bcrypt.hash(password, 4);
  const secret = twoFactor ? encryptTwoFactorSecret(generateTwoFactorSecret()) : null;
  const result = await query(
    `INSERT INTO users (
       name, email, password_hash, role, status, approved_at,
       two_factor_enabled, two_factor_method, two_factor_confirmed_at,
       two_factor_secret_ciphertext, two_factor_secret_iv, two_factor_secret_tag
     ) VALUES ($1, $2, $3, 'manager', 'approved', NOW(), $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      label,
      email,
      passwordHash,
      twoFactor,
      twoFactor ? 'mt_workspace' : null,
      twoFactor ? new Date() : null,
      secret?.ciphertext || null,
      secret?.iv || null,
      secret?.tag || null
    ]
  );
  return { id: result.rows[0].id, email, password };
}

async function createMobileState(userId, label) {
  const accessToken = `mobile-access-token-${label}-123456789`;
  const fcmToken = `fcm-registration-token-${label}-123456789`;
  const encryptedFcm = encryptMobileValue(fcmToken, 'fcm-token');
  const device = await query(
    `INSERT INTO mobile_devices (
       user_id, name, platform, access_token_hash,
       fcm_token_ciphertext, fcm_token_iv, fcm_token_tag, fcm_token_hash
     ) VALUES ($1, $2, 'android', $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      userId,
      `Device ${label}`,
      hashDeviceAccessToken(accessToken),
      encryptedFcm.ciphertext,
      encryptedFcm.iv,
      encryptedFcm.tag,
      hashFcmToken(fcmToken)
    ]
  );
  const pairing = await query(
    `INSERT INTO mobile_pairings (
       user_id, purpose, qr_token_hash, manual_code_hash,
       secret_ciphertext, secret_iv, secret_tag, expires_at
     ) VALUES ($1, 'add_device', $2, $3, 'ciphertext', 'iv', 'tag', $4)
     RETURNING id`,
    [userId, `qr-${label}`, `manual-${label}`, new Date(Date.now() + 600_000)]
  );
  const login = await query(
    `INSERT INTO mobile_login_requests (user_id, challenge_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [userId, `challenge-${label}`, new Date(Date.now() + 300_000)]
  );
  await query(
    `INSERT INTO mobile_push_outbox (device_id, kind, payload)
     VALUES ($1, 'workspace_notification', $2::JSONB)`,
    [device.rows[0].id, JSON.stringify({ kind: 'workspace_notification', notificationId: label })]
  );
  return {
    accessToken,
    fcmToken,
    deviceId: device.rows[0].id,
    pairingId: pairing.rows[0].id,
    loginRequestId: login.rows[0].id
  };
}

async function loginAgent(email, password) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password }).expect(200);
  return agent;
}

async function assertMobileStateClosed(userId, state, reason) {
  const device = await query('SELECT * FROM mobile_devices WHERE id = $1', [state.deviceId]);
  assert.ok(device.rows[0].revoked_at);
  assert.equal(device.rows[0].revocation_reason, reason);
  const pairing = await query('SELECT status FROM mobile_pairings WHERE id = $1', [state.pairingId]);
  assert.equal(pairing.rows[0].status, 'cancelled');
  const login = await query('SELECT status FROM mobile_login_requests WHERE id = $1', [state.loginRequestId]);
  assert.equal(login.rows[0].status, 'denied');
  const outbox = await query(
    'SELECT kind, status, payload FROM mobile_push_outbox WHERE device_id = $1 ORDER BY created_at',
    [state.deviceId]
  );
  assert.equal(outbox.rows.find((row) => row.kind === 'workspace_notification').status, 'failed');
  const revokedPush = outbox.rows.find((row) => row.kind === 'device_revoked');
  assert.equal(revokedPush.status, 'pending');
  assert.deepEqual(revokedPush.payload, { kind: 'device_revoked', deviceId: state.deviceId });
  const event = await query(
    `SELECT metadata FROM mobile_security_events
     WHERE user_id = $1 AND event_type = 'mobile_access_revoked'
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  assert.equal(event.rows[0].metadata.reason, reason);
  assert.equal(event.rows[0].metadata.targetUserId, userId);
}

test('password change atomically invalidates mobile access and pending state', async () => {
  const user = await createUser('password-cleanup');
  const state = await createMobileState(user.id, 'password-cleanup');
  const agent = await loginAgent(user.email, user.password);

  await agent
    .put('/api/users/profile/password')
    .send({ currentPassword: 'WrongCurrentPassword!', newPassword: 'ChangedPassword-123!' })
    .expect(422)
    .expect((response) => assert.equal(response.body.error.code, 'INVALID_CURRENT_PASSWORD'));
  const beforeChange = await query('SELECT revoked_at FROM mobile_devices WHERE id = $1', [state.deviceId]);
  assert.equal(beforeChange.rows[0].revoked_at, null);

  await agent
    .put('/api/users/profile/password')
    .send({ currentPassword: user.password, newPassword: 'ChangedPassword-123!' })
    .expect(204);

  await assertMobileStateClosed(user.id, state, 'password_changed');
  await request(app)
    .get('/api/mobile/notifications')
    .set('Authorization', `Bearer ${state.accessToken}`)
    .expect(401)
    .expect((response) => assert.equal(response.body.error.code, 'DEVICE_REVOKED'));

  const sent = [];
  const result = await processMobilePushOutbox({
    messaging: { send: async (message) => { sent.push(message); return 'message-id'; } }
  });
  assert.deepEqual(result, { claimed: 1, delivered: 1, retried: 0, failed: 0 });
  assert.deepEqual(sent[0].data, {
    kind: 'device_revoked',
    deviceId: state.deviceId,
    deploymentId: 'mt-workspace-test',
    environment: 'test',
    targetDeviceId: state.deviceId
  });
  assert.equal(sent[0].token, state.fcmToken);
  const device = await query('SELECT fcm_token_ciphertext FROM mobile_devices WHERE id = $1', [state.deviceId]);
  assert.equal(device.rows[0].fcm_token_ciphertext, null);
});

test('mobile self-disconnect is idempotent and closes login requests for the last device', async () => {
  const user = await createUser('self-disconnect');
  const state = await createMobileState(user.id, 'self-disconnect');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await request(app)
      .delete(`/api/mobile/devices/${state.deviceId}`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .expect(204);
  }

  const device = await query('SELECT revoked_at, revocation_reason FROM mobile_devices WHERE id = $1', [state.deviceId]);
  assert.ok(device.rows[0].revoked_at);
  assert.equal(device.rows[0].revocation_reason, 'mobile_self_disconnect');
  const login = await query('SELECT status FROM mobile_login_requests WHERE id = $1', [state.loginRequestId]);
  assert.equal(login.rows[0].status, 'denied');
  const revokePushes = await query(
    `SELECT payload FROM mobile_push_outbox
     WHERE device_id = $1 AND kind = 'device_revoked'`,
    [state.deviceId]
  );
  assert.equal(revokePushes.rowCount, 1);
  assert.deepEqual(revokePushes.rows[0].payload, {
    kind: 'device_revoked',
    deviceId: state.deviceId
  });
});

test('web revoke is atomic and does not consume recovery code when blocking the last device', async () => {
  const user = await createUser('web-revoke');
  const agent = await loginAgent(user.email, user.password);
  const secret = encryptTwoFactorSecret(generateTwoFactorSecret());
  await query(
    `UPDATE users
     SET two_factor_enabled = TRUE, two_factor_method = 'mt_workspace',
         two_factor_confirmed_at = NOW(), two_factor_secret_ciphertext = $1,
         two_factor_secret_iv = $2, two_factor_secret_tag = $3
     WHERE id = $4`,
    [secret.ciphertext, secret.iv, secret.tag, user.id]
  );
  const recoveryCodes = ['WEBR-EVOK-EONE', 'WEBR-EVOK-ETWO'];
  for (const code of recoveryCodes) {
    await query(
      'INSERT INTO user_two_factor_recovery_codes (user_id, code_hash) VALUES ($1, $2)',
      [user.id, hashTwoFactorRecoveryCode(code)]
    );
  }
  const first = await createMobileState(user.id, 'web-revoke-first');
  const second = await createMobileState(user.id, 'web-revoke-second');

  await agent
    .delete(`/api/users/profile/mobile-devices/${first.deviceId}`)
    .send({ code: recoveryCodes[0] })
    .expect(204);
  const firstDevice = await query('SELECT revoked_at, revocation_reason FROM mobile_devices WHERE id = $1', [first.deviceId]);
  assert.ok(firstDevice.rows[0].revoked_at);
  assert.equal(firstDevice.rows[0].revocation_reason, 'web_profile');
  const stillPending = await query('SELECT status FROM mobile_login_requests WHERE id = $1', [second.loginRequestId]);
  assert.equal(stillPending.rows[0].status, 'pending');

  await agent
    .delete(`/api/users/profile/mobile-devices/${second.deviceId}`)
    .send({ code: recoveryCodes[1] })
    .expect(409)
    .expect((response) => assert.equal(response.body.error.code, 'LAST_MOBILE_DEVICE'));
  const secondDevice = await query('SELECT revoked_at FROM mobile_devices WHERE id = $1', [second.deviceId]);
  assert.equal(secondDevice.rows[0].revoked_at, null);
  const secondCode = await query(
    'SELECT used_at FROM user_two_factor_recovery_codes WHERE user_id = $1 AND code_hash = $2',
    [user.id, hashTwoFactorRecoveryCode(recoveryCodes[1])]
  );
  assert.equal(secondCode.rows[0].used_at, null);
});

test('disabling MT 2FA revokes devices, pairings, requests, and recovery codes', async () => {
  const user = await createUser('disable-cleanup');
  const agent = await loginAgent(user.email, user.password);
  const secret = encryptTwoFactorSecret(generateTwoFactorSecret());
  await query(
    `UPDATE users
     SET two_factor_enabled = TRUE, two_factor_method = 'mt_workspace',
         two_factor_confirmed_at = NOW(), two_factor_secret_ciphertext = $1,
         two_factor_secret_iv = $2, two_factor_secret_tag = $3
     WHERE id = $4`,
    [secret.ciphertext, secret.iv, secret.tag, user.id]
  );
  const recoveryCode = 'ABCD-EFGH-JK';
  await query(
    'INSERT INTO user_two_factor_recovery_codes (user_id, code_hash) VALUES ($1, $2)',
    [user.id, hashTwoFactorRecoveryCode(recoveryCode)]
  );
  const state = await createMobileState(user.id, 'disable-cleanup');

  await agent.post('/api/users/profile/2fa/disable').send({ code: recoveryCode }).expect(200);

  await assertMobileStateClosed(user.id, state, 'two_factor_disabled');
  const storedUser = await query(
    'SELECT two_factor_enabled, two_factor_method FROM users WHERE id = $1',
    [user.id]
  );
  assert.equal(storedUser.rows[0].two_factor_enabled, false);
  assert.equal(storedUser.rows[0].two_factor_method, null);
  const codes = await query('SELECT id FROM user_two_factor_recovery_codes WHERE user_id = $1', [user.id]);
  assert.equal(codes.rowCount, 0);
});

test('admin rejection invalidates mobile access in the same transaction', async () => {
  const user = await createUser('rejection-cleanup');
  const state = await createMobileState(user.id, 'rejection-cleanup');
  const admin = await loginAgent(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);

  await admin.patch(`/api/admin/users/${user.id}/status`).send({ status: 'rejected' }).expect(200);

  await assertMobileStateClosed(user.id, state, 'user_rejected');
  const device = await query('SELECT revoked_by FROM mobile_devices WHERE id = $1', [state.deviceId]);
  assert.equal(device.rows[0].revoked_by, adminId);
  await request(app)
    .get('/api/mobile/notifications')
    .set('Authorization', `Bearer ${state.accessToken}`)
    .expect(401)
    .expect((response) => assert.equal(response.body.error.code, 'INVALID_DEVICE_TOKEN'));
});

test('admin deletion cascades mobile credentials while preserving redacted security audit', async () => {
  const user = await createUser('deletion-cleanup');
  const state = await createMobileState(user.id, 'deletion-cleanup');
  const admin = await loginAgent(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);

  await admin.delete(`/api/admin/users/${user.id}`).expect(204);

  for (const [table, id] of [
    ['users', user.id],
    ['mobile_devices', state.deviceId],
    ['mobile_pairings', state.pairingId],
    ['mobile_login_requests', state.loginRequestId]
  ]) {
    const result = await query(`SELECT id FROM ${table} WHERE id = $1`, [id]);
    assert.equal(result.rowCount, 0);
  }
  const audit = await query(
    `SELECT user_id, device_id, metadata
     FROM mobile_security_events
     WHERE event_type = 'mobile_access_revoked'
       AND metadata->>'targetUserId' = $1`,
    [user.id]
  );
  assert.equal(audit.rowCount, 1);
  assert.equal(audit.rows[0].user_id, null);
  assert.equal(audit.rows[0].device_id, null);
  assert.equal(audit.rows[0].metadata.reason, 'user_deleted');
});
