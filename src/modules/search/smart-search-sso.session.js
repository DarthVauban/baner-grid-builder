import { createHash } from 'node:crypto';
import { getSessionToken } from '../../middleware/auth.js';
import { verifyAccessToken } from '../../lib/jwt.js';

// Only verified full login tokens may establish a durable parent binding.
export function getParentSession(req) {
  const token = getSessionToken(req);
  if (!token || typeof token !== 'string') return null;
  try {
    const payload = verifyAccessToken(token);
    const expiresAt = new Date(payload.exp * 1000);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) return null;
    return {
      tokenHash: createHash('sha256').update(token).digest('hex'),
      userId: payload.sub,
      expiresAt
    };
  } catch {
    return null;
  }
}
