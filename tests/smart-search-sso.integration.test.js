import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';

// A disposable PostgreSQL database is required to exercise actual row locks.
// The normal test workflow retains the repository's isolated pg-mem adapter.
const postgres = Boolean(process.env.SMART_SEARCH_SSO_TEST_DATABASE_URL);
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.SMART_SEARCH_SSO_TEST_DATABASE_URL || 'pg-mem://smart-search-sso-tests';
process.env.JWT_SECRET = 'test-only-jwt-secret-at-least-32-characters';
process.env.COOKIE_SECURE = 'false';
process.env.SMART_SEARCH_SSO_CLIENT_ID = 'smart-search-dev';
process.env.SMART_SEARCH_SSO_CLIENT_SECRET = crypto.randomBytes(32).toString('base64url');
process.env.SMART_SEARCH_SSO_REDIRECT_URI = 'https://smart-search.example.test/auth/workspace/callback';

const { default: app } = await import('../src/app.js');
const { pool, query } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { createAccessToken, createTwoFactorLoginToken } = await import('../src/lib/jwt.js');
const { encryptTwoFactorSecret } = await import('../src/modules/auth/two-factor.service.js');
const { cleanupExpiredSsoRecords } = await import('../src/modules/search/smart-search-sso.service.js');

const base = '/api/integrations/smart-search';
const clientId = process.env.SMART_SEARCH_SSO_CLIENT_ID;
const clientSecret = process.env.SMART_SEARCH_SSO_CLIENT_SECRET;
const redirectUri = process.env.SMART_SEARCH_SSO_REDIRECT_URI;
const basic = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
let passwordHash;
let addressCounter = 1;

before(async () => {
  await runMigrations();
  passwordHash = await bcrypt.hash('SsoTestPassword123!', 4);
});

after(async () => {
  await pool.end();
});

function http(method, path) {
  addressCounter += 1;
  return request(app)[method](path).set('X-Forwarded-For', `198.51.${Math.floor(addressCounter / 250)}.${addressCounter % 250 + 1}`);
}

async function userSession({ lifetime = 3600, twoFactor = false } = {}) {
  const user = { id: crypto.randomUUID(), role: 'editor' };
  user.email = `sso-${user.id}@example.test`;
  await query(
    `INSERT INTO users (id, name, email, password_hash, role, status, two_factor_enabled)
     VALUES ($1, 'SSO Test User', $2, $3, 'editor', 'approved', $4)`,
    [user.id, user.email, passwordHash, twoFactor]
  );
  const token = lifetime === 3600 ? createAccessToken(user) : jwt.sign(
    { sub: user.id, role: user.role, purpose: 'workspace_access' }, process.env.JWT_SECRET,
    { issuer: 'mt-banner-builder', audience: 'mt-workspace', jwtid: crypto.randomUUID(), expiresIn: lifetime }
  );
  return { user, token };
}

function transaction(overrides = {}) {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const params = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirectUri,
    scope: 'smart-search:admin', state: crypto.randomBytes(32).toString('base64url'),
    code_challenge_method: 'S256',
    code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
    ...overrides
  });
  return { verifier, params, path: `${base}/authorize?${params}` };
}

async function authorize(session, tx = transaction()) {
  const result = await http('get', tx.path).set('Authorization', `Bearer ${session.token}`).expect(302);
  const callback = new URL(result.headers.location);
  assert.equal(`${callback.origin}${callback.pathname}`, redirectUri);
  assert.equal(callback.searchParams.get('state'), tx.params.get('state'));
  const code = callback.searchParams.get('code');
  assert.match(code || '', /^[A-Za-z0-9_-]{43}$/u);
  assert.match(result.headers['cache-control'], /no-store/u);
  return { code, verifier: tx.verifier, response: result };
}

function backchannel(endpoint, form, authorization = basic) {
  return http('post', `${base}/${endpoint}`)
    .set('Authorization', authorization)
    .type('form')
    .send(form);
}

function exchange({ code, verifier }, overrides = {}, authorization = basic) {
  return backchannel('token', {
    grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier, ...overrides
  }, authorization);
}

async function access(session = null) {
  const parent = session || await userSession();
  const authorization = await authorize(parent);
  const response = await exchange(authorization).expect(200);
  assert.deepEqual(Object.keys(response.body).sort(), ['access_token', 'expires_in', 'token_type']);
  assert.match(response.body.access_token, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(response.body.token_type, 'Bearer');
  assert.equal(Number.isInteger(response.body.expires_in), true);
  assert.ok(response.body.expires_in >= 1 && response.body.expires_in <= 28800);
  return { parent, authorization, token: response.body.access_token, response };
}

function introspect(token, authorization = basic) {
  return backchannel('introspect', { token, token_type_hint: 'access_token' }, authorization);
}

function introspectFromFreshProcess(token) {
  // Send bearer material through stdin rather than argv, env or diagnostic logs.
  const script = `
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    const { clientId, token } = JSON.parse(input);
    const { introspectAccessToken } = await import('./src/modules/search/smart-search-sso.service.js');
    const { pool } = await import('./src/db/pool.js');
    try {
      process.stdout.write(JSON.stringify(await introspectAccessToken({ clientId, token })));
    } catch {
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  `;
  return new Promise((resolve, reject) => {
    const childEnv = { ...process.env };
    delete childEnv.SMART_SEARCH_SSO_CLIENT_SECRET;
    const child = spawn(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: process.cwd(), env: childEnv, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, timeout: 10000
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString('utf8');
      if (Buffer.byteLength(output) > 8192) child.kill();
    });
    child.stdin.on('error', () => {});
    child.on('error', () => reject(new Error('Fresh-process SSO check could not start')));
    child.on('close', (status) => {
      if (status !== 0 || Buffer.byteLength(output) > 8192) return reject(new Error('Fresh-process SSO check failed'));
      try { resolve(JSON.parse(output)); } catch { reject(new Error('Fresh-process SSO check returned invalid JSON')); }
    });
    child.stdin.end(JSON.stringify({ clientId, token }));
  });
}

async function inactive(token) {
  const response = await introspect(token).expect(200);
  assert.deepEqual(response.body, { active: false });
}

test('Search S256/Basic/form contract accepts an approved non-admin and returns minimal unwrapped JSON', async () => {
  const result = await access();
  const introspection = await introspect(result.token).expect(200);
  assert.deepEqual(Object.keys(introspection.body).sort(), ['active', 'aud', 'client_id', 'exp', 'scope', 'sub']);
  assert.deepEqual({ ...introspection.body, exp: 0 }, {
    active: true, client_id: clientId, sub: result.parent.user.id,
    aud: 'smart-search-admin', scope: 'smart-search:admin', exp: 0
  });
  assert.equal(Number.isInteger(introspection.body.exp), true);
  assert.ok(introspection.body.exp > Math.floor(Date.now() / 1000));
  assert.ok(introspection.body.exp <= jwt.decode(result.parent.token).exp);
  for (const response of [result.response, introspection]) {
    assert.match(response.headers['cache-control'], /no-store/u);
    assert.equal(Buffer.byteLength(JSON.stringify(response.body)) < 8192, true);
    assert.equal(response.headers['access-control-allow-credentials'], undefined);
  }
  assert.notEqual(result.token, result.parent.token);
});

test('anonymous authorize resumes exactly the validated transaction after normal login', async () => {
  const session = await userSession();
  const tx = transaction();
  const response = await http('get', tx.path).expect(302);
  const login = new URL(response.headers.location, 'https://workspace.example.test');
  assert.equal(login.pathname, '/login');
  const returnTo = login.searchParams.get('returnTo');
  assert.equal(returnTo?.startsWith(`${base}/authorize?`), true);
  const resumed = new URL(returnTo, 'https://workspace.example.test');
  assert.deepEqual([...resumed.searchParams], [...tx.params]);
  const browser = request.agent(app);
  await browser.post('/api/auth/login').send({ email: session.user.email, password: 'SsoTestPassword123!' }).expect(200);
  const callback = await browser.get(returnTo).expect(302);
  const url = new URL(callback.headers.location);
  assert.equal(url.searchParams.get('state'), tx.params.get('state'));
  assert.match(url.searchParams.get('code') || '', /^[A-Za-z0-9_-]{43}$/u);
});

test('first factor and challenge JWTs never authorize; completed 2FA resumes the same flow', async () => {
  const session = await userSession({ twoFactor: true });
  const secret = 'JBSWY3DPEHPK3PXP';
  const encrypted = encryptTwoFactorSecret(secret);
  await query(
    `UPDATE users SET two_factor_method = 'totp', two_factor_secret_ciphertext = $1,
      two_factor_secret_iv = $2, two_factor_secret_tag = $3 WHERE id = $4`,
    [encrypted.ciphertext, encrypted.iv, encrypted.tag, session.user.id]
  );
  const browser = request.agent(app);
  const challenge = await browser.post('/api/auth/login').send({ email: session.user.email, password: 'SsoTestPassword123!' }).expect(202);
  assert.equal(challenge.body.data.twoFactorRequired, true);
  const tx = transaction();
  const pending = await browser.get(tx.path).expect(302);
  assert.equal(pending.headers.location.startsWith('/login?'), true);
  const challengeTokens = [
    challenge.body.data.challengeToken,
    createTwoFactorLoginToken(session.user),
    jwt.sign({ sub: session.user.id, role: session.user.role, purpose: 'registration' }, process.env.JWT_SECRET,
      { issuer: 'mt-banner-builder', expiresIn: '5m' }),
    jwt.sign({ sub: session.user.id, role: session.user.role }, process.env.JWT_SECRET,
      { issuer: 'mt-banner-builder', audience: 'mt-qr-login', expiresIn: '5m' })
  ];
  for (const token of challengeTokens) {
    const response = await http('get', tx.path).set('Authorization', `Bearer ${token}`).expect(302);
    assert.equal(response.headers.location.startsWith('/login?'), true);
    await http('get', '/api/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  }
  const bytes = Buffer.from('48656c6c6f21deadbeef', 'hex');
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = crypto.createHmac('sha1', bytes).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const code = String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
  await browser.post('/api/auth/login/2fa').send({ challengeToken: challenge.body.data.challengeToken, code }).expect(200);
  const callback = await browser.get(tx.path).expect(302);
  assert.equal(new URL(callback.headers.location).searchParams.get('state'), tx.params.get('state'));
  assert.ok(new URL(callback.headers.location).searchParams.get('code'));
});

test('authorize rejects invalid client, callback, duplicate/structured parameters and altered protocol locally', async () => {
  const cases = [
    { client_id: 'unknown-client' }, { redirect_uri: 'https://attacker.example/callback' },
    { redirect_uri: '//attacker.example/callback' }, { redirect_uri: `${redirectUri}?extra=1` },
    { redirect_uri: 'https://user:password@smart-search.example.test/auth/workspace/callback' },
    { response_type: 'token' }, { scope: 'other' }, { state: 'short' },
    { code_challenge_method: 'plain' }, { code_challenge: 'short' }
  ];
  const paths = cases.map((change) => transaction(change).path);
  const tx = transaction();
  paths.push(`${tx.path}&client_id=${clientId}`, `${tx.path}&state=${tx.params.get('state')}`,
    `${tx.path}&extra=value`, tx.path.replace('&code_challenge_method=S256', ''),
    tx.path.replace('scope=smart-search%3Aadmin', 'scope%5B%5D=smart-search%3Aadmin'));
  for (const path of paths) {
    const response = await http('get', path).expect(400);
    assert.equal(response.headers.location, undefined);
    assert.equal(JSON.stringify(response.body).includes(clientSecret), false);
  }
});

test('back-channel authentication is independent of workspace cookies and always returns API errors', async () => {
  for (const endpoint of ['token', 'introspect', 'revoke']) {
    for (const authorization of ['', `Basic ${Buffer.from(`${clientId}:wrong-secret`).toString('base64')}`,
      `Basic ${Buffer.from(`other-client:${clientSecret}`).toString('base64')}`, 'Bearer unrelated']) {
      const response = await backchannel(endpoint, { token: 'unknown' }, authorization).expect(401);
      assert.equal(response.headers.location, undefined);
      assert.equal(response.type, 'application/json');
      assert.equal(JSON.stringify(response.body).includes(clientSecret), false);
    }
  }
  const json = await http('post', `${base}/token`).set('Authorization', basic).send({ grant_type: 'authorization_code' });
  assert.ok([400, 415].includes(json.status));
  assert.equal(json.headers.location, undefined);
});

test('wrong verifier, redirect, grant, malformed form and replay cannot exchange codes', async () => {
  const session = await userSession();
  const invalidForms = [
    { code_verifier: crypto.randomBytes(32).toString('base64url') },
    { code_verifier: 'short' }, { redirect_uri: `${redirectUri}/other` }, { grant_type: 'refresh_token' }
  ];
  for (const form of invalidForms) {
    const authorization = await authorize(session);
    const response = await exchange(authorization, form).expect(400);
    assert.deepEqual(response.body, { error: 'invalid_grant' });
  }
  const authorization = await authorize(session);
  await exchange(authorization, {}, `Basic ${Buffer.from(`other-client:${clientSecret}`).toString('base64')}`).expect(401);
  await exchange(authorization).expect(200);
  assert.deepEqual((await exchange(authorization).expect(400)).body, { error: 'invalid_grant' });
  const foreignCode = await authorize(session);
  await query('UPDATE smart_search_sso_codes SET client_id = $1 WHERE code_hash = $2', ['other-client', hash(foreignCode.code)]);
  assert.deepEqual((await exchange(foreignCode).expect(400)).body, { error: 'invalid_grant' });
  const duplicate = await backchannel('token', `grant_type=authorization_code&code=a&code=b&redirect_uri=${encodeURIComponent(redirectUri)}&code_verifier=${'x'.repeat(43)}`).expect(400);
  assert.deepEqual(duplicate.body, { error: 'invalid_grant' });
});

test('code expiry and parent expiry prevent exchange and token lifetime never exceeds its parent', async () => {
  const session = await userSession();
  const authorization = await authorize(session);
  await query('UPDATE smart_search_sso_codes SET created_at = $1, expires_at = $2 WHERE code_hash = $3',
    [new Date(Date.now() - 120000), new Date(Date.now() - 61000), hash(authorization.code)]);
  assert.deepEqual((await exchange(authorization).expect(400)).body, { error: 'invalid_grant' });
  const short = await userSession({ lifetime: 90 });
  const result = await access(short);
  assert.ok(result.response.body.expires_in <= 90);
  await query('UPDATE smart_search_sso_sessions SET created_at = $1, expires_at = $2 WHERE session_hash = $3',
    [new Date(Date.now() - 120000), new Date(Date.now() - 60000), hash(short.token)]);
  await inactive(result.token);
  const other = await authorize(session);
  await query('UPDATE smart_search_sso_sessions SET created_at = $1, expires_at = $2 WHERE session_hash = $3',
    [new Date(Date.now() - 120000), new Date(Date.now() - 60000), hash(session.token)]);
  assert.deepEqual((await exchange(other).expect(400)).body, { error: 'invalid_grant' });
  const expiredJwt = await userSession({ lifetime: -10 });
  const denied = await http('get', transaction().path).set('Authorization', `Bearer ${expiredJwt.token}`).expect(302);
  assert.equal(denied.headers.location.startsWith('/login?'), true);
});

test('existing complete workspace JWTs remain compatible and acquire logout revocation', async () => {
  const parent = await userSession();
  parent.token = jwt.sign({ sub: parent.user.id, role: parent.user.role }, process.env.JWT_SECRET,
    { issuer: 'mt-banner-builder', expiresIn: '1h' });
  await http('get', '/api/auth/me').set('Authorization', `Bearer ${parent.token}`).expect(200);
  const result = await access(parent);
  assert.equal((await introspect(result.token).expect(200)).body.active, true);
  await http('post', '/api/auth/logout').set('Authorization', `Bearer ${parent.token}`).expect(204);
  await inactive(result.token);
});

test('logout revokes the exact parent, persists a tombstone and cannot be undone by replay', async () => {
  const parent = await userSession();
  const first = await access(parent);
  const pending = await authorize(parent);
  const otherBrowser = { user: parent.user, token: createAccessToken(parent.user) };
  assert.notEqual(otherBrowser.token, parent.token);
  const second = await access(otherBrowser);
  await http('post', '/api/auth/logout').set('Authorization', `Bearer ${parent.token}`).expect(204);
  await inactive(first.token);
  assert.deepEqual((await exchange(pending).expect(400)).body, { error: 'invalid_grant' });
  const replay = await http('get', transaction().path).set('Authorization', `Bearer ${parent.token}`);
  assert.equal(new URL(replay.headers.location, 'https://workspace.example.test').searchParams.get('code'), null);
  const tombstone = await query('SELECT revoked_at FROM smart_search_sso_sessions WHERE session_hash = $1', [hash(parent.token)]);
  assert.ok(tombstone.rows[0]?.revoked_at);
  assert.equal((await introspect(second.token).expect(200)).body.active, true);
  await http('post', '/api/auth/logout').set('Authorization', `Bearer ${parent.token}`).expect(204);
  await http('post', '/api/auth/logout').expect(204);
});

test('logout before any SSO use still prevents replay from creating a live binding', async () => {
  const parent = await userSession();
  await http('post', '/api/auth/logout').set('Cookie', `mt_session=${parent.token}`).expect(204);
  const replay = await http('get', transaction().path).set('Authorization', `Bearer ${parent.token}`);
  assert.equal(new URL(replay.headers.location, 'https://workspace.example.test').searchParams.get('code'), null);
  assert.ok((await query('SELECT revoked_at FROM smart_search_sso_sessions WHERE session_hash = $1', [hash(parent.token)])).rows[0]?.revoked_at);
});

test('deleted accounts remain inactive and their old JWT can log out repeatedly without recreating a parent', async () => {
  const result = await access();
  if (!postgres) {
    // pg-mem cannot order the overlapping user/composite-parent FK cascades.
    // Real PostgreSQL runs the unmodified user deletion and verifies cascades.
    await query('DELETE FROM smart_search_sso_codes WHERE user_id = $1', [result.parent.user.id]);
    await query('DELETE FROM smart_search_sso_tokens WHERE user_id = $1', [result.parent.user.id]);
  }
  await query('DELETE FROM users WHERE id = $1', [result.parent.user.id]);
  await inactive(result.token);
  await http('get', '/api/auth/me').set('Authorization', `Bearer ${result.parent.token}`).expect(401);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await http('post', '/api/auth/logout').set('Cookie', `mt_session=${result.parent.token}`).expect(204);
    const parent = await query('SELECT session_hash FROM smart_search_sso_sessions WHERE session_hash = $1', [hash(result.parent.token)]);
    assert.deepEqual(parent.rows, []);
  }
});

test('blocking, explicit revocation, token expiry, unknown and foreign-client tokens are inactive', async () => {
  const blocked = await access();
  await query("UPDATE users SET status = 'rejected' WHERE id = $1", [blocked.parent.user.id]);
  await inactive(blocked.token);
  const expired = await access();
  await query('UPDATE smart_search_sso_tokens SET created_at = $1, expires_at = $2 WHERE token_hash = $3',
    [new Date(Date.now() - 120000), new Date(Date.now() - 60000), hash(expired.token)]);
  await inactive(expired.token);
  const revoked = await access();
  const preserved = await access(revoked.parent);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await backchannel('revoke', { token: revoked.token, token_type_hint: 'access_token' }).expect(200);
    await inactive(revoked.token);
  }
  assert.equal((await introspect(preserved.token).expect(200)).body.active, true);
  await http('get', '/api/auth/me').set('Authorization', `Bearer ${revoked.parent.token}`).expect(200);
  const foreign = await access();
  await query('UPDATE smart_search_sso_tokens SET client_id = $1 WHERE token_hash = $2', ['other-client', hash(foreign.token)]);
  await inactive(foreign.token);
  await backchannel('revoke', { token: foreign.token, token_type_hint: 'access_token' }).expect(200);
  const row = await query('SELECT revoked_at FROM smart_search_sso_tokens WHERE token_hash = $1', [hash(foreign.token)]);
  assert.equal(row.rows[0].revoked_at, null);
  const unknown = crypto.randomBytes(32).toString('base64url');
  await inactive(unknown);
  await backchannel('revoke', { token: unknown, token_type_hint: 'access_token' }).expect(200);
});

test('durable records hold hashes and internal IDs only and survive a fresh app instance', async () => {
  const result = await access();
  const records = await Promise.all([
    query('SELECT * FROM smart_search_sso_sessions WHERE session_hash = $1', [hash(result.parent.token)]),
    query('SELECT * FROM smart_search_sso_codes WHERE code_hash = $1', [hash(result.authorization.code)]),
    query('SELECT * FROM smart_search_sso_tokens WHERE token_hash = $1', [hash(result.token)]),
    query('SELECT * FROM smart_search_sso_audit_log WHERE actor_user_id = $1', [result.parent.user.id])
  ]);
  for (const rows of records) {
    const serialized = JSON.stringify(rows.rows);
    for (const sensitive of [result.parent.token, result.authorization.code, result.token, clientSecret, result.parent.user.email, passwordHash]) {
      assert.equal(serialized.includes(sensitive), false);
    }
  }
  assert.ok(records.slice(0, 3).every((record) => record.rows.length === 1));
  const { default: restarted } = await import(`../src/app.js?sso-restart=${crypto.randomUUID()}`);
  const response = await request(restarted).post(`${base}/introspect`).set('Authorization', basic).type('form')
    .send({ token: result.token, token_type_hint: 'access_token' }).expect(200);
  assert.equal(response.body.active, true);
});

test('missing or malformed SSO configuration fails closed without breaking workspace sessions', async () => {
  const parent = await userSession();
  const tx = transaction();
  for (const [key, value] of [
    ['SMART_SEARCH_SSO_CLIENT_SECRET', ''], ['SMART_SEARCH_SSO_CLIENT_SECRET', 'too-short'],
    ['SMART_SEARCH_SSO_CLIENT_ID', 'bad:client'], ['SMART_SEARCH_SSO_REDIRECT_URI', 'http://insecure.example/callback'],
    ['SMART_SEARCH_SSO_REDIRECT_URI', `${redirectUri}?extra=1`]
  ]) {
    const saved = process.env[key];
    try {
      process.env[key] = value;
      const authorizeResponse = await http('get', tx.path).set('Authorization', `Bearer ${parent.token}`).expect(503);
      assert.equal(authorizeResponse.headers.location, undefined);
      for (const endpoint of ['token', 'introspect', 'revoke']) {
        const response = await backchannel(endpoint, { token: 'unknown' }).expect(503);
        assert.equal(response.headers.location, undefined);
      }
      await http('get', '/api/auth/me').set('Authorization', `Bearer ${parent.token}`).expect(200);
    } finally {
      process.env[key] = saved;
    }
  }
});

test('database errors deny SSO without leaking credentials or redirecting back-channel callers', async (t) => {
  const result = await access();
  const pending = await authorize(result.parent);
  const unavailable = new Error(`test database unavailable ${result.token} ${clientSecret}`);
  const logger = t.mock.method(console, 'error', () => {});
  t.mock.method(pool, 'query', async () => { throw unavailable; });
  t.mock.method(pool, 'connect', async () => { throw unavailable; });
  const responses = await Promise.all([
    introspect(result.token).expect(503), exchange(pending).expect(503),
    http('get', transaction().path).set('Authorization', `Bearer ${result.parent.token}`).expect(503),
    http('post', '/api/auth/logout').set('Authorization', `Bearer ${result.parent.token}`).expect(503)
  ]);
  for (const response of responses) {
    assert.equal(response.headers.location, undefined);
    assert.equal(response.type, 'application/json');
    for (const sensitive of [clientSecret, result.token, result.parent.token]) assert.equal(JSON.stringify(response.body).includes(sensitive), false);
  }
  const logged = JSON.stringify(logger.mock.calls.map((call) => call.arguments));
  for (const sensitive of [clientSecret, result.token, result.parent.token]) assert.equal(logged.includes(sensitive), false);
  assert.equal(responses[3].headers['set-cookie'], undefined);
  t.mock.restoreAll();
  await http('post', '/api/auth/logout').set('Cookie', `mt_session=${result.parent.token}`).expect(204);
  await http('post', '/api/auth/logout').set('Cookie', `mt_session=${result.parent.token}`).expect(204);
  await inactive(result.token);
});

test('cleanup is bounded and preserves unexpired logout tombstones', async () => {
  const parent = await userSession();
  await http('post', '/api/auth/logout').set('Authorization', `Bearer ${parent.token}`).expect(204);
  for (let index = 0; index < 4; index += 1) {
    const expired = await access();
    await query('UPDATE smart_search_sso_codes SET created_at = $1, expires_at = $2 WHERE code_hash = $3',
      [new Date(Date.now() - 120000), new Date(Date.now() - 61000), hash(expired.authorization.code)]);
    await query('UPDATE smart_search_sso_tokens SET created_at = $1, expires_at = $2 WHERE token_hash = $3',
      [new Date(Date.now() - 120000), new Date(Date.now() - 60000), hash(expired.token)]);
    await query('UPDATE smart_search_sso_sessions SET created_at = $1, expires_at = $2 WHERE session_hash = $3',
      [new Date(Date.now() - 120000), new Date(Date.now() - 60000), hash(expired.parent.token)]);
    await query('INSERT INTO smart_search_sso_audit_log (actor_user_id, action, created_at) VALUES ($1, $2, $3)',
      [parent.user.id, 'authorize', new Date(Date.now() - 91 * 86400000)]);
  }
  const removed = await cleanupExpiredSsoRecords({ limit: 2 });
  for (const count of Object.values(removed)) assert.ok(Number.isInteger(count) && count >= 0 && count <= 2, JSON.stringify(removed));
  assert.equal(removed.codes, 2);
  assert.equal(removed.tokens, 2);
  assert.equal(removed.audit, 2);
  assert.ok((await query('SELECT revoked_at FROM smart_search_sso_sessions WHERE session_hash = $1', [hash(parent.token)])).rows[0]?.revoked_at);
});

test('UI entry is visible to approved ordinary users and exposes only the configured HTTPS Search login', async () => {
  await http('get', `${base}/entry`).expect(401);
  const parent = await userSession();
  const response = await http('get', `${base}/entry`).set('Authorization', `Bearer ${parent.token}`).expect(200);
  assert.deepEqual(response.body, { data: { url: 'https://smart-search.example.test/auth/workspace/login' } });
  assert.equal(JSON.stringify(response.body).includes(clientSecret), false);
});

test('form size, parameter count and credentialed browser CORS are constrained', async () => {
  const oversized = await backchannel('introspect', { token: 'x'.repeat(9000), token_type_hint: 'access_token' });
  assert.ok([400, 413].includes(oversized.status));
  const many = new URLSearchParams({ token: 'unknown', token_type_hint: 'access_token' });
  for (let index = 0; index < 25; index += 1) many.append(`extra${index}`, 'x');
  const response = await backchannel('introspect', many.toString());
  assert.ok([400, 413].includes(response.status));
  const cors = await http('post', `${base}/introspect`).set('Authorization', basic)
    .set('Origin', 'https://workspace.example.test').type('form')
    .send({ token: 'unknown', token_type_hint: 'access_token' });
  assert.equal(cors.headers['access-control-allow-credentials'], undefined);
  assert.equal(cors.headers['access-control-allow-origin'], undefined);
});

test('authorize requests have a bounded rate and return a small non-cacheable API error', async () => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await request(app).get(`${base}/authorize`).set('X-Forwarded-For', '203.0.113.241').expect(400);
  }
  const response = await request(app).get(`${base}/authorize`).set('X-Forwarded-For', '203.0.113.241').expect(429);
  assert.equal(response.type, 'application/json');
  assert.equal(response.headers.location, undefined);
  assert.match(response.headers['cache-control'], /no-store/u);
  assert.ok(Buffer.byteLength(JSON.stringify(response.body)) < 8192);
});

test('PostgreSQL atomic exchange permits exactly one winner', { skip: !postgres && 'requires a disposable PostgreSQL database for row-lock semantics' }, async () => {
  const authorization = await authorize(await userSession());
  const responses = await Promise.all([exchange(authorization), exchange(authorization)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 400]);
  assert.deepEqual(responses.find((response) => response.status === 400).body, { error: 'invalid_grant' });
});

test('PostgreSQL parent/token state and logout tombstone survive actual process restarts', { skip: !postgres && 'requires a disposable PostgreSQL database shared by independent processes' }, async () => {
  const result = await access();
  const active = await introspectFromFreshProcess(result.token);
  assert.deepEqual({ ...active, exp: 0 }, {
    active: true, client_id: clientId, sub: result.parent.user.id,
    aud: 'smart-search-admin', scope: 'smart-search:admin', exp: 0
  });
  await http('post', '/api/auth/logout').set('Authorization', `Bearer ${result.parent.token}`).expect(204);
  assert.deepEqual(await introspectFromFreshProcess(result.token), { active: false });
  const replay = await http('get', transaction().path).set('Authorization', `Bearer ${result.parent.token}`).expect(302);
  assert.equal(new URL(replay.headers.location).searchParams.get('code'), null);
  assert.deepEqual(await introspectFromFreshProcess(result.token), { active: false });
});

test('PostgreSQL concurrent logout with code issuance or exchange leaves no live token', { skip: !postgres && 'requires a disposable PostgreSQL database for row-lock semantics' }, async () => {
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const parent = await userSession();
    const pending = await authorize(parent);
    const [tokenResponse, authorizeResponse] = await Promise.all([
      exchange(pending), http('get', transaction().path).set('Authorization', `Bearer ${parent.token}`),
      http('post', '/api/auth/logout').set('Authorization', `Bearer ${parent.token}`).expect(204)
    ]);
    if (tokenResponse.status === 200) await inactive(tokenResponse.body.access_token);
    else assert.equal(tokenResponse.status, 400);
    const lateCode = new URL(authorizeResponse.headers.location, 'https://workspace.example.test').searchParams.get('code');
    if (lateCode) {
      const row = await query('SELECT revoked_at FROM smart_search_sso_codes WHERE code_hash = $1', [hash(lateCode)]);
      assert.ok(row.rows[0].revoked_at);
    }
    const remaining = await query('SELECT revoked_at FROM smart_search_sso_tokens WHERE parent_session_hash = $1', [hash(parent.token)]);
    assert.ok(remaining.rows.every((row) => row.revoked_at));
  }
});
