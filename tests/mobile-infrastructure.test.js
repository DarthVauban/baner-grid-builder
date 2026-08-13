import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://mobile-infrastructure-tests';
process.env.JWT_SECRET = 'mobile-infrastructure-test-secret-123456789';
process.env.MOBILE_TOKEN_PEPPER = 'mobile-token-pepper-test-value-123456789';

const { pool } = await import('../src/db/pool.js');
const {
  createMobilePairing,
  getMobilePairing,
  mobilePairingTtlMs
} = await import('../src/modules/mobile/mobile-pairing.service.js');
const {
  findMobileDeviceByAccessToken,
  newMobileDeviceCredential
} = await import('../src/modules/mobile/mobile-device.service.js');
const {
  hashDeviceAccessToken,
  hashPairingManualCode,
  hashPairingQrToken
} = await import('../src/modules/mobile/mobile-crypto.js');

let userId;

before(async () => {
  const migrationsDirectory = new URL('../src/migrations/', import.meta.url);
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql') && file < '049_mobile_workspace.sql')
    .sort();
  for (const migrationFile of migrationFiles) {
    await pool.query(await readFile(new URL(migrationFile, migrationsDirectory), 'utf8'));
  }
  const user = await pool.query(
    `INSERT INTO users (
       name,
       email,
       password_hash,
       role,
       status,
       two_factor_enabled
     )
     VALUES (
       'Mobile Test',
       'mobile-infrastructure@test.local',
       'unused',
       'admin',
       'approved',
       TRUE
     )
     RETURNING id`,
    []
  );
  userId = user.rows[0].id;
  await pool.query(
    await readFile(new URL('../src/migrations/049_mobile_workspace.sql', import.meta.url), 'utf8')
  );
  await pool.query(
    await readFile(new URL('../src/migrations/055_mobile_multi_account_qr_login.sql', import.meta.url), 'utf8')
  );
});

after(async () => {
  await pool.end();
});

test('mobile migration backfills 2FA method and creates infrastructure tables', async () => {
  const user = await pool.query('SELECT two_factor_method FROM users WHERE id = $1', [userId]);
  assert.equal(user.rows[0].two_factor_method, 'totp');
  const mobileTables = [
    'mobile_devices',
    'mobile_pairings',
    'mobile_login_requests',
    'mobile_push_outbox',
    'mobile_security_events',
    'mobile_qr_login_challenges'
  ];
  for (const table of mobileTables) {
    const result = await pool.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    assert.ok(Number.isInteger(result.rows[0].count));
  }

  await pool.query(
    `UPDATE users
     SET two_factor_enabled = FALSE, two_factor_method = NULL
     WHERE id = $1`,
    [userId]
  );
});

test('pairing credentials are one-time material and never stored raw', async () => {
  await pool.query(
    `UPDATE users
     SET two_factor_enabled = FALSE, two_factor_method = NULL
     WHERE id = $1`,
    [userId]
  );
  const first = await createMobilePairing(userId, { purpose: 'enable_2fa' });
  const rawQrToken = new URL(first.qrPayload).searchParams.get('token');
  assert.ok(rawQrToken);
  assert.match(first.manualCode, /^[A-HJ-NP-Z2-7]{4}(?:-[A-HJ-NP-Z2-7]{4}){2}$/);
  const ttl = new Date(first.expiresAt).getTime() - Date.now();
  assert.ok(ttl <= mobilePairingTtlMs && ttl > mobilePairingTtlMs - 10_000);

  const stored = await pool.query('SELECT * FROM mobile_pairings WHERE id = $1', [first.id]);
  const row = stored.rows[0];
  assert.equal(row.qr_token_hash, hashPairingQrToken(rawQrToken));
  assert.equal(row.manual_code_hash, hashPairingManualCode(first.manualCode));
  assert.notEqual(row.qr_token_hash, rawQrToken);
  assert.notEqual(row.manual_code_hash, first.manualCode);
  assert.equal(JSON.stringify(row).includes(rawQrToken), false);
  assert.equal(JSON.stringify(row).includes(first.manualCode), false);

  const second = await createMobilePairing(userId, { purpose: 'enable_2fa' });
  const firstAfterReplacement = await pool.query('SELECT status FROM mobile_pairings WHERE id = $1', [first.id]);
  assert.equal(firstAfterReplacement.rows[0].status, 'cancelled');
  assert.equal((await getMobilePairing(userId, second.id)).status, 'pending');

  await pool.query(
    `UPDATE mobile_pairings SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
    [second.id]
  );
  assert.equal((await getMobilePairing(userId, second.id)).status, 'expired');
  const events = await pool.query(
    `SELECT event_type, metadata
     FROM mobile_security_events
     WHERE user_id = $1
     ORDER BY created_at`,
    [userId]
  );
  assert.ok(events.rows.some((event) => event.event_type === 'pairing_created'));
  assert.ok(events.rows.some((event) => event.event_type === 'pairing_cancelled'));
  assert.ok(events.rows.some((event) => event.event_type === 'pairing_expired'));
  assert.equal(JSON.stringify(events.rows).includes(rawQrToken), false);
});

test('device access credentials are opaque, scoped, and lookup-safe', async () => {
  const credential = newMobileDeviceCredential();
  assert.ok(credential.accessToken.length >= 43);
  assert.equal(credential.accessTokenHash, hashDeviceAccessToken(credential.accessToken));
  assert.notEqual(credential.accessTokenHash, credential.accessToken);
  assert.notEqual(hashPairingQrToken(credential.accessToken), credential.accessTokenHash);

  const device = await pool.query(
    `INSERT INTO mobile_devices (user_id, name, platform, access_token_hash)
     VALUES ($1, 'Pixel Test', 'android', $2)
     RETURNING id`,
    [userId, credential.accessTokenHash]
  );
  const found = await findMobileDeviceByAccessToken(credential.accessToken);
  assert.equal(found.id, device.rows[0].id);
  assert.equal(found.user_id, userId);
  const stored = await pool.query('SELECT * FROM mobile_devices WHERE id = $1', [device.rows[0].id]);
  assert.equal(JSON.stringify(stored.rows[0]).includes(credential.accessToken), false);
});
