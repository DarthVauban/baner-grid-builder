import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { describeLoginClient } from './mobile-login.service.js';
import {
  generateOpaqueMobileToken,
  hashQrApprovalNonce,
  hashQrBrowserToken,
  hashQrScanToken
} from './mobile-crypto.js';
import { verifyDeviceSignature } from './mobile-auth-key.service.js';
import { recordMobileSecurityEvent } from './mobile-security.service.js';
import { mobileQrLoginPayload, mobileWorkspaceMetadata } from './mobile-workspace-config.js';

const pollAfterMs = 1000;

function qrError(status, code, message) {
  return new AppError(status, code, message);
}

export function assertQrLoginEnabled() {
  if (!env.mobileQrLoginEnabled) {
    throw qrError(404, 'QR_LOGIN_DISABLED', 'QR-вхід наразі недоступний.');
  }
}

export function normalizeQrReturnPath(value) {
  const candidate = String(value || '/').trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return '/';
  try {
    const parsed = new URL(candidate, 'https://mt-workspace.invalid');
    if (parsed.origin !== 'https://mt-workspace.invalid') return '/';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`.slice(0, 2048) || '/';
  } catch (_error) {
    return '/';
  }
}

function safeEqual(left, right) {
  const first = Buffer.from(String(left || ''));
  const second = Buffer.from(String(right || ''));
  return first.length === second.length && crypto.timingSafeEqual(first, second);
}

function publicStatus(row) {
  if (row.status === 'pending' && row.scanned_at) return 'scanned';
  return row.status;
}

function serializeBrowserStatus(row) {
  return { status: publicStatus(row), expiresAt: new Date(row.expires_at).toISOString() };
}

async function expireChallenge(db, row, now = new Date()) {
  if (!['pending', 'approved'].includes(row.status)
    || new Date(row.expires_at).getTime() > now.getTime()) return row;
  const result = await db.query(
    `UPDATE mobile_qr_login_challenges
     SET status = 'expired', decided_at = COALESCE(decided_at, $2)
     WHERE id = $1 AND status IN ('pending', 'approved') AND expires_at <= $2
     RETURNING *`,
    [row.id, now]
  );
  const expired = result.rows[0] || row;
  if (result.rows[0]) {
    await recordMobileSecurityEvent(db, {
      userId: expired.user_id,
      deviceId: expired.approved_device_id,
      qrLoginChallengeId: expired.id,
      eventType: 'qr_login_expired',
      metadata: { environment: env.mobileEnvironment }
    });
  }
  return expired;
}

async function browserChallenge(db, challengeId, browserToken, { lock = false } = {}) {
  const result = await db.query(
    `SELECT * FROM mobile_qr_login_challenges
     WHERE id = $1 AND deployment_id = $2 AND browser_token_hash = $3
     ${lock ? 'FOR UPDATE' : ''}`,
    [challengeId, env.mobileDeploymentId, hashQrBrowserToken(browserToken)]
  );
  if (!result.rows[0]) {
    throw qrError(404, 'INVALID_QR_BROWSER_TOKEN', 'QR-запит не знайдено або він недійсний.');
  }
  return result.rows[0];
}

async function scanChallenge(db, challengeId, scanToken, { lock = false } = {}) {
  const result = await db.query(
    `SELECT * FROM mobile_qr_login_challenges
     WHERE id = $1 AND scan_token_hash = $2
     ${lock ? 'FOR UPDATE' : ''}`,
    [challengeId, hashQrScanToken(scanToken)]
  );
  const row = result.rows[0];
  if (!row) throw qrError(404, 'INVALID_QR_SCAN_TOKEN', 'QR-запит не знайдено або він недійсний.');
  if (row.deployment_id !== env.mobileDeploymentId) {
    throw qrError(409, 'QR_LOGIN_ENVIRONMENT_MISMATCH', 'QR-код належить іншому середовищу.');
  }
  return row;
}

function assertPending(row) {
  if (row.status === 'expired') throw qrError(410, 'QR_LOGIN_EXPIRED', 'Термін дії QR-коду завершився.');
  if (row.status === 'denied') throw qrError(409, 'QR_LOGIN_DENIED', 'Вхід відхилено.');
  if (row.status === 'cancelled') throw qrError(409, 'QR_LOGIN_CANCELLED', 'QR-вхід скасовано.');
  if (row.status === 'consumed') throw qrError(409, 'QR_LOGIN_ALREADY_CONSUMED', 'QR-код уже використано.');
  if (row.status !== 'pending') {
    throw qrError(409, 'QR_LOGIN_ALREADY_DECIDED', 'Рішення для QR-входу вже прийнято.');
  }
}

export async function createQrLoginChallenge(req, returnPath = '/', dbPool = pool, now = new Date()) {
  assertQrLoginEnabled();
  const scanToken = generateOpaqueMobileToken();
  const browserToken = generateOpaqueMobileToken();
  const initialNonce = generateOpaqueMobileToken();
  const userAgent = String(req.get('user-agent') || '').trim().slice(0, 4000);
  const clientInfo = describeLoginClient(userAgent);
  const expiresAt = new Date(now.getTime() + env.mobileQrLoginTtlSeconds * 1000);
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO mobile_qr_login_challenges (
         deployment_id, scan_token_hash, browser_token_hash, approval_nonce_hash,
         browser, operating_system, ip_address, user_agent, location,
         return_path, created_at, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        env.mobileDeploymentId,
        hashQrScanToken(scanToken),
        hashQrBrowserToken(browserToken),
        hashQrApprovalNonce(initialNonce),
        String(clientInfo.browser).slice(0, 160),
        String(clientInfo.operatingSystem).slice(0, 160),
        String(req.ip || '').slice(0, 64),
        userAgent,
        'Місце не визначено',
        normalizeQrReturnPath(returnPath),
        now,
        expiresAt
      ]
    );
    const challenge = result.rows[0];
    await recordMobileSecurityEvent(client, {
      qrLoginChallengeId: challenge.id,
      eventType: 'qr_login_created',
      metadata: {
        environment: env.mobileEnvironment,
        browser: challenge.browser,
        operatingSystem: challenge.operating_system
      }
    });
    await client.query('COMMIT');
    return {
      challengeId: challenge.id,
      browserToken,
      qrPayload: mobileQrLoginPayload(challenge.id, scanToken),
      expiresAt: expiresAt.toISOString(),
      pollAfterMs,
      deployment: mobileWorkspaceMetadata({ includeApiBaseUrl: false })
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getQrLoginStatus(challengeId, browserToken, dbPool = pool, now = new Date()) {
  assertQrLoginEnabled();
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    let challenge = await browserChallenge(client, challengeId, browserToken, { lock: true });
    challenge = await expireChallenge(client, challenge, now);
    await client.query('COMMIT');
    return serializeBrowserStatus(challenge);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelQrLoginChallenge(challengeId, browserToken, dbPool = pool, now = new Date()) {
  assertQrLoginEnabled();
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    let challenge = await browserChallenge(client, challengeId, browserToken, { lock: true });
    challenge = await expireChallenge(client, challenge, now);
    if (challenge.status === 'pending') {
      const result = await client.query(
        `UPDATE mobile_qr_login_challenges
         SET status = 'cancelled', cancelled_at = $2
         WHERE id = $1 AND status = 'pending'
         RETURNING *`,
        [challenge.id, now]
      );
      challenge = result.rows[0] || challenge;
      if (result.rows[0]) {
        await recordMobileSecurityEvent(client, {
          qrLoginChallengeId: challenge.id,
          eventType: 'qr_login_cancelled',
          metadata: { environment: env.mobileEnvironment }
        });
      }
    }
    await client.query('COMMIT');
    return serializeBrowserStatus(challenge);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function previewQrLoginChallenge(
  userId,
  deviceId,
  challengeId,
  scanToken,
  dbPool = pool,
  now = new Date()
) {
  assertQrLoginEnabled();
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    let challenge = await scanChallenge(client, challengeId, scanToken, { lock: true });
    challenge = await expireChallenge(client, challenge, now);
    assertPending(challenge);
    const deviceResult = await client.query(
      `SELECT devices.*, users.status AS user_status
       FROM mobile_devices AS devices
       JOIN users ON users.id = devices.user_id
       WHERE devices.id = $1 AND devices.user_id = $2
       FOR UPDATE`,
      [deviceId, userId]
    );
    const device = deviceResult.rows[0];
    if (!device || device.revoked_at || device.user_status !== 'approved') {
      throw qrError(401, 'ACCOUNT_DISABLED', 'Обліковий запис або пристрій неактивний.');
    }
    if (!device.auth_key_id || !device.auth_public_key) {
      throw qrError(409, 'DEVICE_SIGNING_KEY_REQUIRED', 'Оновіть MT Workspace, щоб підтверджувати QR-вхід.');
    }
    const approvalNonce = generateOpaqueMobileToken();
    const firstScan = !challenge.scanned_at;
    const updated = await client.query(
      `UPDATE mobile_qr_login_challenges
       SET scanned_at = COALESCE(scanned_at, $2), approval_nonce_hash = $3
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [challenge.id, now, hashQrApprovalNonce(approvalNonce)]
    );
    challenge = updated.rows[0];
    if (!challenge) throw qrError(409, 'QR_LOGIN_ALREADY_DECIDED', 'Рішення для QR-входу вже прийнято.');
    if (firstScan) {
      await recordMobileSecurityEvent(client, {
        userId,
        deviceId,
        qrLoginChallengeId: challenge.id,
        eventType: 'qr_login_scanned',
        metadata: { environment: env.mobileEnvironment }
      });
    }
    await client.query('COMMIT');
    return {
      challengeId: challenge.id,
      deployment: mobileWorkspaceMetadata({ includeApiBaseUrl: false }),
      request: {
        browser: challenge.browser,
        operatingSystem: challenge.operating_system,
        location: challenge.location,
        requestedAt: new Date(challenge.created_at).toISOString(),
        expiresAt: new Date(challenge.expires_at).toISOString()
      },
      approvalNonce,
      signatureVersion: 1
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function canonicalQrLoginSignature({
  action,
  deploymentId,
  challengeId,
  deviceId,
  approvalNonce,
  expiresAt
}) {
  return [
    'MTW-QR-LOGIN',
    'v1',
    action,
    deploymentId,
    challengeId,
    deviceId,
    approvalNonce,
    new Date(expiresAt).toISOString()
  ].join('\n');
}

export async function decideQrLoginChallenge({
  userId,
  deviceId,
  action,
  challengeId,
  scanToken,
  approvalNonce,
  keyId,
  signature,
  signatureVersion
}, dbPool = pool, now = new Date()) {
  assertQrLoginEnabled();
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    let challenge = await scanChallenge(client, challengeId, scanToken, { lock: true });
    challenge = await expireChallenge(client, challenge, now);
    assertPending(challenge);
    if (!challenge.scanned_at) throw qrError(401, 'INVALID_QR_APPROVAL_NONCE', 'Спочатку відскануйте QR-код.');
    if (!safeEqual(challenge.approval_nonce_hash, hashQrApprovalNonce(approvalNonce))) {
      throw qrError(401, 'INVALID_QR_APPROVAL_NONCE', 'Код підтвердження QR-входу недійсний.');
    }
    const deviceResult = await client.query(
      `SELECT devices.*, users.status AS user_status
       FROM mobile_devices AS devices
       JOIN users ON users.id = devices.user_id
       WHERE devices.id = $1 AND devices.user_id = $2
       FOR UPDATE`,
      [deviceId, userId]
    );
    const device = deviceResult.rows[0];
    if (!device || device.revoked_at || device.user_status !== 'approved') {
      throw qrError(401, 'ACCOUNT_DISABLED', 'Обліковий запис або пристрій неактивний.');
    }
    if (device.auth_key_id !== keyId || device.auth_key_algorithm !== 'ES256'
      || device.auth_key_version !== signatureVersion || signatureVersion !== 1) {
      throw qrError(401, 'INVALID_DEVICE_AUTH_KEY', 'Ключ підтвердження пристрою недійсний.');
    }
    verifyDeviceSignature(device, canonicalQrLoginSignature({
      action,
      deploymentId: challenge.deployment_id,
      challengeId: challenge.id,
      deviceId,
      approvalNonce,
      expiresAt: challenge.expires_at
    }), signature);
    const targetStatus = action === 'approve' ? 'approved' : 'denied';
    const result = await client.query(
      `UPDATE mobile_qr_login_challenges
       SET status = $1, user_id = $2, approved_device_id = $3,
           decided_at = $4, denial_reason = $5
       WHERE id = $6 AND status = 'pending' AND expires_at > $4
       RETURNING *`,
      [targetStatus, userId, deviceId, now, action === 'deny' ? 'user_denied' : null, challenge.id]
    );
    challenge = result.rows[0];
    if (!challenge) throw qrError(409, 'QR_LOGIN_ALREADY_DECIDED', 'Рішення для QR-входу вже прийнято.');
    await recordMobileSecurityEvent(client, {
      userId,
      deviceId,
      qrLoginChallengeId: challenge.id,
      eventType: action === 'approve' ? 'qr_login_approved' : 'qr_login_denied',
      metadata: { environment: env.mobileEnvironment, signatureVersion }
    });
    await client.query('COMMIT');
    return serializeBrowserStatus(challenge);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function consumeQrLoginChallenge(challengeId, browserToken, dbPool = pool, now = new Date()) {
  assertQrLoginEnabled();
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    let challenge = await browserChallenge(client, challengeId, browserToken, { lock: true });
    challenge = await expireChallenge(client, challenge, now);
    if (challenge.status === 'expired') throw qrError(410, 'QR_LOGIN_EXPIRED', 'Термін дії QR-коду завершився.');
    if (challenge.status === 'denied') throw qrError(409, 'QR_LOGIN_DENIED', 'Вхід відхилено.');
    if (challenge.status === 'cancelled') throw qrError(409, 'QR_LOGIN_CANCELLED', 'QR-вхід скасовано.');
    if (challenge.status === 'consumed' || challenge.consumed_at) {
      throw qrError(409, 'QR_LOGIN_ALREADY_CONSUMED', 'QR-код уже використано.');
    }
    if (challenge.status !== 'approved') {
      throw qrError(409, 'QR_LOGIN_NOT_APPROVED', 'QR-вхід ще не підтверджено.');
    }
    const result = await client.query(
      `SELECT users.*, devices.revoked_at AS approved_device_revoked_at,
              devices.user_id AS approved_device_user_id
       FROM users
       JOIN mobile_devices AS devices ON devices.id = $2
       WHERE users.id = $1`,
      [challenge.user_id, challenge.approved_device_id]
    );
    const user = result.rows[0];
    if (!user || user.status !== 'approved'
      || user.approved_device_revoked_at
      || user.approved_device_user_id !== user.id) {
      throw qrError(403, 'ACCOUNT_DISABLED', 'Обліковий запис або пристрій неактивний.');
    }
    const consumed = await client.query(
      `UPDATE mobile_qr_login_challenges
       SET status = 'consumed', consumed_at = $2
       WHERE id = $1 AND status = 'approved' AND consumed_at IS NULL AND expires_at > $2
       RETURNING *`,
      [challenge.id, now]
    );
    if (!consumed.rows[0]) throw qrError(409, 'QR_LOGIN_ALREADY_CONSUMED', 'QR-код уже використано.');
    await recordMobileSecurityEvent(client, {
      userId: user.id,
      deviceId: challenge.approved_device_id,
      qrLoginChallengeId: challenge.id,
      eventType: 'qr_login_consumed',
      metadata: { environment: env.mobileEnvironment }
    });
    await client.query('COMMIT');
    return { user, returnPath: normalizeQrReturnPath(challenge.return_path) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export { pollAfterMs };
