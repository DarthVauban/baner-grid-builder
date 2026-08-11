import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import {
  createDeviceCredential,
  encryptMobileValue,
  hashDeviceAccessToken,
  hashFcmToken
} from './mobile-crypto.js';
import { recordMobileSecurityEvent } from './mobile-security.service.js';

export function serializeMobileDevice(row) {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    pairedAt: row.paired_at,
    lastSeenAt: row.last_seen_at || null,
    pushConfigured: Boolean(row.fcm_token_ciphertext && row.fcm_token_hash),
    revokedAt: row.revoked_at || null
  };
}

export async function listMobileDevices(userId, db = pool) {
  const result = await db.query(
    `SELECT *
     FROM mobile_devices
     WHERE user_id = $1
     ORDER BY paired_at DESC`,
    [userId]
  );
  return result.rows.map(serializeMobileDevice);
}

export async function countActiveMobileDevices(userId, db = pool) {
  const result = await db.query(
    `SELECT COUNT(*)::INTEGER AS count
     FROM mobile_devices
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
  return result.rows[0]?.count || 0;
}

export function newMobileDeviceCredential() {
  return createDeviceCredential();
}

export async function findMobileDeviceByAccessToken(accessToken, db = pool) {
  const result = await db.query(
    `SELECT devices.*, users.id AS authenticated_user_id,
            users.name AS user_name, users.first_name AS user_first_name,
            users.last_name AS user_last_name, users.email AS user_email,
            users.department AS user_department, users.position AS user_position,
            users.avatar_mime AS user_avatar_mime,
            users.role AS user_role, users.status AS user_status,
            users.can_manage_tool_access, users.two_factor_enabled,
            users.two_factor_method, users.two_factor_confirmed_at,
            users.approved_at, users.created_at AS user_created_at,
            users.updated_at AS user_updated_at
     FROM mobile_devices AS devices
     JOIN users ON users.id = devices.user_id
     WHERE devices.access_token_hash = $1`,
    [hashDeviceAccessToken(accessToken)]
  );
  return result.rows[0] || null;
}

export async function touchMobileDeviceLastSeen(deviceId, db = pool) {
  await db.query(
    `UPDATE mobile_devices
     SET last_seen_at = NOW()
     WHERE id = $1
       AND revoked_at IS NULL
       AND (last_seen_at IS NULL OR last_seen_at < NOW() - INTERVAL '5 minutes')`,
    [deviceId]
  );
}

export async function setMobileDevicePushToken(userId, deviceId, token, platform, dbPool = pool) {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const deviceResult = await client.query(
      `SELECT * FROM mobile_devices
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [deviceId, userId]
    );
    const device = deviceResult.rows[0];
    if (!device) throw new AppError(404, 'MOBILE_DEVICE_NOT_FOUND', 'Мобільний пристрій не знайдено.');
    if (device.revoked_at) throw new AppError(401, 'DEVICE_REVOKED', 'Доступ цього пристрою відкликано.');
    if (device.platform !== platform) {
      throw new AppError(422, 'DEVICE_PLATFORM_MISMATCH', 'Платформа пристрою не збігається.');
    }

    const tokenHash = hashFcmToken(token);
    const encrypted = encryptMobileValue(token, 'fcm-token');
    await client.query(
      `UPDATE mobile_devices
       SET fcm_token_ciphertext = NULL, fcm_token_iv = NULL,
           fcm_token_tag = NULL, fcm_token_hash = NULL
       WHERE fcm_token_hash = $1 AND id <> $2`,
      [tokenHash, deviceId]
    );
    await client.query(
      `UPDATE mobile_devices
       SET fcm_token_ciphertext = $1, fcm_token_iv = $2,
           fcm_token_tag = $3, fcm_token_hash = $4
       WHERE id = $5`,
      [encrypted.ciphertext, encrypted.iv, encrypted.tag, tokenHash, deviceId]
    );
    await recordMobileSecurityEvent(client, {
      userId,
      deviceId,
      eventType: 'push_token_registered',
      metadata: { platform }
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeMobileDevice(
  userId,
  deviceId,
  { allowLast = false, reason = 'user' } = {},
  dbPool = pool
) {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const deviceResult = await client.query(
      `SELECT * FROM mobile_devices
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [deviceId, userId]
    );
    const device = deviceResult.rows[0];
    if (!device) throw new AppError(404, 'MOBILE_DEVICE_NOT_FOUND', 'Мобільний пристрій не знайдено.');
    if (device.revoked_at) {
      await client.query('COMMIT');
      return serializeMobileDevice(device);
    }
    if (!allowLast) {
      const active = await client.query(
        `SELECT COUNT(*)::INTEGER AS count
         FROM mobile_devices
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId]
      );
      if ((active.rows[0]?.count || 0) <= 1) {
        throw new AppError(
          409,
          'LAST_MOBILE_DEVICE',
          'Спочатку додайте інший пристрій або вимкніть 2FA через MT Workspace.'
        );
      }
    }

    const revoked = await client.query(
      `UPDATE mobile_devices
       SET revoked_at = NOW(), revocation_reason = $1,
           fcm_token_ciphertext = NULL, fcm_token_iv = NULL,
           fcm_token_tag = NULL, fcm_token_hash = NULL
       WHERE id = $2
       RETURNING *`,
      [reason, deviceId]
    );
    await recordMobileSecurityEvent(client, {
      userId,
      deviceId,
      eventType: 'device_revoked',
      metadata: { reason }
    });
    await client.query('COMMIT');
    return serializeMobileDevice(revoked.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
