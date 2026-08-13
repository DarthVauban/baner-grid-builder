import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { verifyUserTwoFactor } from '../auth/two-factor.service.js';
import { recordMobileSecurityEvent } from './mobile-security.service.js';

function decodeCoordinate(value) {
  try {
    return Buffer.from(String(value || ''), 'base64url');
  } catch (_error) {
    return Buffer.alloc(0);
  }
}

export function normalizeDeviceAuthKey(input) {
  const keyId = String(input?.keyId || '').trim();
  const algorithm = String(input?.algorithm || '').trim();
  const version = Number(input?.version || 1);
  const jwk = input?.publicKeyJwk;
  const invalid = () => new AppError(422, 'INVALID_DEVICE_AUTH_KEY', 'Ключ підтвердження пристрою недійсний.');
  if (!/^[A-Za-z0-9._~-]{8,160}$/.test(keyId) || algorithm !== 'ES256' || version !== 1) throw invalid();
  if (!jwk || typeof jwk !== 'object' || Array.isArray(jwk)
    || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || jwk.d
    || decodeCoordinate(jwk.x).length !== 32 || decodeCoordinate(jwk.y).length !== 32) {
    throw invalid();
  }
  const publicKeyJwk = { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
  try {
    crypto.createPublicKey({ key: publicKeyJwk, format: 'jwk' });
  } catch (_error) {
    throw invalid();
  }
  return { keyId, algorithm, version, publicKeyJwk };
}

export function verifyDeviceSignature(device, canonicalPayload, signature) {
  if (!device?.auth_key_id || !device.auth_public_key) {
    throw new AppError(409, 'DEVICE_SIGNING_KEY_REQUIRED', 'Оновіть MT Workspace, щоб підтверджувати QR-вхід.');
  }
  let signatureBuffer;
  try {
    signatureBuffer = Buffer.from(String(signature || ''), 'base64url');
  } catch (_error) {
    signatureBuffer = Buffer.alloc(0);
  }
  if (signatureBuffer.length !== 64) {
    throw new AppError(401, 'INVALID_DEVICE_SIGNATURE', 'Підпис пристрою недійсний.');
  }
  let publicKey;
  try {
    publicKey = crypto.createPublicKey({ key: device.auth_public_key, format: 'jwk' });
  } catch (_error) {
    throw new AppError(401, 'INVALID_DEVICE_AUTH_KEY', 'Ключ підтвердження пристрою недійсний.');
  }
  const valid = crypto.verify(
    'sha256',
    Buffer.from(canonicalPayload, 'utf8'),
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    signatureBuffer
  );
  if (!valid) throw new AppError(401, 'INVALID_DEVICE_SIGNATURE', 'Підпис пристрою недійсний.');
}

export async function registerMobileDeviceAuthKey(
  userId,
  deviceId,
  input,
  totpCode,
  dbPool = pool
) {
  const authKey = normalizeDeviceAuthKey(input);
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT * FROM mobile_devices
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [deviceId, userId]
    );
    const device = result.rows[0];
    if (!device || device.revoked_at) {
      throw new AppError(404, 'MOBILE_DEVICE_NOT_FOUND', 'Мобільний пристрій не знайдено.');
    }
    if (device.auth_key_id) {
      throw new AppError(409, 'DEVICE_AUTH_KEY_ALREADY_REGISTERED', 'Ключ цього пристрою вже зареєстровано.');
    }
    await verifyUserTwoFactor(userId, totpCode, client);
    await client.query(
      `UPDATE mobile_devices
       SET auth_key_id = $1, auth_public_key = $2::JSONB,
           auth_key_algorithm = $3, auth_key_version = $4,
           auth_key_registered_at = NOW()
       WHERE id = $5 AND user_id = $6 AND auth_key_id IS NULL`,
      [authKey.keyId, JSON.stringify(authKey.publicKeyJwk), authKey.algorithm, authKey.version, deviceId, userId]
    );
    await recordMobileSecurityEvent(client, {
      userId,
      deviceId,
      eventType: 'mobile_auth_key_registered',
      metadata: { algorithm: authKey.algorithm, version: authKey.version, keyId: authKey.keyId }
    });
    await client.query('COMMIT');
    return { keyId: authKey.keyId, algorithm: authKey.algorithm, version: authKey.version };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
