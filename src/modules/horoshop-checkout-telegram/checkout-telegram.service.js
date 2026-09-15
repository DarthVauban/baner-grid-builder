import QRCode from 'qrcode';
import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { checkoutTelegramEmbedScript } from './checkout-telegram.embed.js';

export const horoshopCheckoutTelegramToolId = 'horoshop_checkout_telegram';

export const defaultCheckoutTelegramConfig = {
  telegramUrl: '',
  buttonText: 'Відкрити Telegram',
  buttonBackgroundColor: '#229ed9',
  buttonHoverBackgroundColor: '#168ac2',
  buttonTextColor: '#ffffff',
  buttonBorderColor: '#229ed9',
  buttonBorderRadius: 12,
  buttonFontSize: 16,
  qrSize: 240,
  mobileButtonFontSize: 16,
  mobileQrSize: 240
};

function jsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function normalizeTelegramBotUrl(value) {
  const input = String(value || '').trim();
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new AppError(422, 'TELEGRAM_URL_INVALID', 'Вкажіть коректне посилання на Telegram-бота.');
  }
  const host = url.hostname.toLowerCase().replace(/^www\./u, '');
  const target = url.pathname.split('/').filter(Boolean)[0] || '';
  if (url.protocol !== 'https:' || !['t.me', 'telegram.me'].includes(host) || !/^[a-z0-9_]{5,32}$/iu.test(target)) {
    throw new AppError(422, 'TELEGRAM_URL_INVALID', 'Використайте HTTPS-посилання виду https://t.me/назва_бота.');
  }
  url.username = '';
  url.password = '';
  url.hash = '';
  return url.toString();
}

function numberInRange(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(numeric)));
}

function color(value, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/u.test(normalized) ? normalized : fallback;
}

export function normalizeCheckoutTelegramConfig(value, { requireUrl = false } = {}) {
  const raw = jsonObject(value);
  const source = { ...defaultCheckoutTelegramConfig, ...raw };
  const telegramUrl = String(source.telegramUrl || '').trim();
  if (requireUrl && !telegramUrl) {
    throw new AppError(422, 'TELEGRAM_URL_REQUIRED', 'Додайте посилання на Telegram-бота перед публікацією.');
  }
  const buttonFontSize = numberInRange(source.buttonFontSize, defaultCheckoutTelegramConfig.buttonFontSize, 12, 24);
  const qrSize = numberInRange(source.qrSize, defaultCheckoutTelegramConfig.qrSize, 160, 320);
  return {
    telegramUrl: telegramUrl ? normalizeTelegramBotUrl(telegramUrl) : '',
    buttonText: String(source.buttonText || defaultCheckoutTelegramConfig.buttonText).trim().slice(0, 80),
    buttonBackgroundColor: color(source.buttonBackgroundColor, defaultCheckoutTelegramConfig.buttonBackgroundColor),
    buttonHoverBackgroundColor: color(source.buttonHoverBackgroundColor, defaultCheckoutTelegramConfig.buttonHoverBackgroundColor),
    buttonTextColor: color(source.buttonTextColor, defaultCheckoutTelegramConfig.buttonTextColor),
    buttonBorderColor: color(source.buttonBorderColor, defaultCheckoutTelegramConfig.buttonBorderColor),
    buttonBorderRadius: numberInRange(source.buttonBorderRadius, defaultCheckoutTelegramConfig.buttonBorderRadius, 0, 32),
    buttonFontSize,
    qrSize,
    mobileButtonFontSize: numberInRange(raw.mobileButtonFontSize, buttonFontSize, 12, 24),
    mobileQrSize: numberInRange(raw.mobileQrSize, qrSize, 160, 320)
  };
}

async function qrCodeDataUrl(config, width) {
  if (!config.telegramUrl) return '';
  return QRCode.toDataURL(config.telegramUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width,
    color: { dark: '#111827', light: '#ffffff' }
  });
}

async function ensureSettings() {
  await query('INSERT INTO horoshop_checkout_telegram_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING');
}

async function loadSettingsRow() {
  await ensureSettings();
  const result = await query(
    `SELECT settings.*, connection.store_domain
     FROM horoshop_checkout_telegram_settings AS settings
     LEFT JOIN search_horoshop_connections AS connection ON connection.singleton = TRUE
     WHERE settings.id = TRUE
     LIMIT 1`
  );
  return result.rows[0];
}

function embedCode(origin, publicId) {
  return `<script async src="${origin}/api/public/horoshop-checkout-telegram/embed.js?site=${encodeURIComponent(publicId)}"></script>`;
}

function serializeSettings(row, origin = '') {
  return {
    publicId: row.public_id,
    enabled: row.enabled === true,
    draftConfig: normalizeCheckoutTelegramConfig(row.draft_config),
    publishedConfig: row.published_config ? normalizeCheckoutTelegramConfig(row.published_config) : null,
    publishedVersion: Number(row.published_version || 0),
    storeDomain: row.store_domain || '',
    updatedAt: row.updated_at,
    publishedAt: row.published_at || null,
    embedCode: origin ? embedCode(origin, row.public_id) : ''
  };
}

export async function getCheckoutTelegramSettings(origin = '') {
  return serializeSettings(await loadSettingsRow(), origin);
}

export async function updateCheckoutTelegramDraft(config, userId, origin = '') {
  const normalized = normalizeCheckoutTelegramConfig(config);
  await ensureSettings();
  await query(
    `UPDATE horoshop_checkout_telegram_settings
     SET draft_config = $1::JSONB, updated_by = $2, updated_at = NOW()
     WHERE id = TRUE`,
    [JSON.stringify(normalized), userId]
  );
  return getCheckoutTelegramSettings(origin);
}

export async function publishCheckoutTelegram(config, userId, origin = '') {
  const normalized = normalizeCheckoutTelegramConfig(config, { requireUrl: true });
  if (!normalized.buttonText) {
    throw new AppError(422, 'TELEGRAM_BUTTON_TEXT_REQUIRED', 'Додайте текст кнопки перед публікацією.');
  }
  await ensureSettings();
  await query(
    `UPDATE horoshop_checkout_telegram_settings
     SET draft_config = $1::JSONB,
         published_config = $1::JSONB,
         published_version = published_version + 1,
         enabled = TRUE,
         updated_by = $2,
         published_by = $2,
         updated_at = NOW(),
         published_at = NOW()
     WHERE id = TRUE`,
    [JSON.stringify(normalized), userId]
  );
  return getCheckoutTelegramSettings(origin);
}

export async function setCheckoutTelegramEnabled(enabled, userId, origin = '') {
  await ensureSettings();
  const result = await query(
    `UPDATE horoshop_checkout_telegram_settings
     SET enabled = $1, updated_by = $2, updated_at = NOW()
     WHERE id = TRUE AND ($1 = FALSE OR published_version > 0)
     RETURNING id`,
    [enabled, userId]
  );
  if (!result.rows[0]) {
    throw new AppError(409, 'CHECKOUT_TELEGRAM_NOT_PUBLISHED', 'Спочатку опублікуйте налаштування Telegram-блоку.');
  }
  return getCheckoutTelegramSettings(origin);
}

export async function loadPublishedCheckoutTelegram(publicId) {
  const result = await query(
    `SELECT published_config, published_version
     FROM horoshop_checkout_telegram_settings
     WHERE public_id = $1 AND enabled = TRUE AND published_version > 0
     LIMIT 1`,
    [publicId]
  );
  const row = result.rows[0];
  if (!row?.published_config) return null;
  const config = normalizeCheckoutTelegramConfig(row.published_config, { requireUrl: true });
  return {
    ...config,
    version: Number(row.published_version || 0),
    qrCodeDataUrl: await qrCodeDataUrl(config, config.qrSize),
    mobileQrCodeDataUrl: await qrCodeDataUrl(config, config.mobileQrSize)
  };
}

export { checkoutTelegramEmbedScript };
