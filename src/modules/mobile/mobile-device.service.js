import { pool } from '../../db/pool.js';
import { createDeviceCredential, hashDeviceAccessToken } from './mobile-crypto.js';

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
    `SELECT devices.*, users.name AS user_name, users.email AS user_email,
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
