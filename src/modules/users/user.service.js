import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { query } from '../../db/pool.js';

export async function ensureBootstrapAdmin() {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = env;
  const supplied = [ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD].filter(Boolean).length;

  if (supplied === 0) {
    console.warn('Bootstrap admin is not configured. Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD.');
    return;
  }

  if (supplied !== 3) {
    throw new Error('ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD must be configured together.');
  }

  const email = ADMIN_EMAIL.toLowerCase();
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);

  if (existing.rows[0]) {
    await query(
      `UPDATE users
       SET role = 'admin', status = 'approved', approved_at = COALESCE(approved_at, NOW()), updated_at = NOW()
       WHERE id = $1`,
      [existing.rows[0].id]
    );
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await query(
    `INSERT INTO users (name, email, password_hash, role, status, approved_at)
     VALUES ($1, $2, $3, 'admin', 'approved', NOW())`,
    [ADMIN_NAME.trim(), email, passwordHash]
  );
  console.log(`Bootstrap admin created: ${email}`);
}
