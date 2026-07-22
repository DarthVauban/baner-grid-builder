import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { query } from '../../db/pool.js';

const integrationKey = crypto.scryptSync(env.JWT_SECRET, 'mt-workspace-integrations-v1', 32);
const secretAad = Buffer.from('mt-workspace-integration-secret:v1');

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', integrationKey, iv);
  cipher.setAAD(secretAad);

  const encrypted = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final()
  ]);

  return {
    secretCiphertext: encrypted.toString('base64url'),
    secretIv: iv.toString('base64url'),
    secretTag: cipher.getAuthTag().toString('base64url')
  };
}

function decryptSecret(row) {
  if (!row?.secret_ciphertext || !row.secret_iv || !row.secret_tag) return '';

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    integrationKey,
    Buffer.from(row.secret_iv, 'base64url')
  );
  decipher.setAAD(secretAad);
  decipher.setAuthTag(Buffer.from(row.secret_tag, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(row.secret_ciphertext, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

function serializeMailtrap(row) {
  const config = row?.public_config || {};

  return {
    configured: Boolean(row?.secret_ciphertext),
    senderEmail: config.senderEmail || '',
    senderName: config.senderName || '',
    domain: config.domain || '',
    updatedAt: row?.updated_at || null
  };
}

function serializeTelegram(row) {
  const config = row?.public_config || {};

  return {
    configured: Boolean(row?.secret_ciphertext && config.chatId),
    chatId: config.chatId || '',
    botUsername: config.botUsername || '',
    botName: config.botName || '',
    updatedAt: row?.updated_at || null
  };
}

export class TelegramApiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'TelegramApiError';
    this.status = status;
  }
}

export async function telegramApiRequest(token, method, body, { fetchImpl = fetch, timeoutMs = 30_000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
      body: body instanceof FormData ? body : JSON.stringify(body || {}),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) {
      throw new TelegramApiError(payload.description || `Telegram API returned HTTP ${response.status}.`, response.status);
    }
    return payload.result;
  } catch (error) {
    if (error instanceof TelegramApiError) throw error;
    if (error?.name === 'AbortError') throw new TelegramApiError('Telegram API не відповів вчасно.', 504);
    throw new TelegramApiError('Не вдалося з’єднатися з Telegram API.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function getAdminIntegrations() {
  const result = await query(
    `SELECT key, public_config, secret_ciphertext, updated_at
     FROM integration_settings
     WHERE key IN ('mailtrap', 'telegram')`
  );

  const rows = new Map(result.rows.map((row) => [row.key, row]));

  return {
    mailtrap: serializeMailtrap(rows.get('mailtrap')),
    telegram: serializeTelegram(rows.get('telegram'))
  };
}

export async function saveMailtrapIntegration(input, userId) {
  const currentResult = await query(
    `SELECT secret_ciphertext, secret_iv, secret_tag
     FROM integration_settings
     WHERE key = 'mailtrap'`
  );
  const current = currentResult.rows[0];
  const token = input.token.trim();

  if (!token && !current?.secret_ciphertext) {
    throw new Error('MAILTRAP_TOKEN_REQUIRED');
  }

  const secret = token ? encryptSecret(token) : {
    secretCiphertext: current.secret_ciphertext,
    secretIv: current.secret_iv,
    secretTag: current.secret_tag
  };
  const senderEmail = input.senderEmail.toLowerCase();
  const publicConfig = {
    senderEmail,
    senderName: input.senderName,
    domain: senderEmail.split('@')[1] || ''
  };

  const result = await query(
    `INSERT INTO integration_settings (
       key, display_name, public_config, secret_ciphertext, secret_iv, secret_tag, updated_by, updated_at
     )
     VALUES ('mailtrap', 'Mailtrap', $1::jsonb, $2, $3, $4, $5, NOW())
     ON CONFLICT (key)
     DO UPDATE SET public_config = EXCLUDED.public_config,
                   secret_ciphertext = EXCLUDED.secret_ciphertext,
                   secret_iv = EXCLUDED.secret_iv,
                   secret_tag = EXCLUDED.secret_tag,
                   updated_by = EXCLUDED.updated_by,
                   updated_at = NOW()
     RETURNING key, public_config, secret_ciphertext, updated_at`,
    [
      JSON.stringify(publicConfig),
      secret.secretCiphertext,
      secret.secretIv,
      secret.secretTag,
      userId
    ]
  );

  return serializeMailtrap(result.rows[0]);
}

export async function getMailtrapCredentials() {
  const result = await query(
    `SELECT public_config, secret_ciphertext, secret_iv, secret_tag
     FROM integration_settings
     WHERE key = 'mailtrap'`
  );
  const row = result.rows[0];
  if (!row?.secret_ciphertext) return null;

  const config = row.public_config || {};

  return {
    token: decryptSecret(row),
    senderEmail: config.senderEmail || '',
    senderName: config.senderName || ''
  };
}

export async function saveTelegramIntegration(input, userId, { fetchImpl = fetch } = {}) {
  const currentResult = await query(
    `SELECT secret_ciphertext, secret_iv, secret_tag
     FROM integration_settings
     WHERE key = 'telegram'`
  );
  const current = currentResult.rows[0];
  const suppliedToken = input.token.trim();
  if (!suppliedToken && !current?.secret_ciphertext) throw new Error('TELEGRAM_TOKEN_REQUIRED');

  const token = suppliedToken || decryptSecret(current);
  const bot = await telegramApiRequest(token, 'getMe', {}, { fetchImpl });
  await telegramApiRequest(token, 'getChat', { chat_id: input.chatId }, { fetchImpl });

  const secret = suppliedToken ? encryptSecret(suppliedToken) : {
    secretCiphertext: current.secret_ciphertext,
    secretIv: current.secret_iv,
    secretTag: current.secret_tag
  };
  const publicConfig = {
    chatId: input.chatId,
    botUsername: bot.username || '',
    botName: [bot.first_name, bot.last_name].filter(Boolean).join(' ')
  };
  const result = await query(
    `INSERT INTO integration_settings (
       key, display_name, public_config, secret_ciphertext, secret_iv, secret_tag, updated_by, updated_at
     )
     VALUES ('telegram', 'Telegram', $1::jsonb, $2, $3, $4, $5, NOW())
     ON CONFLICT (key)
     DO UPDATE SET public_config = EXCLUDED.public_config,
                   secret_ciphertext = EXCLUDED.secret_ciphertext,
                   secret_iv = EXCLUDED.secret_iv,
                   secret_tag = EXCLUDED.secret_tag,
                   updated_by = EXCLUDED.updated_by,
                   updated_at = NOW()
     RETURNING key, public_config, secret_ciphertext, updated_at`,
    [JSON.stringify(publicConfig), secret.secretCiphertext, secret.secretIv, secret.secretTag, userId]
  );

  return serializeTelegram(result.rows[0]);
}

export async function getTelegramCredentials() {
  const result = await query(
    `SELECT public_config, secret_ciphertext, secret_iv, secret_tag
     FROM integration_settings
     WHERE key = 'telegram'`
  );
  const row = result.rows[0];
  const config = row?.public_config || {};
  if (!row?.secret_ciphertext || !config.chatId) return null;
  return { token: decryptSecret(row), chatId: config.chatId };
}
