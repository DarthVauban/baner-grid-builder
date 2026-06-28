import { pool } from './pool.js';
import { runMigrations } from './migrate.js';

try {
  await runMigrations();
  console.log('Database migrations are up to date.');
} finally {
  await pool.end();
}
