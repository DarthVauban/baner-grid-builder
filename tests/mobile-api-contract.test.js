import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://mobile-api-contract-tests';
process.env.JWT_SECRET = 'mobile-api-contract-test-secret-123456789';
process.env.MOBILE_TOKEN_PEPPER = 'mobile-api-pepper-test-secret-123456789';
process.env.COOKIE_SECURE = 'false';
process.env.ADMIN_NAME = 'Mobile API Admin';
process.env.ADMIN_EMAIL = 'mobile-api-admin@test.local';
process.env.ADMIN_PASSWORD = 'MobileApiPassword123!';

const { default: app } = await import('../src/app.js');
const { pool, query } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
});

after(async () => {
  await pool.end();
});

test('mobile pairing and device APIs preserve the fixed app contract', async () => {
  const web = request.agent(app);
  const login = await web
    .post('/api/auth/login')
    .send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
    .expect(200);
  const userId = login.body.data.id;

  const pairing = await web
    .post('/api/users/profile/mobile-pairings')
    .send({ purpose: 'enable_2fa', code: null })
    .expect(201);
  assert.deepEqual(Object.keys(pairing.body.data).sort(), [
    'expiresAt',
    'id',
    'manualCode',
    'qrPayload',
    'status'
  ]);
  assert.equal(pairing.body.data.status, 'pending');
  assert.match(pairing.body.data.qrPayload, /^mtworkspace:\/\/pair\?token=/);

  const firstClaim = await request(app)
    .post('/api/mobile/pairings/claim')
    .send({
      pairingToken: pairing.body.data.qrPayload,
      platform: 'android',
      deviceName: 'Pixel 10 · Android 16'
    })
    .expect(201);
  assert.deepEqual(Object.keys(firstClaim.body.data).sort(), [
    'accessToken',
    'deviceId',
    'deviceName',
    'email',
    'pairedAt',
    'totpSecret',
    'userId',
    'userName'
  ]);
  assert.equal(firstClaim.body.data.userId, userId);
  assert.equal(firstClaim.body.data.email, process.env.ADMIN_EMAIL);
  assert.equal(firstClaim.body.data.deviceName, 'Pixel 10 · Android 16');
  assert.match(firstClaim.body.data.accessToken, /^[A-Za-z0-9_-]{43}$/);
  assert.match(firstClaim.body.data.totpSecret, /^[A-Z2-7]+$/);
  assert.match(firstClaim.body.data.pairedAt, /^\d{4}-\d{2}-\d{2}T/);

  const rawQrToken = new URL(pairing.body.data.qrPayload).searchParams.get('token');
  const storedPairing = await query('SELECT * FROM mobile_pairings WHERE id = $1', [pairing.body.data.id]);
  const storedDevice = await query('SELECT * FROM mobile_devices WHERE id = $1', [firstClaim.body.data.deviceId]);
  assert.equal(JSON.stringify(storedPairing.rows[0]).includes(rawQrToken), false);
  assert.equal(JSON.stringify(storedPairing.rows[0]).includes(firstClaim.body.data.totpSecret), false);
  assert.equal(JSON.stringify(storedDevice.rows[0]).includes(firstClaim.body.data.accessToken), false);

  const claimedStatus = await web
    .get(`/api/users/profile/mobile-pairings/${pairing.body.data.id}`)
    .expect(200);
  assert.equal(claimedStatus.body.data.status, 'claimed');
  assert.equal(claimedStatus.body.data.device.id, firstClaim.body.data.deviceId);
  assert.equal(claimedStatus.body.data.recoveryCodes.length, 10);
  const recoveryCodes = claimedStatus.body.data.recoveryCodes;

  const twoFactorStatus = await web.get('/api/users/profile/2fa').expect(200);
  assert.deepEqual(twoFactorStatus.body.data, {
    enabled: true,
    method: 'mt_workspace',
    confirmedAt: twoFactorStatus.body.data.confirmedAt,
    recoveryCodesRemaining: 10,
    activeMobileDeviceCount: 1
  });
  assert.match(twoFactorStatus.body.data.confirmedAt, /^\d{4}-\d{2}-\d{2}T/);

  await request(app)
    .post('/api/mobile/pairings/claim')
    .send({
      pairingToken: rawQrToken,
      platform: 'android',
      deviceName: 'Replay device'
    })
    .expect(409)
    .expect((response) => assert.equal(response.body.error.code, 'PAIRING_REPLAYED'));

  const cancelledPairing = await web
    .post('/api/users/profile/mobile-pairings')
    .send({ purpose: 'add_device', code: recoveryCodes[0] })
    .expect(201);
  await web
    .delete(`/api/users/profile/mobile-pairings/${cancelledPairing.body.data.id}`)
    .expect(204);
  await request(app)
    .post('/api/mobile/pairings/claim')
    .send({
      pairingToken: cancelledPairing.body.data.manualCode,
      platform: 'android',
      deviceName: 'Cancelled device'
    })
    .expect(409)
    .expect((response) => assert.equal(response.body.error.code, 'PAIRING_CANCELLED'));

  const expiredPairing = await web
    .post('/api/users/profile/mobile-pairings')
    .send({ purpose: 'add_device', code: recoveryCodes[1] })
    .expect(201);
  await query('UPDATE mobile_pairings SET expires_at = $1 WHERE id = $2', [
    new Date(Date.now() - 60_000),
    expiredPairing.body.data.id
  ]);
  await request(app)
    .post('/api/mobile/pairings/claim')
    .send({
      pairingToken: expiredPairing.body.data.manualCode,
      platform: 'ios',
      deviceName: 'Expired device'
    })
    .expect(410)
    .expect((response) => assert.equal(response.body.error.code, 'PAIRING_EXPIRED'));

  const secondPairing = await web
    .post('/api/users/profile/mobile-pairings')
    .send({ purpose: 'add_device', code: recoveryCodes[2] })
    .expect(201);
  const secondClaim = await request(app)
    .post('/api/mobile/pairings/claim')
    .send({
      pairingToken: secondPairing.body.data.manualCode.toLowerCase().replaceAll('-', ' '),
      platform: 'ios',
      deviceName: 'iPhone 18 Pro'
    })
    .expect(201);
  assert.equal(secondClaim.body.data.totpSecret, firstClaim.body.data.totpSecret);

  await web
    .post(`/api/users/profile/mobile-pairings/${pairing.body.data.id}/acknowledge`)
    .expect(204);
  const acknowledged = await web
    .get(`/api/users/profile/mobile-pairings/${pairing.body.data.id}`)
    .expect(200);
  assert.equal('recoveryCodes' in acknowledged.body.data, false);

  const pushToken = 'test-fcm-registration-token-that-is-long-enough';
  await request(app)
    .put(`/api/mobile/devices/${firstClaim.body.data.deviceId}/push-token`)
    .set('Authorization', `Bearer ${firstClaim.body.data.accessToken}`)
    .send({ token: pushToken, platform: 'android' })
    .expect(204);
  const pushDevice = await query('SELECT * FROM mobile_devices WHERE id = $1', [firstClaim.body.data.deviceId]);
  assert.equal(JSON.stringify(pushDevice.rows[0]).includes(pushToken), false);
  assert.ok(pushDevice.rows[0].fcm_token_ciphertext);
  assert.ok(pushDevice.rows[0].fcm_token_hash);

  await request(app)
    .put(`/api/mobile/devices/${secondClaim.body.data.deviceId}/push-token`)
    .set('Authorization', `Bearer ${firstClaim.body.data.accessToken}`)
    .send({ token: `${pushToken}-other`, platform: 'android' })
    .expect(404)
    .expect((response) => assert.equal(response.body.error.code, 'MOBILE_DEVICE_NOT_FOUND'));
  await request(app)
    .put(`/api/mobile/devices/${firstClaim.body.data.deviceId}/push-token`)
    .send({ token: pushToken, platform: 'android' })
    .expect(401)
    .expect((response) => assert.equal(response.body.error.code, 'INVALID_DEVICE_TOKEN'));

  const devices = await web.get('/api/users/profile/mobile-devices').expect(200);
  assert.equal(devices.body.data.items.length, 2);
  assert.equal(devices.body.data.items.find((item) => item.id === firstClaim.body.data.deviceId).pushConfigured, true);

  await request(app)
    .delete(`/api/mobile/devices/${firstClaim.body.data.deviceId}`)
    .set('Authorization', `Bearer ${firstClaim.body.data.accessToken}`)
    .expect(204);
  await request(app)
    .delete(`/api/mobile/devices/${firstClaim.body.data.deviceId}`)
    .set('Authorization', `Bearer ${firstClaim.body.data.accessToken}`)
    .expect(204);
  await request(app)
    .put(`/api/mobile/devices/${firstClaim.body.data.deviceId}/push-token`)
    .set('Authorization', `Bearer ${firstClaim.body.data.accessToken}`)
    .send({ token: pushToken, platform: 'android' })
    .expect(401)
    .expect((response) => assert.equal(response.body.error.code, 'DEVICE_REVOKED'));

  await web
    .delete(`/api/users/profile/mobile-devices/${secondClaim.body.data.deviceId}`)
    .send({ code: recoveryCodes[3] })
    .expect(409)
    .expect((response) => assert.equal(response.body.error.code, 'LAST_MOBILE_DEVICE'));
});
