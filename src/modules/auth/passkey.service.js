import { randomUUID } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from '@simplewebauthn/server';
import { env } from '../../config/env.js';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { verifyUserTwoFactor } from './two-factor.service.js';
import { completeMobileLoginWithPasskey } from '../mobile/mobile-login.service.js';

const rpName = 'MT Panel';
const challengeTtlMs = 5 * 60 * 1000;

function requestOrigin(req) {
  if (env.APP_ORIGIN) return new URL(env.APP_ORIGIN).origin;

  if (env.isProduction) {
    throw new AppError(
      503,
      'PASSKEY_ORIGIN_UNAVAILABLE',
      'Для входу через Passkey адміністратор має налаштувати стабільний APP_ORIGIN.'
    );
  }

  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  if (!host) throw new AppError(500, 'PASSKEY_ORIGIN_UNAVAILABLE', 'Не вдалося визначити адресу порталу для Passkey.');
  return new URL(`${forwardedProto}://${host}`).origin;
}

function webAuthnContext(req) {
  const origin = requestOrigin(req);
  const url = new URL(origin);
  if (env.isProduction && url.protocol !== 'https:') {
    throw new AppError(503, 'PASSKEY_HTTPS_REQUIRED', 'Passkeys працюють лише через захищене HTTPS-з’єднання.');
  }
  return { origin, rpID: url.hostname };
}

function normalizeTransports(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string');
}

function serializePasskey(row) {
  return {
    id: row.id,
    name: row.name,
    deviceType: row.device_type,
    backedUp: row.backed_up === true,
    transports: normalizeTransports(row.transports),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at || null
  };
}

async function pruneChallenges() {
  await query(
    `DELETE FROM user_passkey_challenges
     WHERE expires_at < NOW() - INTERVAL '1 day' OR used_at < NOW() - INTERVAL '1 day'`
  );
}

async function createChallenge(userId, purpose, challenge, context, mobileLoginRequestId = null) {
  await pruneChallenges();
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + challengeTtlMs);
  await query(
    `INSERT INTO user_passkey_challenges
       (id, user_id, purpose, challenge, expected_origin, rp_id, expires_at, mobile_login_request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, userId, purpose, challenge, context.origin, context.rpID, expiresAt, mobileLoginRequestId]
  );
  return { id, expiresAt: expiresAt.toISOString() };
}

async function loadChallenge(id, purpose, userId = null) {
  const result = await query(
    `SELECT id, user_id, challenge, expected_origin, rp_id, expires_at, used_at,
            mobile_login_request_id
     FROM user_passkey_challenges
     WHERE id = $1 AND purpose = $2 AND ($3::UUID IS NULL OR user_id = $3)`,
    [id, purpose, userId]
  );
  const challenge = result.rows[0];
  if (!challenge || challenge.used_at || new Date(challenge.expires_at).getTime() <= Date.now()) {
    throw new AppError(401, 'PASSKEY_CHALLENGE_EXPIRED', 'Запит Passkey недійсний або вже завершився. Спробуйте ще раз.');
  }
  return challenge;
}

async function userPasskeyRows(userId) {
  const result = await query(
    `SELECT id, credential_id, public_key, counter, device_type, backed_up, transports,
            name, created_at, last_used_at
     FROM user_passkeys
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function countUserPasskeys(userId) {
  const result = await query('SELECT COUNT(*)::INTEGER AS count FROM user_passkeys WHERE user_id = $1', [userId]);
  return Number(result.rows[0]?.count || 0);
}

export async function listUserPasskeys(userId) {
  return (await userPasskeyRows(userId)).map(serializePasskey);
}

export async function startPasskeyRegistration(user, req, code, name) {
  if (user.twoFactorEnabled !== true) {
    throw new AppError(403, 'TWO_FACTOR_REQUIRED', 'Спочатку увімкніть двофакторну автентифікацію.');
  }
  await verifyUserTwoFactor(user.id, code);

  const context = webAuthnContext(req);
  const passkeys = await userPasskeyRows(user.id);
  const options = await generateRegistrationOptions({
    rpName,
    rpID: context.rpID,
    userID: Buffer.from(user.id, 'utf8'),
    userName: user.email,
    userDisplayName: user.name || user.email,
    timeout: 120_000,
    attestationType: 'none',
    excludeCredentials: passkeys.map((passkey) => ({
      id: passkey.credential_id,
      transports: normalizeTransports(passkey.transports)
    })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required'
    },
    preferredAuthenticatorType: 'remoteDevice'
  });
  const challenge = await createChallenge(user.id, 'registration', options.challenge, context);
  return { challengeId: challenge.id, expiresAt: challenge.expiresAt, name, options };
}

export async function finishPasskeyRegistration(userId, challengeId, name, response) {
  const challenge = await loadChallenge(challengeId, 'registration', userId);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.expected_origin,
      expectedRPID: challenge.rp_id,
      requireUserVerification: true
    });
  } catch (_error) {
    throw new AppError(422, 'PASSKEY_REGISTRATION_FAILED', 'Не вдалося перевірити Passkey. Повторіть підключення.');
  }
  if (!verification.verified || !verification.registrationInfo) {
    throw new AppError(422, 'PASSKEY_REGISTRATION_FAILED', 'Passkey не підтверджено.');
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const consumed = await client.query(
      `UPDATE user_passkey_challenges SET used_at = NOW()
       WHERE id = $1 AND used_at IS NULL AND expires_at > NOW()
       RETURNING id`,
      [challengeId]
    );
    if (!consumed.rowCount) {
      throw new AppError(401, 'PASSKEY_CHALLENGE_EXPIRED', 'Запит Passkey вже завершився.');
    }
    const inserted = await client.query(
      `INSERT INTO user_passkeys
         (user_id, credential_id, public_key, counter, device_type, backed_up, transports, name)
       VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB, $8)
       RETURNING id, credential_id, public_key, counter, device_type, backed_up,
                 transports, name, created_at, last_used_at`,
      [
        userId,
        credential.id,
        Buffer.from(credential.publicKey).toString('base64url'),
        credential.counter,
        credentialDeviceType,
        credentialBackedUp,
        JSON.stringify(normalizeTransports(credential.transports)),
        name
      ]
    );
    await client.query('COMMIT');
    return serializePasskey(inserted.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error?.code === '23505') {
      throw new AppError(409, 'PASSKEY_ALREADY_EXISTS', 'Цей Passkey уже підключено.');
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function removeUserPasskey(userId, passkeyId, code) {
  await verifyUserTwoFactor(userId, code);
  const result = await query(
    'DELETE FROM user_passkeys WHERE id = $1 AND user_id = $2 RETURNING id',
    [passkeyId, userId]
  );
  if (!result.rowCount) throw new AppError(404, 'PASSKEY_NOT_FOUND', 'Passkey не знайдено.');
}

export async function startPasskeyLogin(user, req, mobileLoginRequestId = null) {
  const context = webAuthnContext(req);
  const passkeys = await userPasskeyRows(user.id);
  if (!passkeys.length) throw new AppError(404, 'PASSKEY_NOT_CONFIGURED', 'Для цього облікового запису Passkey ще не підключено.');

  const options = await generateAuthenticationOptions({
    rpID: context.rpID,
    allowCredentials: passkeys.map((passkey) => ({
      id: passkey.credential_id,
      transports: normalizeTransports(passkey.transports)
    })),
    timeout: 120_000,
    userVerification: 'required'
  });
  options.hints = ['hybrid'];
  const challenge = await createChallenge(
    user.id,
    'login',
    options.challenge,
    context,
    mobileLoginRequestId
  );
  return { challengeId: challenge.id, expiresAt: challenge.expiresAt, options };
}

export async function finishPasskeyLogin(challengeId, response) {
  const challenge = await loadChallenge(challengeId, 'login');
  const credentialResult = await query(
    `SELECT passkey.id AS passkey_id, passkey.credential_id, passkey.public_key, passkey.counter,
            passkey.transports, users.*
     FROM user_passkeys AS passkey
     JOIN users ON users.id = passkey.user_id
     WHERE passkey.user_id = $1 AND passkey.credential_id = $2`,
    [challenge.user_id, response.id]
  );
  const credential = credentialResult.rows[0];
  if (!credential) throw new AppError(401, 'PASSKEY_NOT_RECOGNIZED', 'Цей Passkey не належить обліковому запису.');
  if (credential.status !== 'approved' || credential.two_factor_enabled !== true) {
    throw new AppError(403, 'ACCOUNT_NOT_APPROVED', 'Обліковий запис не може використовувати Passkey.');
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.expected_origin,
      expectedRPID: challenge.rp_id,
      credential: {
        id: credential.credential_id,
        publicKey: new Uint8Array(Buffer.from(credential.public_key, 'base64url')),
        counter: Number(credential.counter),
        transports: normalizeTransports(credential.transports)
      },
      requireUserVerification: true
    });
  } catch (_error) {
    throw new AppError(401, 'PASSKEY_LOGIN_FAILED', 'Не вдалося підтвердити вхід через Passkey.');
  }
  if (!verification.verified) throw new AppError(401, 'PASSKEY_LOGIN_FAILED', 'Passkey не підтверджено.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const consumed = await client.query(
      `UPDATE user_passkey_challenges SET used_at = NOW()
       WHERE id = $1 AND used_at IS NULL AND expires_at > NOW()
       RETURNING id`,
      [challengeId]
    );
    if (!consumed.rowCount) {
      throw new AppError(401, 'PASSKEY_CHALLENGE_EXPIRED', 'Запит Passkey вже завершився.');
    }
    await client.query(
      `UPDATE user_passkeys
       SET counter = $1, last_used_at = NOW()
       WHERE id = $2`,
      [verification.authenticationInfo.newCounter, credential.passkey_id]
    );
    await completeMobileLoginWithPasskey(
      client,
      challenge.user_id,
      challenge.mobile_login_request_id
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return credential;
}
