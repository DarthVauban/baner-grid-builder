import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';

const { createAccessToken, verifyAccessToken, createTwoFactorLoginToken } = await import('../src/lib/jwt.js');

test('access token contains user id and role', () => {
  const token = createAccessToken({ id: 'user-id', role: 'admin' });
  const payload = verifyAccessToken(token);

  assert.equal(payload.sub, 'user-id');
  assert.equal(payload.role, 'admin');
  assert.equal(payload.iss, 'mt-banner-builder');
  assert.equal(payload.purpose, 'workspace_access');
  assert.equal(payload.aud, 'mt-workspace');
});

test('each login creates a distinct parent session even within the same second', () => {
  const user = { id: 'user-id', role: 'admin' };
  assert.notEqual(createAccessToken(user), createAccessToken(user));
});

test('access verification rejects second-factor and other challenge purposes/audiences', () => {
  assert.throws(() => verifyAccessToken(createTwoFactorLoginToken({ id: 'user-id' })));
  for (const claims of [
    { purpose: 'registration' }, { purpose: 'qr_login', aud: 'mt-qr-login' },
    { purpose: 'workspace_access', aud: 'wrong-audience' }, { aud: 'mt-login-2fa' }
  ]) {
    const token = jwt.sign({ sub: 'user-id', role: 'admin', ...claims }, process.env.JWT_SECRET,
      { issuer: 'mt-banner-builder', expiresIn: '5m' });
    assert.throws(() => verifyAccessToken(token));
  }
});

test('existing full login tokens continue working but must have trusted expiry and subject', () => {
  const options = { issuer: 'mt-banner-builder', expiresIn: '1h' };
  const legacy = jwt.sign({ sub: 'user-id', role: 'editor' }, process.env.JWT_SECRET, options);
  assert.equal(verifyAccessToken(legacy).sub, 'user-id');
  const withoutExpiry = jwt.sign({ sub: 'user-id', role: 'editor' }, process.env.JWT_SECRET, { issuer: options.issuer });
  assert.throws(() => verifyAccessToken(withoutExpiry));
});
