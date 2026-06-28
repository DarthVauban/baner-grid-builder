import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

let Pool = pg.Pool;

if (env.NODE_ENV === 'test' && env.DATABASE_URL.startsWith('pg-mem://')) {
  const { newDb, DataType } = await import('pg-mem');
  const memoryDb = newDb({ autoCreateForeignKeyIndices: true });
  memoryDb.registerExtension('pgcrypto', () => {});
  memoryDb.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: randomUUID
  });
  memoryDb.public.registerFunction({
    name: 'pg_advisory_lock',
    args: [DataType.integer],
    returns: DataType.boolean,
    implementation: () => true
  });
  memoryDb.public.registerFunction({
    name: 'pg_advisory_unlock',
    args: [DataType.integer],
    returns: DataType.boolean,
    implementation: () => true
  });
  memoryDb.public.registerFunction({
    name: 'jsonb_typeof',
    args: [DataType.jsonb],
    returns: DataType.text,
    implementation: (value) => {
      if (value === null) return 'null';
      if (Array.isArray(value)) return 'array';
      return typeof value === 'object' ? 'object' : typeof value;
    }
  });
  Pool = memoryDb.adapters.createPg().Pool;
}

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error', error);
});

export function query(text, params) {
  return pool.query(text, params);
}
