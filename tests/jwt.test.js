import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';

const { createAccessToken, verifyAccessToken } = await import('../src/lib/jwt.js');

test('access token contains user id and role', () => {
  const token = createAccessToken({ id: 'user-id', role: 'admin' });
  const payload = verifyAccessToken(token);

  assert.equal(payload.sub, 'user-id');
  assert.equal(payload.role, 'admin');
  assert.equal(payload.iss, 'mt-banner-builder');
});
