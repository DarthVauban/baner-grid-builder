import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateKeyPairSync, randomUUID } from 'node:crypto';

const url = process.env.SUPPORT_TEST_DATABASE_URL;

test('PostgreSQL upgrades legacy support data without replacing credentials, history or notification preferences', { skip: !url }, async () => {
  const parsed = new URL(url);
  assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname));
  assert.ok(parsed.pathname.startsWith('/mt_support_contract'));
  process.env.DATABASE_URL = url;
  process.env.JWT_SECRET = 'support-upgrade-test-only-secret-at-least-32-characters';
  const { pool } = await import('../src/db/pool.js');
  const projectRoot = fileURLToPath(new URL('../', import.meta.url));
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'mt-support-upgrade-'));
  try {
    assert.equal((await pool.query("SELECT to_regclass('public.schema_migrations') AS existing")).rows[0].existing, null,
      'Use a new disposable database, never an existing installation');
    await mkdir(path.join(temporaryRoot, 'src/db'), { recursive: true });
    await mkdir(path.join(temporaryRoot, 'src/migrations'), { recursive: true });
    await writeFile(path.join(temporaryRoot, 'package.json'), '{"type":"module"}');
    await copyFile(path.join(projectRoot, 'src/db/migrate.js'), path.join(temporaryRoot, 'src/db/migrate.js'));
    await writeFile(path.join(temporaryRoot, 'src/db/pool.js'), `export { pool } from ${JSON.stringify(pathToFileURL(path.join(projectRoot, 'src/db/pool.js')).href)};\n`);
    const legacyMigrations = (await readdir(path.join(projectRoot, 'src/migrations'))).filter((name) => name.endsWith('.sql') && name < '105_');
    for (const name of legacyMigrations) await copyFile(path.join(projectRoot, 'src/migrations', name), path.join(temporaryRoot, 'src/migrations', name));
    const baseline = await import(pathToFileURL(path.join(temporaryRoot, 'src/db/migrate.js')).href);
    await baseline.runMigrations();
    const userId = (await pool.query(`INSERT INTO users(name,email,password_hash,role,status)
      VALUES('Upgrade fixture',$1,'test-only','admin','approved') RETURNING id`, [`upgrade-${randomUUID()}@test.local`])).rows[0].id;
    const siteId = (await pool.query('SELECT id FROM support_chat_sites LIMIT 1')).rows[0].id;
    const visitorId = (await pool.query(`INSERT INTO support_chat_visitors(site_id,session_token_hash) VALUES($1,$2) RETURNING id`, [siteId,randomUUID()])).rows[0].id;
    const conversationId = (await pool.query(`INSERT INTO support_chat_conversations(site_id,visitor_id) VALUES($1,$2) RETURNING id`, [siteId,visitorId])).rows[0].id;
    await pool.query(`INSERT INTO support_chat_messages(conversation_id,sender_type,sender_user_id,body,created_at) VALUES
      ($1,'visitor',NULL,'Historical visitor',NOW()-INTERVAL '2 minutes'),($1,'operator',$2,'Historical operator',NOW()-INTERVAL '1 minute')`, [conversationId,userId]);
    const publicKey = generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({format:'jwk'});
    const deviceId = (await pool.query(`INSERT INTO mobile_devices(user_id,name,platform,access_token_hash,
      installation_id_hash,auth_key_id,auth_public_key,auth_key_algorithm,auth_key_version,auth_key_registered_at)
      VALUES($1,'Upgrade fixture','android',$2,$3,'retained-key-id',$4::jsonb,'ES256',1,NOW()) RETURNING id`, [userId,randomUUID(),randomUUID(),JSON.stringify(publicKey)])).rows[0].id;
    const { setMobileDevicePushToken } = await import('../src/modules/mobile/mobile-device.service.js');
    // The baseline schema has no capability column, so populate encrypted token
    // fields through the same cryptography used by both releases.
    const { encryptMobileValue, hashFcmToken } = await import('../src/modules/mobile/mobile-crypto.js');
    const token = encryptMobileValue('upgrade-test-only-fcm-token','fcm-token');
    await pool.query(`UPDATE mobile_devices SET fcm_token_ciphertext=$2,fcm_token_iv=$3,fcm_token_tag=$4,fcm_token_hash=$5 WHERE id=$1`,
      [deviceId,token.ciphertext,token.iv,token.tag,hashFcmToken('upgrade-test-only-fcm-token')]);
    const before = (await pool.query('SELECT * FROM mobile_devices WHERE id=$1',[deviceId])).rows[0];
    const beforeMessages = (await pool.query('SELECT id,body,created_at FROM support_chat_messages WHERE conversation_id=$1 ORDER BY created_at,id',[conversationId])).rows;
    const { runMigrations } = await import('../src/db/migrate.js');
    await runMigrations();
    await runMigrations();
    const after = (await pool.query('SELECT * FROM mobile_devices WHERE id=$1',[deviceId])).rows[0];
    assert.equal(after.support_chat_contract_version,0);
    delete after.support_chat_contract_version;
    assert.deepEqual(after,before);
    assert.deepEqual((await pool.query('SELECT id,body,created_at FROM support_chat_messages WHERE conversation_id=$1 ORDER BY created_at,id',[conversationId])).rows,beforeMessages);
    assert.equal((await pool.query('SELECT user_id FROM user_support_chat_notification_preferences')).rowCount,0);
    assert.equal((await pool.query("SELECT name FROM schema_migrations WHERE name='105_mobile_support_chat.sql'")).rowCount,1);
    assert.equal((await pool.query('SELECT message_sequence_initialized FROM support_chat_conversations WHERE id=$1',[conversationId])).rows[0].message_sequence_initialized,false);
    const { loadSupportConversation, listSupportMessages } = await import('../src/modules/support-chat/support-chat.operator.service.js');
    await loadSupportConversation(conversationId);
    const loaded = await listSupportMessages(conversationId);
    assert.deepEqual(loaded.items.map((message) => message.body),['Historical visitor','Historical operator']);
    assert.ok(loaded.items.every((message) => message.sequence));
    // Capability changes only through the explicit registration path afterward.
    await setMobileDevicePushToken(userId,deviceId,'upgrade-test-only-fcm-token','android',null,pool,1);
    assert.equal((await pool.query('SELECT support_chat_contract_version FROM mobile_devices WHERE id=$1',[deviceId])).rows[0].support_chat_contract_version,1);
    assert.equal((await pool.query('SELECT user_id FROM user_support_chat_notification_preferences')).rowCount,0);
  } finally {
    await pool.end();
    const target = path.resolve(temporaryRoot);
    assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep) && path.basename(target).startsWith('mt-support-upgrade-'));
    await rm(target,{recursive:true,force:true});
  }
});
