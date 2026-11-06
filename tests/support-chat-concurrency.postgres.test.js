import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const url = process.env.SUPPORT_TEST_DATABASE_URL;
const enabled = Boolean(url);
let pool, sequence, service, notifications, push, user, deviceId;
before(async () => {
  if (!enabled) return;
  const parsed = new URL(url);
  assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname));
  assert.ok(parsed.pathname.startsWith('/mt_support_contract'), 'Use a dedicated disposable test database');
  process.env.DATABASE_URL = url;
  process.env.JWT_SECRET = 'support-postgres-contract-test-secret-123456789';
  process.env.MOBILE_SUPPORT_CHAT_PUSH_ENQUEUE_ENABLED = 'true';
  process.env.MOBILE_SUPPORT_CHAT_PUSH_SEND_ENABLED = 'true';
  ({ pool } = await import('../src/db/pool.js'));
  await (await import('../src/db/migrate.js')).runMigrations();
  // This URL is explicitly restricted to our disposable test database. Previous
  // runs' subscribers must not become recipients for the next run's fixtures.
  await pool.query('UPDATE user_support_chat_notification_preferences SET enabled=FALSE');
  await pool.query("UPDATE mobile_push_outbox SET status='cancelled' WHERE kind='support_chat_message' AND status IN ('pending','retry','processing')");
  sequence = await import('../src/modules/support-chat/support-chat.sequence.js');
  service = await import('../src/modules/support-chat/support-chat.operator.service.js');
  notifications = await import('../src/modules/support-chat/support-chat.notifications.js');
  push = await import('../src/modules/mobile/mobile-push.worker.js');
  const { serializeUser } = await import('../src/lib/serializers.js');
  const row = (await pool.query(`INSERT INTO users(name,email,password_hash,role,status)
    VALUES ('PG Support',$1,'test-only','admin','approved') RETURNING *`, [`support-${randomUUID()}@test.local`])).rows[0];
  user = serializeUser(row);
  deviceId = (await pool.query(`INSERT INTO mobile_devices(user_id,name,platform,access_token_hash)
    VALUES ($1,'PG test','android',$2) RETURNING id`, [user.id, randomUUID()])).rows[0].id;
  await (await import('../src/modules/mobile/mobile-device.service.js')).setMobileDevicePushToken(
    user.id, deviceId, 'postgres-support-token-test-only-long', 'android', null, pool, 1);
});
after(async () => { if (pool) await pool.end(); });

async function conversation() {
  const site = (await pool.query('SELECT id FROM support_chat_sites LIMIT 1')).rows[0].id;
  const visitor = (await pool.query(`INSERT INTO support_chat_visitors(site_id,session_token_hash)
    VALUES ($1,$2) RETURNING id`, [site, randomUUID()])).rows[0].id;
  const id = (await pool.query(`INSERT INTO support_chat_conversations(site_id,visitor_id)
    VALUES ($1,$2) RETURNING id`, [site, visitor])).rows[0].id;
  await service.loadSupportConversation(id);
  return id;
}
async function insert(db, id, body = 'test message') {
  await sequence.lockSupportConversation(db, id);
  const number = await sequence.nextSupportMessageSequence(db, id);
  return (await db.query(`INSERT INTO support_chat_messages(conversation_id,sender_type,body,message_sequence)
    VALUES ($1,'visitor',$2,$3) RETURNING *`, [id, body, number])).rows[0];
}

test('PostgreSQL serializes ordinal allocation before commit and preserves a late old-timestamp arrival', { skip: !enabled }, async () => {
  const id = await conversation();
  const first = await pool.connect(), second = await pool.connect();
  try {
    await first.query('BEGIN'); await second.query('BEGIN');
    const a = await insert(first, id);
    let allocated = false;
    const waiting = (async () => { const b = await insert(second, id); allocated = true; await second.query('COMMIT'); return b; })();
    await delay(80);
    assert.equal(allocated, false, 'Second writer must wait before allocating its ordinal');
    await first.query('COMMIT');
    const b = await waiting;
    assert.ok(BigInt(b.message_sequence) > BigInt(a.message_sequence));
    const loaded = await service.listSupportMessages(id);
    await first.query('BEGIN'); // NOW() is deliberately older than the next read.
    await delay(10);
    await service.markSupportConversationRead(id, loaded.items.at(-1).id);
    const late = await insert(first, id);
    await first.query('COMMIT');
    await service.markSupportConversationRead(id, loaded.items.at(-1).id);
    assert.equal((await service.loadSupportConversation(id)).unreadCount, 1);
    assert.ok(BigInt(late.message_sequence) > BigInt(b.message_sequence));
  } finally {
    await first.query('ROLLBACK'); await second.query('ROLLBACK'); first.release(); second.release();
  }
});

test('PostgreSQL cursors retain microseconds and initialize historical order/read state transactionally', { skip: !enabled }, async () => {
  const one = await conversation(), two = await conversation();
  const search = randomUUID();
  await pool.query('UPDATE support_chat_visitors SET name=$1 WHERE id IN (SELECT visitor_id FROM support_chat_conversations WHERE id = ANY($2::uuid[]))', [search, [one,two]]);
  await pool.query("UPDATE support_chat_conversations SET status='RESOLVED', updated_at = '2026-11-05 12:00:00.123456+00' WHERE id = $1", [one]);
  await pool.query("UPDATE support_chat_conversations SET status='RESOLVED', updated_at = '2026-11-05 12:00:00.123455+00' WHERE id = $1", [two]);
  const page = await service.listSupportConversations({ limit: 1, status: 'RESOLVED', search });
  const decoded = service.decodeSupportCursor(page.nextCursor, `conversations:RESOLVED:${search}`);
  assert.match(decoded.at, /123456/);
  assert.equal((await service.listSupportConversations({ limit: 1, status: 'RESOLVED', search, cursor: page.nextCursor })).items[0].id, two);
  const old = await conversation();
  await pool.query('UPDATE support_chat_conversations SET message_sequence_initialized = FALSE WHERE id = $1', [old]);
  const messages = [];
  for (const at of ['2026-11-05T10:00:00.123456Z','2026-11-05T10:00:00.123457Z']) {
    messages.push((await pool.query(`INSERT INTO support_chat_messages(conversation_id,sender_type,body,created_at)
      VALUES ($1,'visitor','historic',$2) RETURNING id`, [old, at])).rows[0].id);
  }
  await pool.query("UPDATE support_chat_conversations SET operator_last_read_at = '2026-11-05 10:00:00.123456+00' WHERE id = $1", [old]);
  const initialized = await service.loadSupportConversation(old);
  assert.equal(initialized.unreadCount, 1);
  assert.equal(initialized.readState.lastReadMessageId, messages[0]);
});

test('PostgreSQL opt-out waits for active dispatch, cancels the rest, and retries preserve push identity', { skip: !enabled }, async () => {
  const id = await conversation();
  await notifications.setSupportNotificationPreference(user, { enabled: true, expectedVersion: 0 });
  const ids = [];
  for (let i = 0; i < 2; i++) await service.supportTransaction(async (db) => {
    const message = await insert(db, id, `PG preview ${i}`); ids.push(message.id); await notifications.enqueueSupportMessagePush(db, message.id);
  });
  let releaseSend, announceSend;
  const started = new Promise((resolve) => { announceSend = resolve; });
  const held = new Promise((resolve) => { releaseSend = resolve; });
  const sent = [];
  const running = push.processMobilePushOutbox({ messaging: { send: async (message) => {
    sent.push(message); announceSend(); await held; return 'accepted';
  } } });
  await started;
  let unsubscribed = false;
  const unsubscribe = notifications.setSupportNotificationPreference(user, { enabled: false, expectedVersion: 1 }).then(() => { unsubscribed = true; });
  try { await delay(80); assert.equal(unsubscribed, false); }
  finally { releaseSend(); await unsubscribe; await running; }
  assert.equal(sent.length, 1);
  const visitorId = (await pool.query('SELECT visitor_id FROM support_chat_conversations WHERE id=$1', [id])).rows[0].visitor_id;
  assert.equal(sent[0].data.messageId, ids[0]);
  assert.deepEqual(sent[0].notification, { title: `Відвідувач ${visitorId.slice(0, 6)}: PG preview 0`, body: 'PG preview 0' });
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM mobile_push_outbox WHERE support_message_id = ANY($1::uuid[]) AND status = 'cancelled'", [ids])).rows[0].count, 1);
  await notifications.setSupportNotificationPreference(user, { enabled: true, expectedVersion: 2 });
  // The durable state after an ambiguous crash between FCM acceptance and ack.
  await pool.query("UPDATE mobile_push_outbox SET status='processing', available_at=NOW()-INTERVAL '1 minute' WHERE id=$1", [sent[0].data.pushId]);
  const again = [];
  await push.processMobilePushOutbox({ messaging: { send: async (message) => { again.push(message); return 'accepted'; } } });
  assert.equal(again[0].data.pushId, sent[0].data.pushId);
  assert.equal(again[0].android.notification.tag, sent[0].android.notification.tag);
  assert.equal(again[0].apns.headers['apns-collapse-id'], sent[0].apns.headers['apns-collapse-id']);
  await notifications.setSupportNotificationPreference(user, { enabled: false, expectedVersion: 3 });
});

test('gate never returns a potentially locked session to the pool after unlock failure', { skip: !enabled }, async () => {
  let destroyed = false;
  const fakePool = { connect: async () => ({
    query: async (sql) => { if (sql.includes('pg_advisory_unlock')) throw new Error('connection lost'); return { rows: [] }; },
    release: (destroy) => { destroyed = destroy; }
  }) };
  await notifications.withSupportNotificationGate(user.id, async () => true, fakePool);
  assert.equal(destroyed, true);
});

test('PostgreSQL queues both accounts sharing an FCM token, including the unassigned operator', { skip: !enabled }, async () => {
  const id = await conversation();
  await pool.query('UPDATE support_chat_conversations SET assigned_user_id=$1 WHERE id=$2', [user.id,id]);
  const other = (await pool.query(`INSERT INTO users(name,email,password_hash,role,status)
    VALUES ('Other PG operator',$1,'test-only','admin','approved') RETURNING *`, [`other-${randomUUID()}@test.local`])).rows[0];
  const otherDevice = (await pool.query(`INSERT INTO mobile_devices(user_id,name,platform,access_token_hash)
    VALUES ($1,'Other PG account','android',$2) RETURNING id`, [other.id,randomUUID()])).rows[0].id;
  await (await import('../src/modules/mobile/mobile-device.service.js')).setMobileDevicePushToken(
    other.id,otherDevice,'postgres-support-token-test-only-long','android',null,pool,1);
  try {
    for (const target of [user,other]) {
      const pref = await notifications.getSupportNotificationPreference(target.id);
      await notifications.setSupportNotificationPreference(target,{enabled:true,expectedVersion:pref.version});
    }
    const message = await service.supportTransaction(async (db) => {
      const inserted = await insert(db,id); await notifications.enqueueSupportMessagePush(db,inserted.id); return inserted;
    });
    const rows = (await pool.query('SELECT device_id FROM mobile_push_outbox WHERE support_message_id=$1',[message.id])).rows;
    assert.deepEqual(new Set(rows.map((row) => row.device_id)),new Set([deviceId,otherDevice]));
  } finally {
    for (const target of [user,other]) {
      const pref = await notifications.getSupportNotificationPreference(target.id);
      await notifications.setSupportNotificationPreference(target,{enabled:false,expectedVersion:pref.version});
    }
  }
});
