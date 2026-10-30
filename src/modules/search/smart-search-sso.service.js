import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { pool, query } from '../../db/pool.js';
import { env } from '../../config/env.js';

const scope = 'smart-search:admin';
const audience = 'smart-search-admin';

function hash(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Keep contention below the Search client's three-second request timeout.
    // pg-mem has no server timeout or row-lock implementation to configure.
    if (!(env.NODE_ENV === 'test' && env.DATABASE_URL.startsWith('pg-mem://'))) {
      await client.query("SET LOCAL statement_timeout = '2000ms'");
      await client.query("SET LOCAL lock_timeout = '1000ms'");
    }
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function audit(client, action, userId, entityId = null) {
  await client.query(
    `INSERT INTO smart_search_sso_audit_log (actor_user_id, action, entity_id)
     VALUES ($1, $2, $3)`,
    [userId, action, entityId]
  );
}

async function approved(client, userId) {
  const result = await client.query('SELECT status FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.status === 'approved';
}

async function lockParent(client, parent) {
  // INSERT's unique-key conflict also waits for an uncommitted concurrent
  // insert. Logout can therefore create a tombstone before first SSO use.
  await client.query(
    `INSERT INTO smart_search_sso_sessions (session_hash, user_id, expires_at)
     SELECT $1::text, id, $3::timestamptz FROM users WHERE id = $2
     ON CONFLICT (session_hash) DO NOTHING`,
    [parent.tokenHash, parent.userId, parent.expiresAt]
  );
  const result = await client.query(
    'SELECT * FROM smart_search_sso_sessions WHERE session_hash = $1 FOR UPDATE',
    [parent.tokenHash]
  );
  return result.rows[0];
}

function liveParent(parent, now, expectedUserId = parent?.user_id) {
  return Boolean(parent && parent.user_id === expectedUserId && !parent.revoked_at
    && new Date(parent.expires_at).getTime() > now);
}

export async function issueAuthorizationCode({ clientId, redirectUri, codeChallenge, parent }) {
  return transaction(async (client) => {
    const binding = await lockParent(client, parent);
    const now = Date.now();
    if (!liveParent(binding, now, parent.userId) || !await approved(client, parent.userId)) return null;

    const code = randomBytes(32).toString('base64url');
    const result = await client.query(
      `INSERT INTO smart_search_sso_codes
         (code_hash, client_id, parent_session_hash, user_id, redirect_uri, code_challenge,
          created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [hash(code), clientId, parent.tokenHash, parent.userId, redirectUri, codeChallenge,
        new Date(now), new Date(Math.min(now + 60_000, new Date(binding.expires_at).getTime()))]
    );
    await audit(client, 'authorize', parent.userId, result.rows[0].id);
    return code;
  });
}

export async function exchangeAuthorizationCode({ clientId, redirectUri, code, codeVerifier }) {
  return transaction(async (client) => {
    const codeHash = hash(code);
    // Discover the binding without taking a code lock: every issuance/logout
    // transaction takes the parent lock BEFORE any child row lock.
    const lookup = await client.query(
      'SELECT parent_session_hash FROM smart_search_sso_codes WHERE code_hash = $1 AND client_id = $2',
      [codeHash, clientId]
    );
    if (!lookup.rows[0]) return null;
    const sessions = await client.query(
      'SELECT * FROM smart_search_sso_sessions WHERE session_hash = $1 FOR UPDATE',
      [lookup.rows[0].parent_session_hash]
    );
    const binding = sessions.rows[0];
    const codes = await client.query(
      'SELECT * FROM smart_search_sso_codes WHERE code_hash = $1 AND client_id = $2 FOR UPDATE',
      [codeHash, clientId]
    );
    const stored = codes.rows[0];
    const now = Date.now();
    if (!stored || stored.redirect_uri !== redirectUri || stored.consumed_at || stored.revoked_at
      || new Date(stored.expires_at).getTime() <= now
      || !liveParent(binding, now, stored.user_id) || !await approved(client, stored.user_id)) return null;

    const challenge = createHash('sha256').update(codeVerifier, 'utf8').digest('base64url');
    const expected = Buffer.from(stored.code_challenge, 'ascii');
    const actual = Buffer.from(challenge, 'ascii');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

    const expiresIn = Math.min(3600, Math.floor((new Date(binding.expires_at).getTime() - now) / 1000));
    if (expiresIn < 1) return null;
    // The predicate is additional protection against accidental future changes
    // to locking. Only this transaction can consume an unconsumed code.
    const consumed = await client.query(
      `UPDATE smart_search_sso_codes SET consumed_at = $2
       WHERE id = $1 AND consumed_at IS NULL AND revoked_at IS NULL RETURNING id`,
      [stored.id, new Date(now)]
    );
    if (!consumed.rows[0]) return null;

    const token = randomBytes(32).toString('base64url');
    const tokens = await client.query(
      `INSERT INTO smart_search_sso_tokens
         (token_hash, client_id, parent_session_hash, user_id, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [hash(token), clientId, stored.parent_session_hash, stored.user_id,
        new Date(now), new Date(now + expiresIn * 1000)]
    );
    await audit(client, 'exchange', stored.user_id, tokens.rows[0].id);
    return { access_token: token, token_type: 'Bearer', expires_in: expiresIn };
  });
}

export async function introspectAccessToken({ clientId, token }) {
  // A fresh database snapshot on EVERY request; no positive cache. Joining the
  // user and parent makes blocking and committed logout effective immediately.
  const result = await query(
    `SELECT t.user_id, t.expires_at, t.scope, t.audience
     FROM smart_search_sso_tokens t
     JOIN smart_search_sso_sessions s ON s.session_hash = t.parent_session_hash AND s.user_id = t.user_id
     JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.client_id = $2 AND t.revoked_at IS NULL
       AND t.expires_at > $3 AND s.revoked_at IS NULL AND s.expires_at > $3
       AND u.status = 'approved' AND t.scope = $4 AND t.audience = $5`,
    [hash(token), clientId, new Date(), scope, audience]
  );
  const row = result.rows[0];
  if (!row) return { active: false };
  const exp = Math.floor(new Date(row.expires_at).getTime() / 1000);
  if (exp <= Math.floor(Date.now() / 1000)) return { active: false };
  return { active: true, client_id: clientId, sub: String(row.user_id), aud: audience, scope, exp };
}

export async function revokeAccessToken({ clientId, token }) {
  return transaction(async (client) => {
    const result = await client.query(
      `UPDATE smart_search_sso_tokens SET revoked_at = $3
       WHERE token_hash = $1 AND client_id = $2 AND revoked_at IS NULL RETURNING id, user_id`,
      [hash(token), clientId, new Date()]
    );
    const row = result.rows[0];
    if (row) await audit(client, 'revoke', row.user_id, row.id);
  });
}

export async function revokeParentSession(parent) {
  return transaction(async (client) => {
    const binding = await lockParent(client, parent);
    if (!binding || binding.user_id !== parent.userId) return;
    const now = new Date();
    await client.query(
      'UPDATE smart_search_sso_sessions SET revoked_at = COALESCE(revoked_at, $2) WHERE session_hash = $1',
      [parent.tokenHash, now]
    );
    await client.query(
      `UPDATE smart_search_sso_codes SET revoked_at = COALESCE(revoked_at, $2)
       WHERE parent_session_hash = $1`,
      [parent.tokenHash, now]
    );
    await client.query(
      `UPDATE smart_search_sso_tokens SET revoked_at = COALESCE(revoked_at, $2)
       WHERE parent_session_hash = $1`,
      [parent.tokenHash, now]
    );
    if (!binding.revoked_at) await audit(client, 'parent_logout', parent.userId);
  });
}

export async function cleanupExpiredSsoRecords({ limit = 100 } = {}) {
  const boundedLimit = Math.max(1, Math.min(1000, Number.isInteger(limit) ? limit : 100));
  return transaction(async (client) => {
    const now = new Date();
    const counts = {};
    // Each query deletes at most boundedLimit records, including audit entries.
    // Parents are removed only when child-free, so FK cascades cannot exceed it.
    for (const [key, table, predicate, cutoff] of [
      ['codes', 'smart_search_sso_codes', 'expires_at <= $1', now],
      ['tokens', 'smart_search_sso_tokens', 'expires_at <= $1', now],
      ['audit', 'smart_search_sso_audit_log', 'created_at <= $1', new Date(now.getTime() - 90 * 86400_000)]
    ]) {
      const candidates = await client.query(
        `SELECT id FROM ${table} WHERE ${predicate} ORDER BY ${key === 'audit' ? 'created_at' : 'expires_at'} LIMIT $2`,
        [cutoff, boundedLimit]
      );
      counts[key] = await deleteSelected(client, table, 'id', candidates.rows.map((row) => row.id));
    }
    const sessions = await client.query(
      `SELECT s.session_hash FROM smart_search_sso_sessions s
         LEFT JOIN smart_search_sso_codes c ON c.parent_session_hash = s.session_hash
         LEFT JOIN smart_search_sso_tokens t ON t.parent_session_hash = s.session_hash
         WHERE s.expires_at <= $1
           AND c.id IS NULL AND t.id IS NULL
         ORDER BY s.expires_at LIMIT $2`,
      [now, boundedLimit]
    );
    counts.sessions = await deleteSelected(client, 'smart_search_sso_sessions', 'session_hash',
      sessions.rows.map((row) => row.session_hash));
    return counts;
  });
}

async function deleteSelected(client, table, column, ids) {
  if (!ids.length) return 0;
  // Materialize the bounded IDs before deleting. This also makes the work
  // bound explicit, independent of a database planner's subquery strategy.
  const placeholders = ids.map((_id, index) => `$${index + 1}`).join(', ');
  const result = await client.query(`DELETE FROM ${table} WHERE ${column} IN (${placeholders})`, ids);
  return result.rowCount;
}
