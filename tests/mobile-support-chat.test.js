import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://mobile-support-chat-tests';
process.env.JWT_SECRET = 'mobile-support-contract-test-secret-123456789';
process.env.COOKIE_SECURE = 'false';
process.env.ADMIN_NAME = 'Support Mobile Admin';
process.env.ADMIN_EMAIL = 'support-mobile@test.local';
process.env.ADMIN_PASSWORD = 'SupportTestPassword123!';
process.env.MOBILE_SUPPORT_CHAT_API_ENABLED = 'true';
process.env.MOBILE_SUPPORT_CHAT_PUSH_ENQUEUE_ENABLED = 'true';
process.env.MOBILE_SUPPORT_CHAT_PUSH_SEND_ENABLED = 'true';
const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');
const { createDeviceCredential } = await import('../src/modules/mobile/mobile-crypto.js');
const { setMobileDevicePushToken } = await import('../src/modules/mobile/mobile-device.service.js');
const { processMobilePushOutbox } = await import('../src/modules/mobile/mobile-push.worker.js');
const { env } = await import('../src/config/env.js');
const { publishSupportChatUpdate } = await import('../src/modules/support-chat/support-chat.events.js');
const web = request.agent(app);
let userId, deviceId, credential, visitorToken, conversationId;
const mobile = (method, path) => request(app)[method](`/api/mobile/support-chat${path}`).set('Authorization', `Bearer ${credential.accessToken}`);
const sendVisitor = (body, clientMessageId = randomUUID()) => request(app).post('/api/public/support-chat/messages')
  .set('Authorization', `Bearer ${visitorToken}`).send({ body, clientMessageId });

before(async () => {
  await runMigrations(); await ensureBootstrapAdmin();
  userId = (await web.post('/api/auth/login').send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }).expect(200)).body.data.id;
  credential = createDeviceCredential();
  deviceId = (await pool.query(`INSERT INTO mobile_devices(user_id,name,platform,access_token_hash)
    VALUES ($1,'Support test','android',$2) RETURNING id`, [userId, credential.accessTokenHash])).rows[0].id;
  await setMobileDevicePushToken(userId, deviceId, 'support-test-fcm-token-long-enough', 'android', null, pool, 1);
  visitorToken = (await request(app).post('/api/public/support-chat/session').send({}).expect(200)).body.data.token;
});
after(async () => pool.end());

test('default opt-out, authenticated bootstrap and shared web/mobile preference', async () => {
  await request(app).get('/api/mobile/support-chat/bootstrap').expect(401);
  const bootstrap = (await mobile('get', '/bootstrap').expect(200)).body.data;
  assert.equal(bootstrap.access.allowed, true);
  assert.deepEqual(bootstrap.notificationPreference, { enabled: false, configured: false, version: 0, updatedAt: null });
  await sendVisitor('before opt-in').expect(201);
  assert.equal((await pool.query('SELECT * FROM mobile_push_outbox')).rowCount, 0);
  await web.put('/api/support-chat/notification-preference').send({ enabled: true, expectedVersion: 0 }).expect(200);
  assert.equal((await mobile('get', '/notification-preference').expect(200)).body.data.enabled, true);
  await mobile('put', '/notification-preference').send({ enabled: false, expectedVersion: 0 }).expect(409);
});

test('visitor replay enqueues once, TTL is anchored to message, and bounded team read preserves a new arrival', async () => {
  const key = randomUUID();
  const sent = await sendVisitor('subscribed message', key).expect(201);
  conversationId = sent.body.data.id;
  await sendVisitor('subscribed message', key).expect(201);
  await sendVisitor('different body', key).expect(409);
  const outbox = (await pool.query("SELECT * FROM mobile_push_outbox WHERE kind = 'support_chat_message'")).rows;
  assert.equal(outbox.length, 1);
  const message = (await pool.query('SELECT * FROM support_chat_messages WHERE id = $1', [outbox[0].support_message_id])).rows[0];
  assert.equal(new Date(outbox[0].expires_at) - new Date(message.created_at), 15 * 60_000);
  const page = (await mobile('get', `/conversations/${conversationId}/messages?limit=1`).expect(200)).body.data;
  assert.equal(typeof page.items[0].sequence, 'string');
  const earlier = (await mobile('get', `/conversations/${conversationId}/messages?limit=1&cursor=${encodeURIComponent(page.nextCursor)}`).expect(200)).body.data;
  assert.ok(BigInt(earlier.items[0].sequence) < BigInt(page.items[0].sequence));
  await mobile('get', `/conversations/${conversationId}/messages?cursor=broken`).expect(422);
  await sendVisitor('arrived after fetch').expect(201);
  await mobile('post', `/conversations/${conversationId}/read`).send({ lastReadMessageId: page.items[0].id }).expect(200);
  assert.equal((await mobile('get', '/unread-count').expect(200)).body.data, 1);
  await mobile('post', `/conversations/${conversationId}/read`).send({ lastReadMessageId: earlier.items[0].id }).expect(200);
  assert.equal((await mobile('get', '/unread-count').expect(200)).body.data, 1);
  await mobile('post', `/conversations/${conversationId}/read`).send({ lastReadMessageId: randomUUID() }).expect(422);
});

test('operator send is idempotent and does not mark unseen visitor messages read', async () => {
  const input = { body: 'operator answer', clientMessageId: randomUUID() };
  const first = (await mobile('post', `/conversations/${conversationId}/messages`).send(input).expect(201)).body.data;
  const replay = (await mobile('post', `/conversations/${conversationId}/messages`).send(input).expect(200)).body.data;
  assert.equal(first.id, replay.id);
  assert.equal(first.clientMessageId, input.clientMessageId);
  await mobile('post', `/conversations/${conversationId}/messages`).send({ ...input, body: 'changed' }).expect(409);
  assert.equal((await mobile('get', '/unread-count').expect(200)).body.data, 1);
});

test('safe push routing, retry identity, old token registration and unsubscribe cancellation', async () => {
  const captured = [];
  await processMobilePushOutbox({ messaging: { send: async (message) => { captured.push(message); return 'accepted'; } }, lockRows: false });
  assert.equal(captured.length, 2);
  for (const message of captured) {
    assert.equal(message.data.kind, 'support_chat_message');
    assert.equal(message.data.targetDeviceId, deviceId);
    assert.ok(message.data.pushId);
    assert.ok(message.data.conversationId);
    assert.ok(message.android.ttl <= 15 * 60_000);
    assert.equal(JSON.stringify(message).includes('subscribed message'), false);
  }
  await sendVisitor('cancel me').expect(201);
  await mobile('put', '/notification-preference').send({ enabled: false, expectedVersion: 1 }).expect(200);
  const before = captured.length;
  await processMobilePushOutbox({ messaging: { send: async (message) => captured.push(message) }, lockRows: false });
  assert.equal(captured.length, before);
  assert.ok((await pool.query("SELECT id FROM mobile_push_outbox WHERE status = 'cancelled'")).rowCount > 0);
  await request(app).put(`/api/mobile/devices/${deviceId}/push-token`).set('Authorization', `Bearer ${credential.accessToken}`)
    .send({ token: 'old-flutter-token-long-enough', platform: 'android' }).expect(204);
  assert.equal((await pool.query('SELECT support_chat_contract_version FROM mobile_devices WHERE id = $1', [deviceId])).rows[0].support_chat_contract_version, 0);
  assert.equal((await mobile('get', '/notification-preference').expect(200)).body.data.enabled, false);
});

test('eligibility lookup failure defers delivery and disabled send flag cannot claim support pushes', async () => {
  await setMobileDevicePushToken(userId, deviceId, 'eligibility-installation-test-token-long', 'android', null, pool, 1);
  const preference = (await mobile('get', '/notification-preference')).body.data;
  await mobile('put', '/notification-preference').send({ enabled: true, expectedVersion: preference.version }).expect(200);
  await sendVisitor('eligibility lookup failure').expect(201);
  let sends = 0;
  const failLookupPool = { query: (...args) => pool.query(...args), connect: async () => {
    const db = await pool.connect();
    return { release: (...args) => db.release(...args), query: (sql, args) => {
      if (sql === 'SELECT * FROM users WHERE id = $1') throw new Error('temporary DB lookup failure');
      return db.query(sql, args);
    } };
  } };
  const summary = await processMobilePushOutbox({ messaging: { send: async () => { sends++; } }, dbPool: failLookupPool, lockRows: false });
  assert.equal(summary.retried, 1); assert.equal(sends, 0);
  await sendVisitor('paused send flag').expect(201);
  env.supportChatPushSendEnabled = false;
  try {
    const paused = await processMobilePushOutbox({ messaging: { send: async () => { sends++; } }, lockRows: false });
    assert.equal(paused.claimed, 0); assert.equal(sends, 0);
  } finally { env.supportChatPushSendEnabled = true; }
});

test('mobile SSE exposes IDs only and closes after tool access is revoked', async () => {
  const server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const controller = new AbortController();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/mobile/support-chat/stream`, {
      headers: { Authorization: `Bearer ${credential.accessToken}` }, signal: controller.signal
    });
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), /event: connected/);
    publishSupportChatUpdate({ type: 'message', conversationId, messageId: randomUUID(), senderType: 'visitor', messagePreview: 'fixture-private-preview' });
    const event = new TextDecoder().decode((await reader.read()).value);
    assert.match(event, /event: support/); assert.equal(event.includes('fixture-private-preview'), false);
    await pool.query("UPDATE users SET role='manager' WHERE id=$1", [userId]);
    publishSupportChatUpdate({ type: 'conversation', conversationId });
    assert.match(new TextDecoder().decode((await reader.read()).value), /event: access_revoked/);
  } finally {
    controller.abort(); server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await pool.query("UPDATE users SET role='admin' WHERE id=$1", [userId]);
  }
});

test('tool policy is authoritative while bootstrap and opt-out remain available', async () => {
  await pool.query("UPDATE users SET role = 'manager' WHERE id = $1", [userId]);
  assert.equal((await mobile('get', '/bootstrap').expect(200)).body.data.access.allowed, false);
  await mobile('get', '/conversations').expect(403);
  const preference = (await mobile('get', '/notification-preference')).body.data;
  await mobile('put', '/notification-preference').send({ enabled: true, expectedVersion: preference.version }).expect(403);
  let sends = 0;
  await processMobilePushOutbox({ messaging: { send: async () => { sends++; } }, lockRows: false });
  assert.equal(sends, 0);
  await mobile('put', '/notification-preference').send({ enabled: false, expectedVersion: preference.version }).expect(200);
});
