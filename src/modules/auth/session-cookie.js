import { env } from '../../config/env.js';

export function setSessionCookie(res, token) {
  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/'
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(env.COOKIE_NAME, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    path: '/'
  });
}
