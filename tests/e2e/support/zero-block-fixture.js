import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { pool } from '../../../src/db/pool.js';
import { createAccessToken } from '../../../src/lib/jwt.js';
import { encryptHoroshopCredentials } from '../../../src/modules/search/horoshop/credential-cipher.js';

export function withZeroBlockFixture(app) {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.ok(process.env.DATABASE_URL.startsWith('pg-mem://'));
  const wrapper = express();
  wrapper.post('/__e2e/zero-block/reset', async (_req, res, next) => {
    try {
      await pool.query('DELETE FROM search_horoshop_connections');
      const store = 'zero-store.e2e.test';
      const connection = randomUUID();
      const generation = randomUUID();
      await pool.query(
        `INSERT INTO search_horoshop_connections (id, generation, store_domain, encrypted_credentials, status)
         VALUES ($1, $2, $3, $4, 'connected')`,
        [connection, generation, store, encryptHoroshopCredentials({ login: 'fixture', password: 'fixture' })]
      );
      const { rows: [publisher] } = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, status, two_factor_enabled, two_factor_confirmed_at)
         VALUES ('Zero Block E2E', $1, 'fixture', 'admin', 'approved', TRUE, $2) RETURNING id, role`,
        ['zero-' + connection + '@e2e.test', new Date('2025-01-01T00:00:00Z')]
      );
      await pool.query(
        `INSERT INTO popup_banner_campaigns (connection_id, connection_generation, name, campaign_type, status, priority,
          content, styles, targeting, behavior)
         VALUES ($1, $2, 'Legacy E2E', 'message', 'active', 70, $3::JSONB, '{}'::JSONB, $4::JSONB, $5::JSONB)`,
        [connection, generation,
          JSON.stringify({ title: 'Чинний попап Хорошопа', body: 'Повідомлення покупцеві', primaryLabel: 'Добре' }),
          JSON.stringify({ mode: 'target_page', targetPageUrl: 'https://' + store + '/mixed/' }),
          JSON.stringify({ trigger: 'delay', delayMs: 1300, frequency: 'always', device: 'all' })]
      );
      res.json({ store, token: createAccessToken(publisher) });
    } catch (error) { next(error); }
  });
  wrapper.use(app);
  return wrapper;
}
