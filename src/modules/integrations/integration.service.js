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

function serializeMailtrap(row, { includeToken = false } = {}) {
  const config = row?.public_config || {};

  const integration = {
    configured: Boolean(row?.secret_ciphertext),
    senderEmail: config.senderEmail || '',
    senderName: config.senderName || '',
    domain: config.domain || '',
    updatedAt: row?.updated_at || null
  };

  if (includeToken) integration.token = row?.secret_ciphertext ? decryptSecret(row) : '';
  return integration;
}

function serializeTelegram(row, { includeToken = false } = {}) {
  const config = row?.public_config || {};

  const integration = {
    configured: Boolean(row?.secret_ciphertext && config.chatId),
    chatId: config.chatId || '',
    botUsername: config.botUsername || '',
    botName: config.botName || '',
    updatedAt: row?.updated_at || null
  };

  if (includeToken) integration.token = row?.secret_ciphertext ? decryptSecret(row) : '';
  return integration;
}

function readableTelegramApiError(description, status) {
  const message = String(description || '').trim();
  const normalized = message.toLowerCase();

  if (normalized.includes("bot can't send messages to the bot")) {
    return 'Вказаний Chat ID належить боту. Вкажіть ID свого Telegram-акаунта, групи або каналу, куди бот має надсилати резервні копії.';
  }
  if (normalized.includes('bot was blocked by the user')) {
    return 'Користувач заблокував Telegram-бота. Розблокуйте його, відкрийте чат і натисніть Start.';
  }
  if (normalized.includes("bot can't initiate conversation") || normalized.includes('bot cannot initiate conversation')) {
    return 'Спочатку відкрийте чат із Telegram-ботом і натисніть Start, а потім повторіть підключення.';
  }
  if (normalized.includes('chat not found')) {
    return 'Telegram-чат не знайдено. Перевірте Chat ID або @username і переконайтеся, що бот доданий до цього чату.';
  }
  if (
    normalized.includes('not enough rights')
    || normalized.includes('have no rights')
    || normalized.includes('need administrator rights')
    || normalized.includes('not a member of the channel')
  ) {
    return 'Telegram-бот не має права надсилати файли в цей чат. Додайте бота до чату та надайте йому право публікувати повідомлення.';
  }
  if (status === 401 || normalized.includes('unauthorized')) {
    return 'Telegram відхилив bot token. Скопіюйте актуальний токен у @BotFather і повторіть підключення.';
  }

  return message || `Telegram API повернув HTTP ${status}.`;
}

export class TelegramApiError extends Error {
  constructor(message, status = 502, rawMessage = message) {
    super(message);
    this.name = 'TelegramApiError';
    this.status = status;
    this.rawMessage = rawMessage;
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
      const description = payload.description || `Telegram API returned HTTP ${response.status}.`;
      throw new TelegramApiError(readableTelegramApiError(description, response.status), response.status, description);
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

async function validateTelegramDestination(token, bot, chatId, fetchImpl) {
  const chat = await telegramApiRequest(token, 'getChat', { chat_id: chatId }, { fetchImpl });

  if (String(chat.id) === String(bot.id)) {
    throw new TelegramApiError(
      'Вказаний Chat ID належить самому боту. Вкажіть ID свого Telegram-акаунта, групи або каналу.',
      400,
      "Bad Request: bot can't send messages to the bot"
    );
  }

  if (chat.type === 'channel') {
    const membership = await telegramApiRequest(token, 'getChatMember', {
      chat_id: chat.id,
      user_id: bot.id
    }, { fetchImpl });
    const canPost = membership.status === 'creator'
      || (membership.status === 'administrator' && membership.can_post_messages === true);
    if (!canPost) {
      throw new TelegramApiError(
        'Telegram-бот не має права публікувати файли в цьому каналі. Призначте його адміністратором із правом публікації повідомлень.',
        403
      );
    }
  } else {
    await telegramApiRequest(token, 'sendChatAction', {
      chat_id: chat.id,
      action: 'upload_document'
    }, { fetchImpl });
  }

  return chat;
}

export async function getAdminIntegrations() {
  const result = await query(
    `SELECT key, public_config, secret_ciphertext, secret_iv, secret_tag, updated_at
     FROM integration_settings
     WHERE key IN ('mailtrap', 'telegram')`
  );

  const rows = new Map(result.rows.map((row) => [row.key, row]));

  return {
    mailtrap: serializeMailtrap(rows.get('mailtrap'), { includeToken: true }),
    telegram: serializeTelegram(rows.get('telegram'), { includeToken: true })
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
  await validateTelegramDestination(token, bot, input.chatId, fetchImpl);

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
