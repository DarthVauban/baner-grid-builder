import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

export function createAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, purpose: 'workspace_access' },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN, issuer: 'mt-banner-builder', audience: 'mt-workspace', jwtid: randomUUID(), algorithm: 'HS256' }
  );
}

export function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.JWT_SECRET, { issuer: 'mt-banner-builder', algorithms: ['HS256'] });
  // Keep existing full login cookies valid, but never promote any challenge to a login.
  const current = payload.purpose === 'workspace_access' && payload.aud === 'mt-workspace';
  const legacy = payload.purpose === undefined && payload.aud === undefined;
  if ((!current && !legacy) || typeof payload.sub !== 'string' || !payload.sub.length
    || payload.sub.length > 128 || typeof payload.role !== 'string' || !payload.role.length
    || !Number.isSafeInteger(payload.exp)) {
    throw new Error('Invalid access token purpose');
  }
  return payload;
}

export function createTwoFactorLoginToken(user, { mobileLoginRequestId = null, jwtId } = {}) {
  return jwt.sign(
    { sub: user.id, purpose: 'login_2fa', mobileLoginRequestId },
    env.JWT_SECRET,
    {
      expiresIn: mobileLoginRequestId ? '6m' : '5m',
      issuer: 'mt-banner-builder',
      audience: 'mt-login-2fa',
      ...(jwtId ? { jwtid: jwtId } : {})
    }
  );
}

export function verifyTwoFactorLoginToken(token) {
  const payload = jwt.verify(token, env.JWT_SECRET, {
    issuer: 'mt-banner-builder',
    audience: 'mt-login-2fa'
  });
  if (payload.purpose !== 'login_2fa') throw new Error('Invalid token purpose');
  return payload;
}
