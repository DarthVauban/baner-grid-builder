import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto, { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://mobile-multi-account-qr-login-tests';
process.env.JWT_SECRET = 'mobile-multi-account-qr-test-secret-123456789';
process.env.MOBILE_TOKEN_PEPPER = 'mobile-multi-account-pepper-123456789012';
process.env.MOBILE_DEPLOYMENT_ID = 'mt-workspace-test';
process.env.MOBILE_ENVIRONMENT = 'test';
process.env.MOBILE_DEPLOYMENT_NAME = 'MT Workspace Test';
process.env.MOBILE_PUBLIC_ORIGIN = 'https://test.mt-panel.sbs';
process.env.MOBILE_API_BASE_URL = 'https://test.mt-panel.sbs/api';
process.env.MOBILE_QR_LOGIN_ENABLED = 'true';
process.env.MOBILE_MULTI_ACCOUNT_PAIRING_ENABLED = 'true';
process.env.MOBILE_QR_LOGIN_TTL_SECONDS = '120';
process.env.COOKIE_SECURE = 'false';

const { default: app } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const { pool, query } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const {
  hashDeviceAccessToken,
  hashFcmToken,
  hashQrApprovalNonce,
  hashQrBrowserToken,
  hashQrScanToken
} = await import('../src/modules/mobile/mobile-crypto.js');
const {
  revokeMobileDevice,
  setMobileDevicePushToken
} = await import('../src/modules/mobile/mobile-device.service.js');
const {
  canonicalQrLoginSignature
} = await import('../src/modules/mobile/mobile-qr-login.service.js');
const { createMobilePairing } = await import('../src/modules/mobile/mobile-pairing.service.js');
const { processMobilePushOutbox } = await import('../src/modules/mobile/mobile-push.worker.js');
const { hashTwoFactorRecoveryCode } = await import('../src/modules/auth/two-factor.service.js');

let sequence = 0;

before(async () => {
  await runMigrations();
});

beforeEach(async () => {
  await query('DELETE FROM mobile_push_outbox');
});

after(async () => {
  await pool.end();
});

async function createUser(label, { twoFactor = false } = {}) {
  sequence += 1;
  const passwordHash = await bcrypt.hash(`Password-${label}-123!`, 4);
  const result = await query(
    `INSERT INTO users (
       name, first_name, last_name, email, password_hash, role, status,
       two_factor_enabled, two_factor_method
     ) VALUES ($1, $2, $3, $4, $5, 'admin', 'approved', $6, $7)
     RETURNING *`,
    [
      `QR ${label}`,
      'QR',
      label,
      `${label}-${sequence}@test.local`,
      passwordHash,
      twoFactor,
      twoFactor ? 'mt_workspace' : null
    ]
  );
  return result.rows[0];
}

function createSigningKey() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicKeyJwk = publicKey.export({ format: 'jwk' });
  return { privateKey, publicKeyJwk, keyId: `device-key-${randomUUID()}` };
}

async function createDevice(userId, label, signingKey = null) {
  const accessToken = crypto.randomBytes(32).toString('base64url');
  const result = await query(
    `INSERT INTO mobile_devices (
       user_id, name, platform, access_token_hash,
       auth_key_id, auth_public_key, auth_key_algorithm, auth_key_version,
       auth_key_registered_at
     ) VALUES ($1, $2, 'android', $3, $4, $5::JSONB, $6, $7, $8)
     RETURNING *`,
    [
      userId,
      label,
      hashDeviceAccessToken(accessToken),
      signingKey?.keyId || null,
      signingKey ? JSON.stringify(signingKey.publicKeyJwk) : null,
      signingKey ? 'ES256' : null,
      signingKey ? 1 : null,
      signingKey ? new Date() : null
    ]
  );
  return { ...result.rows[0], accessToken };
}

function qrParts(qrPayload) {
  const parsed = new URL(qrPayload);
  return {
    challengeId: parsed.searchParams.get('challengeId'),
    scanToken: parsed.searchParams.get('token')
  };
}

function signDecision(privateKey, input) {
  return crypto.sign(
    'sha256',
    Buffer.from(canonicalQrLoginSignature(input), 'utf8'),
    { key: privateKey, dsaEncoding: 'ieee-p1363' }
  ).toString('base64url');
}

test('one FCM token remains linked to multiple accounts and updates stay device-scoped', async () => {
  const userA = await createUser('fcm-a');
  const userB = await createUser('fcm-b');
  const deviceA = await createDevice(userA.id, 'FCM A');
  const deviceB = await createDevice(userB.id, 'FCM B');
  const sharedToken = 'shared-fcm-registration-token-for-two-independent-accounts';
  const installationId = randomUUID();

  await setMobileDevicePushToken(userA.id, deviceA.id, sharedToken, 'android', installationId);
  await setMobileDevicePushToken(userB.id, deviceB.id, sharedToken, 'android', installationId);
  let devices = await query(
    `SELECT id, fcm_token_hash, installation_id_hash, fcm_token_ciphertext
     FROM mobile_devices WHERE id IN ($1, $2) ORDER BY id`,
    [deviceA.id, deviceB.id]
  );
  assert.equal(devices.rows.length, 2);
  assert.ok(devices.rows.every((device) => device.fcm_token_hash === hashFcmToken(sharedToken)));
  assert.ok(devices.rows.every((device) => device.fcm_token_ciphertext));
  assert.equal(devices.rows[0].installation_id_hash, devices.rows[1].installation_id_hash);

  await setMobileDevicePushToken(userA.id, deviceA.id, `${sharedToken}-rotated`, 'android');
  devices = await query(
    'SELECT id, fcm_token_hash FROM mobile_devices WHERE id IN ($1, $2)',
    [deviceA.id, deviceB.id]
  );
  assert.equal(devices.rows.find((device) => device.id === deviceB.id).fcm_token_hash, hashFcmToken(sharedToken));
  assert.equal(devices.rows.find((device) => device.id === deviceA.id).fcm_token_hash, hashFcmToken(`${sharedToken}-rotated`));

  await revokeMobileDevice(userA.id, deviceA.id, { allowLast: true, queuePush: false, reason: 'test' });
  const unaffected = await query('SELECT fcm_token_hash, revoked_at FROM mobile_devices WHERE id = $1', [deviceB.id]);
  assert.equal(unaffected.rows[0].fcm_token_hash, hashFcmToken(sharedToken));
  assert.equal(unaffected.rows[0].revoked_at, null);
});

test('permanent invalid FCM response clears every matching row while transient errors preserve tokens', async () => {
  const userA = await createUser('invalid-a');
  const userB = await createUser('invalid-b');
  const deviceA = await createDevice(userA.id, 'Invalid A');
  const deviceB = await createDevice(userB.id, 'Invalid B');
  const sharedToken = 'shared-invalid-fcm-registration-token-for-two-accounts';
  await setMobileDevicePushToken(userA.id, deviceA.id, sharedToken, 'android');
  await setMobileDevicePushToken(userB.id, deviceB.id, sharedToken, 'android');
  for (const device of [deviceA, deviceB]) {
    await query(
      `INSERT INTO mobile_push_outbox (device_id, kind, payload)
       VALUES ($1, 'device_revoked', $2::JSONB)`,
      [device.id, JSON.stringify({ kind: 'device_revoked', deviceId: device.id })]
    );
  }
  const invalidError = new Error('invalid');
  invalidError.code = 'messaging/registration-token-not-registered';
  await processMobilePushOutbox({ messaging: { send: async () => { throw invalidError; } } });
  let stored = await query(
    'SELECT fcm_token_hash FROM mobile_devices WHERE id IN ($1, $2)',
    [deviceA.id, deviceB.id]
  );
  assert.ok(stored.rows.every((device) => device.fcm_token_hash === null));
  const invalidated = await query(
    `SELECT COUNT(*)::INTEGER AS count FROM mobile_security_events
     WHERE event_type = 'fcm_token_invalidated'`
  );
  assert.equal(invalidated.rows[0].count, 2);

  const transientToken = `${sharedToken}-transient`;
  await setMobileDevicePushToken(userA.id, deviceA.id, transientToken, 'android');
  await query(
    `INSERT INTO mobile_push_outbox (device_id, kind, payload)
     VALUES ($1, 'device_revoked', $2::JSONB)`,
    [deviceA.id, JSON.stringify({ kind: 'device_revoked', deviceId: deviceA.id })]
  );
  const transientError = new Error('retry');
  transientError.code = 'messaging/internal-error';
  await processMobilePushOutbox({ messaging: { send: async () => { throw transientError; } } });
  stored = await query('SELECT fcm_token_hash FROM mobile_devices WHERE id = $1', [deviceA.id]);
  assert.equal(stored.rows[0].fcm_token_hash, hashFcmToken(transientToken));
});

test('legacy device can register one ES256 auth key with 2FA and cannot replace it', async () => {
  const user = await createUser('legacy-key', { twoFactor: true });
  const device = await createDevice(user.id, 'Legacy device');
  const recoveryCode = 'ABCD-EFGHJK';
  await query(
    `INSERT INTO user_two_factor_recovery_codes (user_id, code_hash)
     VALUES ($1, $2)`,
    [user.id, hashTwoFactorRecoveryCode(recoveryCode)]
  );
  const signingKey = createSigningKey();
  const registered = await request(app)
    .put(`/api/mobile/devices/${device.id}/auth-key`)
    .set('Authorization', `Bearer ${device.accessToken}`)
    .send({
      keyId: signingKey.keyId,
      algorithm: 'ES256',
      publicKeyJwk: signingKey.publicKeyJwk,
      totpCode: recoveryCode
    })
    .expect(201);
  assert.deepEqual(registered.body.data, { keyId: signingKey.keyId, algorithm: 'ES256', version: 1 });

  await request(app)
    .put(`/api/mobile/devices/${device.id}/auth-key`)
    .set('Authorization', `Bearer ${device.accessToken}`)
    .send({
      keyId: `${signingKey.keyId}-replacement`,
      algorithm: 'ES256',
      publicKeyJwk: signingKey.publicKeyJwk,
      totpCode: recoveryCode
    })
    .expect(409)
    .expect((response) => assert.equal(response.body.error.code, 'DEVICE_AUTH_KEY_ALREADY_REGISTERED'));

  const otherDevice = await createDevice(user.id, 'Other legacy device');
  await request(app)
    .put(`/api/mobile/devices/${otherDevice.id}/auth-key`)
    .set('Authorization', `Bearer ${device.accessToken}`)
    .send({
      keyId: `${signingKey.keyId}-cross-device`,
      algorithm: 'ES256',
      publicKeyJwk: signingKey.publicKeyJwk,
      totpCode: recoveryCode
    })
    .expect(404)
    .expect((response) => assert.equal(response.body.error.code, 'MOBILE_DEVICE_NOT_FOUND'));
});

test('pairing remains backward compatible and accepts optional installation and ES256 key metadata', async () => {
  const legacyUser = await createUser('pairing-legacy');
  env.mobileMultiAccountPairingEnabled = false;
  try {
    const legacyPairing = await createMobilePairing(legacyUser.id, { purpose: 'enable_2fa' });
    assert.match(legacyPairing.qrPayload, /^mtworkspace:\/\/pair\?token=/);
    const legacyClaim = await request(app)
      .post('/api/mobile/pairings/claim')
      .send({ pairingToken: legacyPairing.qrPayload, platform: 'android', deviceName: 'Legacy Android' })
      .expect(201);
    assert.equal(legacyClaim.body.data.workspace.deploymentId, 'mt-workspace-test');
    assert.equal(legacyClaim.body.data.workspace.webOrigin, 'https://test.mt-panel.sbs');
  } finally {
    env.mobileMultiAccountPairingEnabled = true;
  }

  const modernUser = await createUser('pairing-modern');
  const signingKey = createSigningKey();
  const pairing = await createMobilePairing(modernUser.id, { purpose: 'enable_2fa' });
  const parsed = new URL(pairing.qrPayload);
  assert.equal(parsed.searchParams.get('v'), '2');
  assert.equal(parsed.searchParams.get('deploymentId'), 'mt-workspace-test');
  assert.equal(parsed.searchParams.get('issuer'), 'https://test.mt-panel.sbs');
  const claimed = await request(app)
    .post('/api/mobile/pairings/claim')
    .send({
      pairingToken: pairing.qrPayload,
      platform: 'android',
      deviceName: 'Modern Android',
      installationId: randomUUID(),
      authKey: {
        keyId: signingKey.keyId,
        algorithm: 'ES256',
        publicKeyJwk: signingKey.publicKeyJwk,
        version: 1
      }
    })
    .expect(201);
  const stored = await query(
    `SELECT installation_id_hash, auth_key_id, auth_public_key, auth_key_algorithm
     FROM mobile_devices WHERE id = $1`,
    [claimed.body.data.deviceId]
  );
  assert.ok(stored.rows[0].installation_id_hash);
  assert.equal(stored.rows[0].auth_key_id, signingKey.keyId);
  assert.equal(stored.rows[0].auth_public_key.crv, 'P-256');
  assert.equal(stored.rows[0].auth_key_algorithm, 'ES256');

  const invalidUser = await createUser('pairing-invalid-key');
  const invalidPairing = await createMobilePairing(invalidUser.id, { purpose: 'enable_2fa' });
  await request(app)
    .post('/api/mobile/pairings/claim')
    .send({
      pairingToken: invalidPairing.qrPayload,
      platform: 'android',
      deviceName: 'Wrong curve',
      installationId: 'not-a-uuid',
      authKey: {
        keyId: signingKey.keyId,
        algorithm: 'ES256',
        publicKeyJwk: { ...signingKey.publicKeyJwk, crv: 'P-384' }
      }
    })
    .expect(422);
});

test('QR login requires a signed device decision and creates one ordinary web session', async () => {
  const user = await createUser('qr-approve');
  const signingKey = createSigningKey();
  const device = await createDevice(user.id, 'QR device', signingKey);
  const web = request.agent(app);
  const created = await web
    .post('/api/auth/login/qr')
    .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0.0.0')
    .send({ returnPath: '/tools?from=qr' })
    .expect(201);
  const challenge = created.body.data;
  assert.equal(challenge.deployment.deploymentId, 'mt-workspace-test');
  assert.equal(challenge.deployment.environment, 'test');
  assert.equal(challenge.pollAfterMs, 1000);
  assert.equal(JSON.stringify(challenge).includes(user.email), false);
  const parts = qrParts(challenge.qrPayload);
  assert.equal(parts.challengeId, challenge.challengeId);
  assert.ok(parts.scanToken);
  assert.equal(challenge.qrPayload.includes(challenge.browserToken), false);

  const stored = await query('SELECT * FROM mobile_qr_login_challenges WHERE id = $1', [challenge.challengeId]);
  assert.equal(stored.rows[0].scan_token_hash, hashQrScanToken(parts.scanToken));
  assert.equal(stored.rows[0].browser_token_hash, hashQrBrowserToken(challenge.browserToken));
  assert.equal(JSON.stringify(stored.rows[0]).includes(parts.scanToken), false);
  assert.equal(JSON.stringify(stored.rows[0]).includes(challenge.browserToken), false);

  await web
    .post('/api/auth/login/qr/status')
    .send({ challengeId: parts.challengeId, browserToken: `${challenge.browserToken}-wrong` })
    .expect(404)
    .expect((response) => assert.equal(response.body.error.code, 'INVALID_QR_BROWSER_TOKEN'));
  await request(app)
    .post('/api/mobile/qr-login/preview')
    .set('Authorization', `Bearer ${device.accessToken}`)
    .send({ challengeId: parts.challengeId, scanToken: `${parts.scanToken}-wrong` })
    .expect(404)
    .expect((response) => assert.equal(response.body.error.code, 'INVALID_QR_SCAN_TOKEN'));

  const preview = await request(app)
    .post('/api/mobile/qr-login/preview')
    .set('Authorization', `Bearer ${device.accessToken}`)
    .send(parts)
    .expect(200);
  assert.equal(preview.body.data.request.browser, 'Chrome 140');
  assert.equal(preview.body.data.request.operatingSystem, 'Windows');
  assert.equal(preview.body.data.request.location, 'Місце не визначено');
  assert.equal(preview.body.data.signatureVersion, 1);
  assert.equal(
    (await query('SELECT approval_nonce_hash FROM mobile_qr_login_challenges WHERE id = $1', [parts.challengeId]))
      .rows[0].approval_nonce_hash,
    hashQrApprovalNonce(preview.body.data.approvalNonce)
  );

  const signatureInput = {
    action: 'approve',
    deploymentId: 'mt-workspace-test',
    challengeId: parts.challengeId,
    deviceId: device.id,
    approvalNonce: preview.body.data.approvalNonce,
    expiresAt: challenge.expiresAt
  };
  await request(app)
    .post('/api/mobile/qr-login/approve')
    .set('Authorization', `Bearer ${device.accessToken}`)
    .send({
      ...parts,
      approvalNonce: preview.body.data.approvalNonce,
      keyId: signingKey.keyId,
      signature: signDecision(signingKey.privateKey, signatureInput),
      signatureVersion: 1
    })
    .expect(200)
    .expect((response) => assert.equal(response.body.data.status, 'approved'));

  await web
    .post('/api/auth/login/qr/status')
    .send({ challengeId: parts.challengeId, browserToken: challenge.browserToken })
    .expect(200)
    .expect((response) => assert.equal(response.body.data.status, 'approved'));
  const consumed = await web
    .post('/api/auth/login/qr/consume')
    .send({ challengeId: parts.challengeId, browserToken: challenge.browserToken })
    .expect(200);
  assert.equal(consumed.body.data.user.id, user.id);
  assert.equal(consumed.body.data.returnPath, '/tools?from=qr');
  assert.ok(consumed.headers['set-cookie']?.some((cookie) => cookie.startsWith('mt_session=')));
  await web.get('/api/auth/me').expect(200).expect((response) => assert.equal(response.body.data.id, user.id));
  await web
    .post('/api/auth/login/qr/consume')
    .send({ challengeId: parts.challengeId, browserToken: challenge.browserToken })
    .expect(409)
    .expect((response) => assert.equal(response.body.error.code, 'QR_LOGIN_ALREADY_CONSUMED'));

  const events = await query(
    'SELECT event_type, metadata FROM mobile_security_events WHERE qr_login_challenge_id = $1',
    [parts.challengeId]
  );
  const audit = JSON.stringify(events.rows);
  assert.equal(audit.includes(parts.scanToken), false);
  assert.equal(audit.includes(challenge.browserToken), false);
  assert.equal(audit.includes(preview.body.data.approvalNonce), false);
});

test('QR login rejects invalid signatures, supports deny/expiry, and blocks open redirects', async () => {
  const user = await createUser('qr-negative');
  const signingKey = createSigningKey();
  const device = await createDevice(user.id, 'Negative QR device', signingKey);
  const web = request.agent(app);
  const created = await web
    .post('/api/auth/login/qr')
    .send({ returnPath: 'https://evil.example/steal' })
    .expect(201);
  const challenge = created.body.data;
  const parts = qrParts(challenge.qrPayload);
  const preview = await request(app)
    .post('/api/mobile/qr-login/preview')
    .set('Authorization', `Bearer ${device.accessToken}`)
    .send(parts)
    .expect(200);
  const decisionBody = {
    ...parts,
    approvalNonce: preview.body.data.approvalNonce,
    keyId: signingKey.keyId,
    signature: Buffer.alloc(64).toString('base64url'),
    signatureVersion: 1
  };
  await request(app)
    .post('/api/mobile/qr-login/deny')
    .set('Authorization', `Bearer ${device.accessToken}`)
    .send(decisionBody)
    .expect(401)
    .expect((response) => assert.equal(response.body.error.code, 'INVALID_DEVICE_SIGNATURE'));
  decisionBody.signature = signDecision(signingKey.privateKey, {
    action: 'deny',
    deploymentId: 'mt-workspace-test',
    challengeId: parts.challengeId,
    deviceId: device.id,
    approvalNonce: preview.body.data.approvalNonce,
    expiresAt: challenge.expiresAt
  });
  await request(app)
    .post('/api/mobile/qr-login/deny')
    .set('Authorization', `Bearer ${device.accessToken}`)
    .send(decisionBody)
    .expect(200);
  await web
    .post('/api/auth/login/qr/consume')
    .send({ challengeId: parts.challengeId, browserToken: challenge.browserToken })
    .expect(409)
    .expect((response) => assert.equal(response.body.error.code, 'QR_LOGIN_DENIED'));

  const cancellable = await web.post('/api/auth/login/qr').send({ returnPath: '//evil.example' }).expect(201);
  await web
    .post('/api/auth/login/qr/cancel')
    .send({
      challengeId: cancellable.body.data.challengeId,
      browserToken: cancellable.body.data.browserToken
    })
    .expect(204);
  await web
    .post('/api/auth/login/qr/consume')
    .send({
      challengeId: cancellable.body.data.challengeId,
      browserToken: cancellable.body.data.browserToken
    })
    .expect(409)
    .expect((response) => assert.equal(response.body.error.code, 'QR_LOGIN_CANCELLED'));

  const expiring = await web.post('/api/auth/login/qr').send({ returnPath: '/' }).expect(201);
  await query(
    `UPDATE mobile_qr_login_challenges SET expires_at = NOW() - INTERVAL '1 second'
     WHERE id = $1`,
    [expiring.body.data.challengeId]
  );
  await web
    .post('/api/auth/login/qr/status')
    .send({ challengeId: expiring.body.data.challengeId, browserToken: expiring.body.data.browserToken })
    .expect(200)
    .expect((response) => assert.equal(response.body.data.status, 'expired'));
  await web
    .post('/api/auth/login/qr/consume')
    .send({
      challengeId: expiring.body.data.challengeId,
      browserToken: expiring.body.data.browserToken
    })
    .expect(410)
    .expect((response) => assert.equal(response.body.error.code, 'QR_LOGIN_EXPIRED'));
});

test('an approved QR login is invalidated when its approving device is revoked', async () => {
  const user = await createUser('qr-revoked');
  const signingKey = createSigningKey();
  const device = await createDevice(user.id, 'Revoked QR device', signingKey);
  const web = request.agent(app);
  const created = await web.post('/api/auth/login/qr').send({ returnPath: '/safe' }).expect(201);
  const challenge = created.body.data;
  const parts = qrParts(challenge.qrPayload);
  const preview = await request(app)
    .post('/api/mobile/qr-login/preview')
    .set('Authorization', `Bearer ${device.accessToken}`)
    .send(parts)
    .expect(200);
  await request(app)
    .post('/api/mobile/qr-login/approve')
    .set('Authorization', `Bearer ${device.accessToken}`)
    .send({
      ...parts,
      approvalNonce: preview.body.data.approvalNonce,
      keyId: signingKey.keyId,
      signature: signDecision(signingKey.privateKey, {
        action: 'approve',
        deploymentId: 'mt-workspace-test',
        challengeId: parts.challengeId,
        deviceId: device.id,
        approvalNonce: preview.body.data.approvalNonce,
        expiresAt: challenge.expiresAt
      }),
      signatureVersion: 1
    })
    .expect(200);

  await revokeMobileDevice(user.id, device.id, { allowLast: true, queuePush: false, reason: 'security_test' });
  await web
    .post('/api/auth/login/qr/consume')
    .send({ challengeId: parts.challengeId, browserToken: challenge.browserToken })
    .expect(409)
    .expect((response) => assert.equal(response.body.error.code, 'QR_LOGIN_CANCELLED'));
});

test('QR config and feature flag fail closed without affecting password routes', async () => {
  await request(app)
    .get('/api/auth/login/qr/config')
    .expect(200)
    .expect((response) => {
      assert.equal(response.body.data.enabled, true);
      assert.equal(response.body.data.deployment.webOrigin, 'https://test.mt-panel.sbs');
    });
  await request(app)
    .post('/api/auth/login/qr')
    .set('Origin', 'https://evil.example')
    .send({ returnPath: '/' })
    .expect(403)
    .expect((response) => assert.equal(response.body.error.code, 'QR_LOGIN_ORIGIN_REJECTED'));
  env.mobileQrLoginEnabled = false;
  try {
    await request(app)
      .post('/api/auth/login/qr')
      .send({ returnPath: '/' })
      .expect(404)
      .expect((response) => assert.equal(response.body.error.code, 'QR_LOGIN_DISABLED'));
    await request(app).post('/api/auth/login').send({ email: 'missing@test.local', password: 'wrong' }).expect(401);
  } finally {
    env.mobileQrLoginEnabled = true;
  }
});

test('anonymous QR challenge creation is rate limited by client IP', async () => {
  for (let attempt = 0; attempt < env.MOBILE_QR_CREATE_RATE_LIMIT; attempt += 1) {
    await request(app)
      .post('/api/auth/login/qr')
      .set('X-Forwarded-For', '198.51.100.77')
      .send({ returnPath: '/' })
      .expect(201);
  }
  await request(app)
    .post('/api/auth/login/qr')
    .set('X-Forwarded-For', '198.51.100.77')
    .send({ returnPath: '/' })
    .expect(429)
    .expect((response) => assert.equal(response.body.error.code, 'TOO_MANY_QR_LOGIN_ATTEMPTS'));
});
