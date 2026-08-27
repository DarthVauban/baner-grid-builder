import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://backup-integration-tests';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.COOKIE_SECURE = 'false';
process.env.APP_BUILD_SHA = 'backup-integration-build';
process.env.APP_ENVIRONMENT = 'development';
process.env.APP_ORIGIN = 'https://dev.mt-panel.sbs';
process.env.ADMIN_NAME = 'Backup Admin';
process.env.ADMIN_EMAIL = 'backup-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';
const backupTransferDir = await mkdtemp(path.join(os.tmpdir(), 'mt-backup-transfer-test-'));
process.env.TELEGRAM_LOCAL_MODE = 'true';
process.env.TELEGRAM_API_BASE_URL = 'http://telegram-bot-api:8081';
process.env.TELEGRAM_BACKUP_TEMP_DIR = backupTransferDir;
process.env.TELEGRAM_LOCAL_FILE_URI_DIR = backupTransferDir;
process.env.TELEGRAM_LOCAL_CREDENTIALS_DIR = path.join(backupTransferDir, 'telegram-local-api-config');

const telegramCalls = [];
let sendDocumentFailure = '';
let sentBackupArchive = Buffer.alloc(0);
let sentBackupPath = '';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const method = String(url).split('/').pop();
  const body = options.body instanceof FormData ? null : JSON.parse(options.body || '{}');
  telegramCalls.push({ url: String(url), method, options, body });
  if (method === 'sendDocument') {
    sentBackupPath = fileURLToPath(body.document);
    sentBackupArchive = await readFile(sentBackupPath);
  }
  if (method === 'sendDocument' && sendDocumentFailure) {
    return new Response(JSON.stringify({ ok: false, description: sendDocumentFailure }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const result = method === 'getMe'
    ? { id: 100, is_bot: true, first_name: 'Backup', username: 'mt_backup_bot' }
    : method === 'getChat'
      ? body.chat_id === '100'
        ? { id: 100, first_name: 'Backup', username: 'mt_backup_bot', type: 'private' }
        : { id: -1001234567890, title: 'Backups', type: 'channel' }
      : method === 'getChatMember'
        ? { status: 'administrator', can_post_messages: true, user: { id: 100, is_bot: true } }
        : { message_id: 7788 };
  return new Response(JSON.stringify({ ok: true, result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
});

after(async () => {
  globalThis.fetch = originalFetch;
  await rm(backupTransferDir, { recursive: true, force: true });
  await pool.end();
});

test('admin configures Telegram, saves a schedule and sends a manual backup', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD
  }).expect(200);

  const telegram = await agent.put('/api/admin/integrations/telegram').send({
    chatId: '-1001234567890',
    token: '123456:integration-test-token'
  }).expect(200);
  assert.equal(telegram.body.data.configured, true);
  assert.equal(telegram.body.data.tokenConfigured, true);
  assert.equal(telegram.body.data.token, undefined);
  assert.equal(telegram.body.data.botUsername, 'mt_backup_bot');
  assert.equal(telegramCalls[0].method, 'getMe');
  assert.equal(telegramCalls[1].method, 'getChat');
  assert.equal(telegramCalls[2].method, 'getChatMember');

  const integrations = await agent.get('/api/admin/integrations').expect(200);
  assert.equal(integrations.body.data.telegram.chatId, '-1001234567890');
  assert.equal(integrations.body.data.telegram.tokenConfigured, true);
  assert.equal(integrations.body.data.telegram.token, undefined);
  assert.equal(integrations.headers['cache-control'], 'no-store');

  const localApi = await agent.put('/api/admin/integrations/telegram/local-api').send({
    apiId: '12345678',
    apiHash: '0123456789abcdef0123456789abcdef'
  }).expect(200);
  assert.equal(localApi.body.data.enabled, true);
  assert.equal(localApi.body.data.credentialsConfigured, true);
  assert.equal(localApi.body.data.apiId, undefined);
  assert.equal(localApi.body.data.apiHash, undefined);
  assert.equal(
    await readFile(path.join(process.env.TELEGRAM_LOCAL_CREDENTIALS_DIR, 'credentials.env'), 'utf8'),
    'TELEGRAM_API_ID=12345678\nTELEGRAM_API_HASH=0123456789abcdef0123456789abcdef\n'
  );
  await agent.put('/api/admin/integrations/telegram/local-api').send({
    apiId: '87654321',
    apiHash: 'abcdef0123456789abcdef0123456789'
  }).expect(200);
  assert.equal(
    await readFile(path.join(process.env.TELEGRAM_LOCAL_CREDENTIALS_DIR, 'credentials.env'), 'utf8'),
    'TELEGRAM_API_ID=87654321\nTELEGRAM_API_HASH=abcdef0123456789abcdef0123456789\n'
  );
  const storedLocalApi = await pool.query(
    "SELECT secret_ciphertext, public_config FROM integration_settings WHERE key = 'telegram_local_api'"
  );
  assert.equal(storedLocalApi.rows.length, 1);
  assert.doesNotMatch(storedLocalApi.rows[0].secret_ciphertext, /87654321|abcdef0123456789/);
  assert.deepEqual(storedLocalApi.rows[0].public_config, {});

  const settings = await agent.put('/api/admin/backups/settings').send({
    automaticEnabled: true,
    scheduleType: 'daily',
    scheduleTime: '04:15',
    scheduleWeekday: 1,
    timezone: 'Europe/Kyiv'
  }).expect(200);
  assert.equal(settings.body.data.automaticEnabled, true);
  assert.ok(settings.body.data.nextRunAt);

  const backup = await agent.post('/api/admin/backups/run').expect(201);
  assert.equal(backup.body.data.status, 'success');
  assert.match(backup.body.data.fileName, /^mt-workspace-backup_dev_.*\.tar\.gz$/);
  assert.equal(telegramCalls.at(-1).method, 'sendDocument');
  assert.match(telegramCalls.at(-1).url, /^http:\/\/telegram-bot-api:8081\/bot/);
  assert.match(telegramCalls.at(-1).body.caption, /^🟦 DEV · Резервна копія MT Workspace/);
  assert.match(telegramCalls.at(-1).body.caption, /Середовище: DEV · dev\.mt-panel\.sbs/);
  assert.equal(path.basename(sentBackupPath), backup.body.data.fileName);
  await assert.rejects(access(sentBackupPath), { code: 'ENOENT' });
  const invalidArchive = Buffer.from(sentBackupArchive);
  invalidArchive[0] = 0;

  const state = await agent.get('/api/admin/backups').expect(200);
  assert.equal(state.body.data.runs[0].status, 'success');
  assert.equal(state.body.data.runs[0].telegramMessageId, 7788);
  assert.equal(state.body.data.telegramDocumentLimitBytes, 2_000 * 1024 * 1024);
  assert.equal(state.body.data.restoreArchiveLimitBytes, 520 * 1024 * 1024);

  const rejectedRestore = await agent.post('/api/admin/backups/restore')
    .set('Content-Type', 'application/gzip')
    .send(invalidArchive)
    .expect(422);
  assert.equal(rejectedRestore.body.error.code, 'INVALID_BACKUP_ARCHIVE');
});

test('Telegram integration rejects the bot itself as the backup destination', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD
  }).expect(200);

  const response = await agent.put('/api/admin/integrations/telegram').send({
    chatId: '100',
    token: '123456:integration-test-token'
  }).expect(422);

  assert.equal(response.body.error.code, 'TELEGRAM_CONNECTION_FAILED');
  assert.match(response.body.error.message, /Chat ID.*боту/);
});

test('manual backup returns a readable configuration error instead of Bad Gateway', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD
  }).expect(200);

  sendDocumentFailure = "Forbidden: the bot can't send messages to the bot";
  try {
    const response = await agent.post('/api/admin/backups/run').expect(422);
    assert.equal(response.body.error.code, 'TELEGRAM_SEND_FAILED');
    assert.match(response.body.error.message, /Chat ID.*боту/);

    const state = await agent.get('/api/admin/backups').expect(200);
    assert.equal(state.body.data.runs[0].status, 'failed');
    assert.match(state.body.data.runs[0].errorMessage, /Chat ID.*боту/);
    await assert.rejects(access(sentBackupPath), { code: 'ENOENT' });
  } finally {
    sendDocumentFailure = '';
  }
});
