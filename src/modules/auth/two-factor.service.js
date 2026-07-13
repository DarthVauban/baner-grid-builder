import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { env } from '../../config/env.js';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';

const issuer = 'MT Panel';
const setupExpiresMs = 15 * 60 * 1000;
const periodSeconds = 30;
const codeDigits = 6;
const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const recoveryAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const encryptionKey = crypto.scryptSync(env.JWT_SECRET, 'mt-workspace-2fa-secrets-v1', 32);
const recoveryKey = crypto.scryptSync(env.JWT_SECRET, 'mt-workspace-2fa-recovery-v1', 32);
const secretAad = Buffer.from('mt-workspace-two-factor-secret:v1');

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  cipher.setAAD(secretAad);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);

  return {
    ciphertext: encrypted.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url')
  };
}

function decryptSecret(ciphertext, iv, tag) {
  if (!ciphertext || !iv || !tag) return '';
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(iv, 'base64url'));
  decipher.setAAD(secretAad);
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += base32Alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(secret) {
  const normalized = String(secret || '').replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (const char of normalized) {
    const index = base32Alphabet.indexOf(char);
    if (index === -1) throw new Error('INVALID_BASE32_SECRET');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function generateBase32Secret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secret, counter) {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);

  const digest = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);

  return String(binary % (10 ** codeDigits)).padStart(codeDigits, '0');
}

function timingSafeCodeEqual(expected, actual) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function findTotpStep(secret, code, lastUsedStep = null) {
  const normalized = String(code || '').trim();
  if (!/^\d{6}$/.test(normalized)) return null;

  const currentStep = Math.floor(Date.now() / 1000 / periodSeconds);
  for (const offset of [-1, 0, 1]) {
    const step = currentStep + offset;
    if (lastUsedStep !== null && step <= Number(lastUsedStep)) continue;
    if (timingSafeCodeEqual(hotp(secret, step), normalized)) return step;
  }
  return null;
}

function normalizeRecoveryCode(code) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '').replace(/-/g, '');
}

function hashRecoveryCode(code) {
  return crypto.createHmac('sha256', recoveryKey).update(normalizeRecoveryCode(code)).digest('base64url');
}

function randomRecoveryCode() {
  let value = '';
  for (let index = 0; index < 10; index += 1) {
    value += recoveryAlphabet[crypto.randomInt(recoveryAlphabet.length)];
  }
  return `${value.slice(0, 4)}-${value.slice(4)}`;
}

function buildOtpAuthUrl(user, secret) {
  const accountName = user.email || user.name || user.id;
  const label = `${issuer}:${accountName}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(codeDigits),
    period: String(periodSeconds)
  });

  return {
    accountName,
    url: `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`
  };
}

export function isPrimaryAdmin(user) {
  return Boolean(
    user?.role === 'admin'
    && env.ADMIN_EMAIL
    && String(user.email || '').toLowerCase() === env.ADMIN_EMAIL.toLowerCase()
  );
}

export async function getTwoFactorStatus(userId) {
  const userResult = await query(
    `SELECT two_factor_enabled, two_factor_confirmed_at
     FROM users
     WHERE id = $1`,
    [userId]
  );
  const user = userResult.rows[0];
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено.');

  const recoveryResult = await query(
    `SELECT COUNT(*)::INTEGER AS count
     FROM user_two_factor_recovery_codes
     WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );

  return {
    enabled: user.two_factor_enabled === true,
    confirmedAt: user.two_factor_confirmed_at || null,
    recoveryCodesRemaining: recoveryResult.rows[0]?.count || 0
  };
}

export async function startTwoFactorSetup(user) {
  const secret = generateBase32Secret();
  const encrypted = encryptSecret(secret);
  const { accountName, url } = buildOtpAuthUrl(user, secret);
  const qrCodeDataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 280,
    color: { dark: '#111827', light: '#ffffff' }
  });

  await query(
    `UPDATE users
     SET two_factor_pending_secret_ciphertext = $1,
         two_factor_pending_secret_iv = $2,
         two_factor_pending_secret_tag = $3,
         two_factor_pending_created_at = NOW(),
         updated_at = NOW()
     WHERE id = $4`,
    [encrypted.ciphertext, encrypted.iv, encrypted.tag, user.id]
  );

  return {
    issuer,
    accountName,
    otpauthUrl: url,
    qrCodeDataUrl,
    manualKey: secret.match(/.{1,4}/g).join(' '),
    expiresAt: new Date(Date.now() + setupExpiresMs).toISOString()
  };
}

export async function confirmTwoFactorSetup(userId, code) {
  const client = await pool.connect();
  const recoveryCodes = Array.from({ length: 10 }, randomRecoveryCode);

  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, two_factor_pending_secret_ciphertext, two_factor_pending_secret_iv,
              two_factor_pending_secret_tag, two_factor_pending_created_at
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [userId]
    );
    const user = result.rows[0];
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено.');
    if (!user.two_factor_pending_secret_ciphertext) {
      throw new AppError(422, 'TWO_FACTOR_SETUP_REQUIRED', 'Спочатку створіть QR-код для підключення 2FA.');
    }
    if (Date.now() - new Date(user.two_factor_pending_created_at).getTime() > setupExpiresMs) {
      throw new AppError(422, 'TWO_FACTOR_SETUP_EXPIRED', 'QR-код застарів. Створіть новий код підключення.');
    }

    const secret = decryptSecret(
      user.two_factor_pending_secret_ciphertext,
      user.two_factor_pending_secret_iv,
      user.two_factor_pending_secret_tag
    );
    if (findTotpStep(secret, code) === null) {
      throw new AppError(422, 'INVALID_TWO_FACTOR_CODE', 'Код із застосунку вказано неправильно.');
    }

    const activeSecret = encryptSecret(secret);
    await client.query('DELETE FROM user_two_factor_recovery_codes WHERE user_id = $1', [userId]);
    for (const recoveryCode of recoveryCodes) {
      await client.query(
        `INSERT INTO user_two_factor_recovery_codes (user_id, code_hash)
         VALUES ($1, $2)`,
        [userId, hashRecoveryCode(recoveryCode)]
      );
    }

    const userUpdate = await client.query(
      `UPDATE users
       SET two_factor_secret_ciphertext = $1,
           two_factor_secret_iv = $2,
           two_factor_secret_tag = $3,
           two_factor_pending_secret_ciphertext = NULL,
           two_factor_pending_secret_iv = NULL,
           two_factor_pending_secret_tag = NULL,
           two_factor_pending_created_at = NULL,
           two_factor_enabled = TRUE,
           two_factor_confirmed_at = NOW(),
           two_factor_last_used_step = NULL,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, name, first_name, last_name, email, department, position, avatar_mime,
                 role, status, can_manage_tool_access, two_factor_enabled,
                 two_factor_confirmed_at, approved_at, created_at, updated_at`,
      [activeSecret.ciphertext, activeSecret.iv, activeSecret.tag, userId]
    );

    await client.query('COMMIT');
    return { user: userUpdate.rows[0], recoveryCodes };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function verifyUserTwoFactor(userId, code) {
  const userResult = await query(
    `SELECT id, two_factor_enabled, two_factor_secret_ciphertext, two_factor_secret_iv,
            two_factor_secret_tag, two_factor_last_used_step
     FROM users
     WHERE id = $1`,
    [userId]
  );
  const user = userResult.rows[0];
  if (!user || user.two_factor_enabled !== true) {
    throw new AppError(403, 'TWO_FACTOR_NOT_ENABLED', '2FA не увімкнено для цього облікового запису.');
  }

  const secret = decryptSecret(user.two_factor_secret_ciphertext, user.two_factor_secret_iv, user.two_factor_secret_tag);
  const matchingStep = findTotpStep(secret, code, user.two_factor_last_used_step);
  if (matchingStep !== null) {
    const updated = await query(
      `UPDATE users
       SET two_factor_last_used_step = $1, updated_at = NOW()
       WHERE id = $2
         AND (two_factor_last_used_step IS NULL OR two_factor_last_used_step < $1)`,
      [matchingStep, userId]
    );
    if (updated.rowCount) return { method: 'totp' };
  }

  const recoveryCode = normalizeRecoveryCode(code);
  if (recoveryCode.length >= 8) {
    const recoveryResult = await query(
      `UPDATE user_two_factor_recovery_codes
       SET used_at = NOW()
       WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
       RETURNING id`,
      [userId, hashRecoveryCode(recoveryCode)]
    );
    if (recoveryResult.rows[0]) return { method: 'recovery' };
  }

  throw new AppError(401, 'INVALID_TWO_FACTOR_CODE', 'Код 2FA вказано неправильно або вже використано.');
}

export async function disableTwoFactor(userId, code) {
  await verifyUserTwoFactor(userId, code);

  const result = await query(
    `UPDATE users
     SET two_factor_secret_ciphertext = NULL,
         two_factor_secret_iv = NULL,
         two_factor_secret_tag = NULL,
         two_factor_pending_secret_ciphertext = NULL,
         two_factor_pending_secret_iv = NULL,
         two_factor_pending_secret_tag = NULL,
         two_factor_pending_created_at = NULL,
         two_factor_enabled = FALSE,
         two_factor_confirmed_at = NULL,
         two_factor_last_used_step = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, first_name, last_name, email, department, position, avatar_mime,
               role, status, can_manage_tool_access, two_factor_enabled,
               two_factor_confirmed_at, approved_at, created_at, updated_at`,
    [userId]
  );
  await query('DELETE FROM user_two_factor_recovery_codes WHERE user_id = $1', [userId]);

  return result.rows[0];
}
