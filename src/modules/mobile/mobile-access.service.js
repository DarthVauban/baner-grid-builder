import { env } from '../../config/env.js';
import { recordMobileSecurityEvent } from './mobile-security.service.js';

function hasPushCredential(device) {
  return Boolean(
    device.fcm_token_ciphertext
    && device.fcm_token_iv
    && device.fcm_token_tag
    && device.fcm_token_hash
  );
}

async function stopPendingDevicePush(db, deviceId, reason) {
  await db.query(
    `UPDATE mobile_push_outbox
     SET status = 'failed', processed_at = NOW(), last_error = $1
     WHERE device_id = $2
       AND kind <> 'device_revoked'
       AND status IN ('pending', 'processing', 'retry')`,
    [reason, deviceId]
  );
}

async function enqueueDeviceRevokedPush(db, device) {
  if (!env.mobilePushEnabled || !hasPushCredential(device)) return false;
  await db.query(
    `INSERT INTO mobile_push_outbox (device_id, kind, payload)
     VALUES ($1, 'device_revoked', $2::JSONB)`,
    [device.id, JSON.stringify({ kind: 'device_revoked', deviceId: device.id })]
  );
  return true;
}

export async function revokeMobileDeviceInTransaction(db, device, {
  userId,
  reason,
  revokedBy = null,
  queuePush = true
}) {
  if (device.revoked_at) return device;
  await stopPendingDevicePush(db, device.id, 'DEVICE_REVOKED');
  const preservePushCredential = queuePush && await enqueueDeviceRevokedPush(db, device);
  const revoked = await db.query(
    `UPDATE mobile_devices
     SET revoked_at = NOW(), revoked_by = $1, revocation_reason = $2,
         fcm_token_ciphertext = CASE WHEN $3::BOOLEAN THEN fcm_token_ciphertext ELSE NULL END,
         fcm_token_iv = CASE WHEN $3::BOOLEAN THEN fcm_token_iv ELSE NULL END,
         fcm_token_tag = CASE WHEN $3::BOOLEAN THEN fcm_token_tag ELSE NULL END,
         fcm_token_hash = CASE WHEN $3::BOOLEAN THEN fcm_token_hash ELSE NULL END
     WHERE id = $4 AND revoked_at IS NULL
     RETURNING *`,
    [revokedBy, reason, preservePushCredential, device.id]
  );
  const row = revoked.rows[0] || device;
  await recordMobileSecurityEvent(db, {
    userId,
    deviceId: device.id,
    eventType: 'device_revoked',
    metadata: {
      reason,
      revokedBy: revokedBy || null,
      targetUserId: userId,
      targetDeviceId: device.id
    }
  });
  return row;
}

export async function closePendingMobileLoginRequests(db, userId, reason) {
  const denied = await db.query(
    `UPDATE mobile_login_requests
     SET status = 'denied', decided_at = NOW(), decided_by_device_id = NULL,
         decision_method = NULL
     WHERE user_id = $1 AND status = 'pending'
     RETURNING id`,
    [userId]
  );
  for (const request of denied.rows) {
    await recordMobileSecurityEvent(db, {
      userId,
      loginRequestId: request.id,
      eventType: 'login_request_denied',
      metadata: { reason }
    });
  }
  return denied.rowCount;
}

async function cancelPendingMobilePairings(db, userId, reason) {
  const cancelled = await db.query(
    `UPDATE mobile_pairings
     SET status = 'cancelled', cancelled_at = NOW()
     WHERE user_id = $1 AND status = 'pending'
     RETURNING id`,
    [userId]
  );
  for (const pairing of cancelled.rows) {
    await recordMobileSecurityEvent(db, {
      userId,
      pairingId: pairing.id,
      eventType: 'pairing_cancelled',
      metadata: { reason }
    });
  }
  return cancelled.rowCount;
}

export async function revokeAllMobileAccessInTransaction(db, userId, {
  reason,
  revokedBy = null,
  queuePush = true
}) {
  const devices = await db.query(
    `SELECT * FROM mobile_devices
     WHERE user_id = $1 AND revoked_at IS NULL
     ORDER BY paired_at
     FOR UPDATE`,
    [userId]
  );
  for (const device of devices.rows) {
    await revokeMobileDeviceInTransaction(db, device, {
      userId,
      reason,
      revokedBy,
      queuePush
    });
  }
  const pairingsCancelled = await cancelPendingMobilePairings(db, userId, reason);
  const loginRequestsDenied = await closePendingMobileLoginRequests(db, userId, reason);
  await recordMobileSecurityEvent(db, {
    userId,
    eventType: 'mobile_access_revoked',
    metadata: {
      reason,
      revokedBy: revokedBy || null,
      targetUserId: userId,
      devicesRevoked: devices.rowCount,
      pairingsCancelled,
      loginRequestsDenied
    }
  });
  return {
    devicesRevoked: devices.rowCount,
    pairingsCancelled,
    loginRequestsDenied
  };
}
