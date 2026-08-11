import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function createAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN, issuer: 'mt-banner-builder' }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, { issuer: 'mt-banner-builder' });
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
