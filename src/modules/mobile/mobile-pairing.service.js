import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import {
  decryptTwoFactorSecret,
  generateTwoFactorRecoveryCodes,
  generateTwoFactorSecret,
  verifyUserTwoFactor
} from '../auth/two-factor.service.js';
import {
  decryptMobileValue,
  encryptMobileValue,
  generateManualPairingCode,
  generateOpaqueMobileToken,
  hashPairingManualCode,
  hashPairingQrToken
} from './mobile-crypto.js';
import { serializeMobileDevice } from './mobile-device.service.js';
import { recordMobileSecurityEvent } from './mobile-security.service.js';

export const mobilePairingTtlMs = 10 * 60 * 1000;

function encryptedColumns(row, prefix) {
  return {
    ciphertext: row[`${prefix}_ciphertext`],
    iv: row[`${prefix}_iv`],
    tag: row[`${prefix}_tag`]
  };
}

export function serializeMobilePairing(row, { includeRecoveryCodes = false } = {}) {
  const result = {
    id: row.id,
    status: row.status,
    purpose: row.purpose,
    expiresAt: row.expires_at,
    device: row.claimed_device_id ? serializeMobileDevice({
      id: row.claimed_device_id,
      name: row.device_name,
      platform: row.device_platform,
      paired_at: row.device_paired_at,
      last_seen_at: row.device_last_seen_at,
      revoked_at: row.device_revoked_at,
      fcm_token_ciphertext: row.device_fcm_token_ciphertext,
      fcm_token_hash: row.device_fcm_token_hash
    }) : null
  };
  if (includeRecoveryCodes && row.recovery_codes_ciphertext) {
    result.recoveryCodes = JSON.parse(decryptMobileValue(
      encryptedColumns(row, 'recovery_codes'),
      'pairing-recovery-codes'
    ));
  }
  return result;
}

async function loadPairingForUser(db, userId, pairingId) {
  const result = await db.query(
    `SELECT pairings.*,
            devices.name AS device_name, devices.platform AS device_platform,
            devices.paired_at AS device_paired_at, devices.last_seen_at AS device_last_seen_at,
            devices.revoked_at AS device_revoked_at,
            devices.fcm_token_ciphertext AS device_fcm_token_ciphertext,
            devices.fcm_token_hash AS device_fcm_token_hash
     FROM mobile_pairings AS pairings
     LEFT JOIN mobile_devices AS devices ON devices.id = pairings.claimed_device_id
     WHERE pairings.id = $1 AND pairings.user_id = $2`,
    [pairingId, userId]
  );
  return result.rows[0] || null;
}

async function expirePairing(db, pairing) {
  if (pairing.status !== 'pending' || new Date(pairing.expires_at).getTime() > Date.now()) return pairing;
  const expired = await db.query(
    `UPDATE mobile_pairings
     SET status = 'expired'
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [pairing.id]
  );
  if (expired.rows[0]) {
    await recordMobileSecurityEvent(db, {
      userId: pairing.user_id,
      pairingId: pairing.id,
      eventType: 'pairing_expired'
    });
    return { ...pairing, ...expired.rows[0] };
  }
  return pairing;
}

export async function createMobilePairing(userId, { purpose, code = '' }, dbPool = pool) {
  if (purpose === 'add_device') await verifyUserTwoFactor(userId, code);
  const client = await dbPool.connect();
  const qrToken = generateOpaqueMobileToken();
  const manualCode = generateManualPairingCode();
  const expiresAt = new Date(Date.now() + mobilePairingTtlMs);

  try {
    await client.query('BEGIN');
    const userResult = await client.query(
      `SELECT id, two_factor_enabled, two_factor_method,
              two_factor_secret_ciphertext, two_factor_secret_iv, two_factor_secret_tag
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено.');
    if (purpose === 'enable_2fa' && user.two_factor_enabled === true) {
      throw new AppError(409, 'TWO_FACTOR_ALREADY_ENABLED', '2FA вже увімкнено.');
    }
    if (purpose === 'add_device' && (user.two_factor_enabled !== true || user.two_factor_method !== 'mt_workspace')) {
      throw new AppError(409, 'MT_WORKSPACE_NOT_ENABLED', 'Спочатку увімкніть 2FA через MT Workspace.');
    }

    const secret = purpose === 'enable_2fa'
      ? generateTwoFactorSecret()
      : decryptTwoFactorSecret(
        user.two_factor_secret_ciphertext,
        user.two_factor_secret_iv,
        user.two_factor_secret_tag
      );
    const recoveryCodes = purpose === 'enable_2fa' ? generateTwoFactorRecoveryCodes() : null;
    const encryptedSecret = encryptMobileValue(secret, 'pairing-totp-secret');
    const encryptedRecoveryCodes = recoveryCodes
      ? encryptMobileValue(JSON.stringify(recoveryCodes), 'pairing-recovery-codes')
      : null;

    const cancelled = await client.query(
      `UPDATE mobile_pairings
       SET status = 'cancelled', cancelled_at = NOW()
       WHERE user_id = $1 AND status = 'pending'
       RETURNING id`,
      [userId]
    );
    for (const pairing of cancelled.rows) {
      await recordMobileSecurityEvent(client, {
        userId,
        pairingId: pairing.id,
        eventType: 'pairing_cancelled',
        metadata: { reason: 'replaced' }
      });
    }

    const inserted = await client.query(
      `INSERT INTO mobile_pairings (
         user_id, purpose, qr_token_hash, manual_code_hash,
         secret_ciphertext, secret_iv, secret_tag,
         recovery_codes_ciphertext, recovery_codes_iv, recovery_codes_tag,
         expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        userId,
        purpose,
        hashPairingQrToken(qrToken),
        hashPairingManualCode(manualCode),
        encryptedSecret.ciphertext,
        encryptedSecret.iv,
        encryptedSecret.tag,
        encryptedRecoveryCodes?.ciphertext || null,
        encryptedRecoveryCodes?.iv || null,
        encryptedRecoveryCodes?.tag || null,
        expiresAt
      ]
    );
    await recordMobileSecurityEvent(client, {
      userId,
      pairingId: inserted.rows[0].id,
      eventType: 'pairing_created',
      metadata: { purpose }
    });
    await client.query('COMMIT');
    return {
      id: inserted.rows[0].id,
      status: 'pending',
      qrPayload: `mtworkspace://pair?token=${qrToken}`,
      manualCode,
      expiresAt: expiresAt.toISOString()
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getMobilePairing(userId, pairingId, db = pool) {
  const row = await loadPairingForUser(db, userId, pairingId);
  if (!row) throw new AppError(404, 'PAIRING_NOT_FOUND', 'Код підключення не знайдено.');
  const pairing = await expirePairing(db, row);
  return serializeMobilePairing(pairing, {
    includeRecoveryCodes: pairing.status === 'claimed' && pairing.purpose === 'enable_2fa'
  });
}

export async function acknowledgeMobilePairing(userId, pairingId, db = pool) {
  const result = await db.query(
    `UPDATE mobile_pairings
     SET recovery_codes_ciphertext = NULL,
         recovery_codes_iv = NULL,
         recovery_codes_tag = NULL
     WHERE id = $1 AND user_id = $2 AND status = 'claimed'
     RETURNING id`,
    [pairingId, userId]
  );
  if (!result.rows[0]) throw new AppError(404, 'PAIRING_NOT_FOUND', 'Підключення не знайдено.');
}

export async function cancelMobilePairing(userId, pairingId, db = pool) {
  const result = await db.query(
    `UPDATE mobile_pairings
     SET status = 'cancelled', cancelled_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING id`,
    [pairingId, userId]
  );
  if (result.rows[0]) {
    await recordMobileSecurityEvent(db, {
      userId,
      pairingId,
      eventType: 'pairing_cancelled',
      metadata: { reason: 'user' }
    });
  }
}

export async function loadPairingByClaimToken(pairingToken, db = pool) {
  const result = await db.query(
    `SELECT *
     FROM mobile_pairings
     WHERE qr_token_hash = $1 OR manual_code_hash = $2`,
    [hashPairingQrToken(pairingToken), hashPairingManualCode(pairingToken)]
  );
  return result.rows[0] || null;
}

export function decryptPairingSecret(row) {
  return decryptMobileValue(encryptedColumns(row, 'secret'), 'pairing-totp-secret');
}

export function decryptPairingRecoveryCodes(row) {
  if (!row.recovery_codes_ciphertext) return [];
  return JSON.parse(decryptMobileValue(
    encryptedColumns(row, 'recovery_codes'),
    'pairing-recovery-codes'
  ));
}
