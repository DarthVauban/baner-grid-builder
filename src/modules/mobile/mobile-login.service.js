import { randomUUID } from 'node:crypto';
import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { hashLoginChallengeId } from './mobile-crypto.js';
import { recordMobileSecurityEvent } from './mobile-security.service.js';

const loginRequestTtlMs = 5 * 60 * 1000;

function limit(value, max) {
  return String(value || '').trim().slice(0, max);
}

export function describeLoginClient(userAgent) {
  const value = String(userAgent || '');
  const browserMatch = value.match(/Edg\/([\d.]+)/)
    || value.match(/Chrome\/([\d.]+)/)
    || value.match(/Firefox\/([\d.]+)/)
    || value.match(/Version\/([\d.]+).*Safari\//);
  let browser = 'Невідомий браузер';
  if (/Edg\//.test(value)) browser = `Edge ${browserMatch?.[1]?.split('.')[0] || ''}`.trim();
  else if (/Chrome\//.test(value)) browser = `Chrome ${browserMatch?.[1]?.split('.')[0] || ''}`.trim();
  else if (/Firefox\//.test(value)) browser = `Firefox ${browserMatch?.[1]?.split('.')[0] || ''}`.trim();
  else if (/Safari\//.test(value) && /Version\//.test(value)) {
    browser = `Safari ${browserMatch?.[1]?.split('.')[0] || ''}`.trim();
  }

  let operatingSystem = 'Невідома система';
  if (/Windows NT/.test(value)) operatingSystem = 'Windows';
  else {
    const android = value.match(/Android ([\d.]+)/);
    const ios = value.match(/iPhone OS ([\d_]+)/);
    const macos = value.match(/Mac OS X ([\d_]+)/);
    if (android) operatingSystem = `Android ${android[1].split('.')[0]}`;
    else if (ios) operatingSystem = `iOS ${ios[1].replaceAll('_', '.')}`;
    else if (macos) operatingSystem = `macOS ${macos[1].replaceAll('_', '.')}`;
    else if (/Linux/.test(value)) operatingSystem = 'Linux';
  }
  return { browser, operatingSystem };
}

export function serializeMobileLoginRequest(row) {
  return {
    id: row.id,
    browser: row.browser,
    operatingSystem: row.operating_system,
    location: row.location,
    ipAddress: row.ip_address,
    requestedAt: row.requested_at,
    expiresAt: row.expires_at,
    status: row.status
  };
}

async function expireLoginRequest(client, request) {
  if (request.status !== 'pending' || new Date(request.expires_at).getTime() > Date.now()) return request;
  const expired = await client.query(
    `UPDATE mobile_login_requests
     SET status = 'expired', decided_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [request.id]
  );
  if (!expired.rows[0]) return request;
  await recordMobileSecurityEvent(client, {
    userId: request.user_id,
    loginRequestId: request.id,
    eventType: 'login_expired'
  });
  return expired.rows[0];
}

export async function createMobileLoginRequest(user, req, dbPool = pool) {
  const client = await dbPool.connect();
  const jwtId = randomUUID();
  const expiresAt = new Date(Date.now() + loginRequestTtlMs);
  const userAgent = limit(req.get('user-agent'), 4000);
  const clientInfo = describeLoginClient(userAgent);
  try {
    await client.query('BEGIN');
    const devices = await client.query(
      `SELECT id FROM mobile_devices
       WHERE user_id = $1 AND revoked_at IS NULL
       ORDER BY paired_at`,
      [user.id]
    );
    const inserted = await client.query(
      `INSERT INTO mobile_login_requests (
         user_id, challenge_hash, browser, operating_system,
         location, ip_address, user_agent, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        user.id,
        hashLoginChallengeId(jwtId),
        limit(clientInfo.browser, 160),
        limit(clientInfo.operatingSystem, 160),
        'Місце не визначено',
        limit(req.ip, 64),
        userAgent,
        expiresAt
      ]
    );
    const loginRequest = inserted.rows[0];
    for (const device of devices.rows) {
      await client.query(
         `INSERT INTO mobile_push_outbox (
           device_id, kind, login_request_id, payload
         ) VALUES ($1, 'login_request', $2, $3::JSONB)
         ON CONFLICT DO NOTHING`,
        [device.id, loginRequest.id, JSON.stringify({ kind: 'login_request', requestId: loginRequest.id })]
      );
    }
    await recordMobileSecurityEvent(client, {
      userId: user.id,
      loginRequestId: loginRequest.id,
      eventType: 'login_requested',
      metadata: { activeDeviceCount: devices.rowCount }
    });
    await client.query('COMMIT');
    return {
      request: serializeMobileLoginRequest(loginRequest),
      jwtId,
      activeDeviceCount: devices.rowCount
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function lockedRequestForChallenge(client, userId, requestId, jwtId) {
  const result = await client.query(
    `SELECT * FROM mobile_login_requests
     WHERE id = $1 AND user_id = $2 AND challenge_hash = $3
     FOR UPDATE`,
    [requestId, userId, hashLoginChallengeId(jwtId)]
  );
  if (!result.rows[0]) {
    throw new AppError(404, 'LOGIN_REQUEST_NOT_FOUND', 'Запит підтвердження входу не знайдено.');
  }
  return expireLoginRequest(client, result.rows[0]);
}

export async function consumeMobileLoginRequest(payload, requestId, dbPool = pool) {
  if (!payload?.jti || payload.mobileLoginRequestId !== requestId) {
    throw new AppError(404, 'LOGIN_REQUEST_NOT_FOUND', 'Запит підтвердження входу не знайдено.');
  }
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const request = await lockedRequestForChallenge(client, payload.sub, requestId, payload.jti);
    if (request.status === 'pending') {
      await client.query('COMMIT');
      return { request: serializeMobileLoginRequest(request), user: null, consumed: false };
    }
    if (request.status === 'denied') {
      await client.query('COMMIT');
      return { request: serializeMobileLoginRequest(request), user: null, consumed: false };
    }
    if (request.status === 'expired') {
      await client.query('COMMIT');
      return { request: serializeMobileLoginRequest(request), user: null, consumed: false };
    }
    if (request.consumed_at) {
      await client.query('COMMIT');
      return { request: serializeMobileLoginRequest(request), user: null, consumed: false };
    }

    const consumed = await client.query(
      `UPDATE mobile_login_requests
       SET consumed_at = NOW()
       WHERE id = $1 AND status = 'approved' AND consumed_at IS NULL
       RETURNING id`,
      [request.id]
    );
    if (!consumed.rows[0]) {
      await client.query('COMMIT');
      return { request: serializeMobileLoginRequest(request), user: null, consumed: false };
    }
    const userResult = await client.query('SELECT * FROM users WHERE id = $1', [request.user_id]);
    const user = userResult.rows[0];
    if (!user || user.status !== 'approved') {
      throw new AppError(403, 'ACCOUNT_NOT_APPROVED', 'Обліковий запис користувача неактивний.');
    }
    await recordMobileSecurityEvent(client, {
      userId: request.user_id,
      loginRequestId: request.id,
      eventType: 'browser_login_consumed',
      metadata: { decisionMethod: request.decision_method || 'mobile' }
    });
    await client.query('COMMIT');
    return { request: serializeMobileLoginRequest(request), user, consumed: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelMobileLoginRequest(payload, db = pool) {
  if (!payload?.jti || !payload.mobileLoginRequestId) return;
  const result = await db.query(
    `UPDATE mobile_login_requests
     SET status = 'denied', decided_at = NOW(), consumed_at = NOW()
     WHERE id = $1 AND user_id = $2 AND challenge_hash = $3 AND status = 'pending'
     RETURNING id`,
    [payload.mobileLoginRequestId, payload.sub, hashLoginChallengeId(payload.jti)]
  );
  if (result.rows[0]) {
    await recordMobileSecurityEvent(db, {
      userId: payload.sub,
      loginRequestId: payload.mobileLoginRequestId,
      eventType: 'login_cancelled'
    });
  }
}

export async function listMobileLoginRequests(userId, db = pool) {
  const expired = await db.query(
    `UPDATE mobile_login_requests
     SET status = 'expired', decided_at = NOW()
     WHERE user_id = $1 AND status = 'pending' AND expires_at <= NOW()
     RETURNING id`,
    [userId]
  );
  for (const row of expired.rows) {
    await recordMobileSecurityEvent(db, {
      userId,
      loginRequestId: row.id,
      eventType: 'login_expired'
    });
  }
  const result = await db.query(
    `SELECT * FROM mobile_login_requests
     WHERE user_id = $1
     ORDER BY requested_at DESC
     LIMIT 20`,
    [userId]
  );
  return result.rows.map(serializeMobileLoginRequest);
}

export async function decideMobileLoginRequest(userId, deviceId, requestId, decision, dbPool = pool) {
  const client = await dbPool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    const result = await client.query(
      `SELECT * FROM mobile_login_requests
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [requestId, userId]
    );
    let request = result.rows[0];
    if (!request) throw new AppError(404, 'LOGIN_REQUEST_NOT_FOUND', 'Запит входу не знайдено.');
    request = await expireLoginRequest(client, request);
    if (request.status === 'expired') {
      await client.query('COMMIT');
      transactionOpen = false;
      throw new AppError(410, 'LOGIN_REQUEST_EXPIRED', 'Термін підтвердження входу завершився.');
    }
    const targetStatus = decision === 'approve' ? 'approved' : 'denied';
    if (request.status === targetStatus) {
      await client.query('COMMIT');
      transactionOpen = false;
      return serializeMobileLoginRequest(request);
    }
    if (request.status !== 'pending') {
      throw new AppError(409, 'LOGIN_REQUEST_ALREADY_DECIDED', 'Рішення для цього запиту вже прийнято.');
    }
    const updated = await client.query(
      `UPDATE mobile_login_requests
       SET status = $1, decided_at = NOW(), decided_by_device_id = $2,
           decision_method = 'mobile'
       WHERE id = $3 AND status = 'pending'
       RETURNING *`,
      [targetStatus, deviceId, requestId]
    );
    request = updated.rows[0];
    await recordMobileSecurityEvent(client, {
      userId,
      deviceId,
      loginRequestId: requestId,
      eventType: targetStatus === 'approved' ? 'login_approved' : 'login_denied',
      metadata: { decisionMethod: 'mobile' }
    });
    await client.query('COMMIT');
    transactionOpen = false;
    return serializeMobileLoginRequest(request);
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function fallbackError(request) {
  if (request.status === 'denied') {
    return new AppError(409, 'LOGIN_REQUEST_DENIED', 'Запит входу відхилено у мобільному застосунку.');
  }
  if (request.status === 'expired') {
    return new AppError(410, 'LOGIN_REQUEST_EXPIRED', 'Термін підтвердження входу завершився.');
  }
  if (request.status !== 'pending') {
    return new AppError(409, 'LOGIN_REQUEST_ALREADY_DECIDED', 'Запит входу вже завершено.');
  }
  return null;
}

export async function completeMobileLoginWithFallback(client, payload, method) {
  if (!payload?.mobileLoginRequestId) return;
  const request = await lockedRequestForChallenge(
    client,
    payload.sub,
    payload.mobileLoginRequestId,
    payload.jti
  );
  const error = fallbackError(request);
  if (error) throw error;
  await client.query(
    `UPDATE mobile_login_requests
     SET status = 'approved', decided_at = NOW(), consumed_at = NOW(),
         decision_method = $1
     WHERE id = $2 AND status = 'pending'`,
    [method, request.id]
  );
  await recordMobileSecurityEvent(client, {
    userId: payload.sub,
    loginRequestId: request.id,
    eventType: 'login_approved',
    metadata: { decisionMethod: method }
  });
}

export async function completeMobileLoginWithPasskey(client, userId, requestId) {
  if (!requestId) return;
  const result = await client.query(
    `SELECT * FROM mobile_login_requests
     WHERE id = $1 AND user_id = $2
     FOR UPDATE`,
    [requestId, userId]
  );
  let request = result.rows[0];
  if (!request) throw new AppError(404, 'LOGIN_REQUEST_NOT_FOUND', 'Запит входу не знайдено.');
  request = await expireLoginRequest(client, request);
  const error = fallbackError(request);
  if (error) throw error;
  await client.query(
    `UPDATE mobile_login_requests
     SET status = 'approved', decided_at = NOW(), consumed_at = NOW(),
         decision_method = 'passkey'
     WHERE id = $1 AND status = 'pending'`,
    [request.id]
  );
  await recordMobileSecurityEvent(client, {
    userId,
    loginRequestId: request.id,
    eventType: 'login_approved',
    metadata: { decisionMethod: 'passkey' }
  });
}

export { loginRequestTtlMs };
