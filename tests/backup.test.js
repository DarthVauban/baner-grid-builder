import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.APP_BUILD_SHA = 'backup-test-build';

const { createBackupArchive, readBackupArchive } = await import('../src/modules/backups/backup-archive.js');
const { buildWorkspaceBackup, calculateNextBackupAt } = await import('../src/modules/backups/backup.service.js');

test('backup archive round-trips manifest, database and binary media', () => {
  const archive = createBackupArchive([
    { name: 'manifest.json', data: Buffer.from('{"format":"test"}') },
    { name: 'database.json', data: Buffer.from('{"tables":[]}') },
    { name: 'media/photo.webp', data: Buffer.from([0, 1, 2, 255]) }
  ], { modifiedAt: new Date('2026-07-22T12:00:00.000Z') });
  const entries = readBackupArchive(archive);
  assert.equal(entries.get('manifest.json').toString('utf8'), '{"format":"test"}');
  assert.deepEqual(entries.get('media/photo.webp'), Buffer.from([0, 1, 2, 255]));
});

test('backup schedule respects local daily and weekly time', () => {
  const daily = calculateNextBackupAt({
    automaticEnabled: true,
    scheduleType: 'daily',
    scheduleTime: '03:30',
    scheduleWeekday: 1,
    timezone: 'Europe/Kyiv'
  }, new Date('2026-07-22T02:00:00.000Z'));
  assert.equal(daily.toISOString(), '2026-07-23T00:30:00.000Z');

  const weekly = calculateNextBackupAt({
    automaticEnabled: true,
    scheduleType: 'weekly',
    scheduleTime: '09:00',
    scheduleWeekday: 1,
    timezone: 'Europe/Kyiv'
  }, new Date('2026-07-22T02:00:00.000Z'));
  assert.equal(weekly.toISOString(), '2026-07-27T06:00:00.000Z');
});

test('workspace backup includes a signed dated manifest and catalog media', async () => {
  const mediaDir = await mkdtemp(path.join(os.tmpdir(), 'mt-backup-test-'));
  try {
    await writeFile(path.join(mediaDir, 'sample.webp'), Buffer.from([82, 73, 70, 70]));
    const db = {
      async query(sql, params) {
        if (sql.includes('information_schema.tables')) return { rows: [{ table_name: 'example_records' }] };
        if (sql.includes('information_schema.columns')) {
          assert.equal(params[0], 'example_records');
          return { rows: [{ column_name: 'id', udt_name: 'uuid' }, { column_name: 'payload', udt_name: 'jsonb' }] };
        }
        if (sql.includes('SELECT * FROM "example_records"')) {
          return { rows: [{ id: '4b688591-2e1e-47b8-b38a-2e4ba9971b23', payload: { ready: true } }] };
        }
        if (sql.includes('FROM schema_migrations')) return { rows: [{ name: '033_telegram_backups.sql' }] };
        throw new Error(`Unexpected query: ${sql}`);
      }
    };
    const createdAt = new Date('2026-07-22T12:34:56.000Z');
    const result = await buildWorkspaceBackup({ now: createdAt, db, mediaDir });
    const entries = readBackupArchive(result.archive);
    const manifest = JSON.parse(entries.get('manifest.json').toString('utf8'));
    const database = JSON.parse(entries.get('database.json').toString('utf8'));
    assert.match(result.fileName, /2026-07-22_12-34-56Z/);
    assert.equal(manifest.format, 'mt-workspace-backup');
    assert.equal(manifest.schemaMigration, '033_telegram_backups.sql');
    assert.match(manifest.signature, /^[a-f0-9]{64}$/);
    assert.deepEqual(database.tables[0].rows[0].payload, { ready: true });
    assert.deepEqual(entries.get('media/sample.webp'), Buffer.from([82, 73, 70, 70]));
  } finally {
    await rm(mediaDir, { recursive: true, force: true });
  }
});
