import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const productionBase = 'd5f33f76a7abdcaabb045023b9b0ceb3247850c8';
const databaseUrl = process.env.SMART_SEARCH_SSO_TEST_DATABASE_URL;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const migrationName = '103_smart_search_sso.sql';
const ssoTables = [
  'smart_search_sso_audit_log', 'smart_search_sso_codes',
  'smart_search_sso_sessions', 'smart_search_sso_tokens'
];

function disposableServerUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('A valid local PostgreSQL test URL is required');
  }
  assert.ok(['postgres:', 'postgresql:'].includes(parsed.protocol), 'A PostgreSQL test URL is required');
  assert.ok(['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname),
    'The upgrade probe accepts only a local disposable PostgreSQL service');
  if (parsed.search || parsed.hash) {
    throw new Error('The local PostgreSQL test URL must omit query parameters and fragments');
  }
  if (parsed.port && (Number(parsed.port) < 1 || Number(parsed.port) > 65535)) {
    throw new Error('The local PostgreSQL test URL requires a valid TCP port');
  }
  return parsed;
}

function createDisposableAdmin(value, Client = pg.Client) {
  const serverUrl = disposableServerUrl(value);
  return { serverUrl, admin: new Client({ connectionString: serverUrl.href }) };
}

async function git(...args) {
  const result = await execFileAsync('git', args, { cwd: repositoryRoot, maxBuffer: 8 * 1024 * 1024 });
  return result.stdout;
}

async function runLegacyRunner(directory, fixtureUrl) {
  const runnerUrl = pathToFileURL(path.join(directory, 'src/db/migrate.js')).href;
  const poolUrl = pathToFileURL(path.join(directory, 'src/db/pool.js')).href;
  const script = `
    const { runMigrations } = await import(${JSON.stringify(runnerUrl)});
    const { pool } = await import(${JSON.stringify(poolUrl)});
    try {
      await runMigrations();
    } catch {
      console.error('Legacy migration runner failed');
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  `;
  await execFileAsync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: directory, timeout: 30_000, maxBuffer: 1024 * 1024,
    env: { ...process.env, NODE_ENV: 'test', SMART_SEARCH_SSO_UPGRADE_FIXTURE_URL: fixtureUrl }
  });
}

async function tableNames(client) {
  const result = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
  );
  return result.rows.map((row) => row.table_name);
}

test('PostgreSQL query overrides are rejected before any test client is constructed', () => {
  let constructed = 0;
  class ForbiddenClient {
    constructor() {
      constructed += 1;
      throw new Error('A PostgreSQL client must not be constructed');
    }
  }
  for (const suffix of ['?host=remote.example.test', '?hostaddr=192.0.2.1', '?port=6543', '#host=remote.example.test']) {
    assert.throws(() => createDisposableAdmin(`postgresql://127.0.0.1/test${suffix}`, ForbiddenClient),
      /must omit query parameters and fragments/u);
  }
  assert.throws(() => createDisposableAdmin('postgresql://127.0.0.1:0/test', ForbiddenClient), /valid TCP port/u);
  assert.equal(constructed, 0);
});

test('PostgreSQL upgrades the exact production baseline and the legacy migration runner preserves the SSO schema on rollback', {
  skip: !databaseUrl && 'requires an explicit disposable local SMART_SEARCH_SSO_TEST_DATABASE_URL',
  timeout: 120_000
}, async () => {
  const { serverUrl, admin } = createDisposableAdmin(databaseUrl);
  const fixtureName = `workspace_sso_upgrade_${randomUUID().replaceAll('-', '')}`;
  assert.match(fixtureName, /^workspace_sso_upgrade_[a-f0-9]{32}$/u);
  assert.notEqual(serverUrl.pathname.slice(1), fixtureName, 'Never clean up the caller database');
  const fixtureUrl = new URL(serverUrl);
  fixtureUrl.pathname = `/${fixtureName}`;
  let fixture;
  let directory;
  let created = false;
  let phase = 'baseline_source';

  try {
    assert.equal((await git('rev-parse', `${productionBase}^{commit}`)).trim(), productionBase);
    const baselinePaths = (await git('ls-tree', '-r', '--name-only', productionBase, '--', 'src/migrations'))
      .trim().split('\n').filter((name) => name.endsWith('.sql')).sort();
    assert.equal(baselinePaths.length, 101);
    assert.ok(baselinePaths.every((name) => /^src\/migrations\/\d{3}_[a-z0-9_]+\.sql$/u.test(name)));
    assert.ok(baselinePaths.every((name) => Number(path.basename(name).slice(0, 3)) <= 101));
    const baselineNames = baselinePaths.map((name) => path.basename(name));
    const oldRunner = await git('show', `${productionBase}:src/db/migrate.js`);
    const currentRunner = await readFile(path.join(repositoryRoot, 'src/db/migrate.js'), 'utf8');
    assert.equal(currentRunner.replaceAll('\r\n', '\n'), oldRunner.replaceAll('\r\n', '\n'));

    directory = await mkdtemp(path.join(os.tmpdir(), 'workspace-sso-upgrade-'));
    await mkdir(path.join(directory, 'src/db'), { recursive: true });
    await mkdir(path.join(directory, 'src/migrations'));
    await writeFile(path.join(directory, 'package.json'), '{"type":"module"}\n');
    await writeFile(path.join(directory, 'src/db/migrate.js'), oldRunner);
    const pgUrl = pathToFileURL(require.resolve('pg')).href;
    await writeFile(path.join(directory, 'src/db/pool.js'),
      `import pg from ${JSON.stringify(pgUrl)};\nexport const pool = new pg.Pool({ connectionString: process.env.SMART_SEARCH_SSO_UPGRADE_FIXTURE_URL });\n`);
    for (const name of baselinePaths) {
      await writeFile(path.join(directory, name), await git('show', `${productionBase}:${name}`));
    }

    phase = 'create_owned_fixture';
    await admin.connect();
    await admin.query(`CREATE DATABASE "${fixtureName}"`);
    created = true;
    fixture = new pg.Client({ connectionString: fixtureUrl.href });
    await fixture.connect();

    phase = 'baseline_startup';
    await runLegacyRunner(directory, fixtureUrl.href);
    const baselineLedger = await fixture.query('SELECT name FROM schema_migrations ORDER BY name');
    assert.deepEqual(baselineLedger.rows.map((row) => row.name), baselineNames);
    const baselineTables = await tableNames(fixture);
    assert.ok(ssoTables.every((name) => !baselineTables.includes(name)));

    phase = 'upgrade_only_103';
    const fixtureMigration = path.join(directory, 'src/migrations', migrationName);
    await writeFile(fixtureMigration, await readFile(path.join(repositoryRoot, 'src/migrations', migrationName)));
    await runLegacyRunner(directory, fixtureUrl.href);
    const upgradedNames = [...baselineNames, migrationName].sort();
    const upgradedLedger = await fixture.query('SELECT name FROM schema_migrations ORDER BY name');
    assert.deepEqual(upgradedLedger.rows.map((row) => row.name), upgradedNames);
    const upgradedTables = await tableNames(fixture);
    assert.deepEqual(upgradedTables, [...baselineTables, ...ssoTables].sort());

    phase = 'preserve_logout_state';
    const userId = randomUUID();
    await fixture.query(
      `INSERT INTO users (id, name, email, password_hash, role, status)
       VALUES ($1, 'Upgrade fixture', $2, 'not-a-real-password-hash', 'editor', 'approved')`,
      [userId, `upgrade-${userId}@example.test`]
    );
    await fixture.query(
      `INSERT INTO smart_search_sso_sessions (session_hash, user_id, expires_at, revoked_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 hour', NOW())`, ['0'.repeat(64), userId]
    );
    await fixture.query(
      "INSERT INTO smart_search_sso_audit_log (actor_user_id, action) VALUES ($1, 'parent_logout')", [userId]
    );

    phase = 'old_startup_after_rollback';
    // Remove only the test fixture's file. The applied source migration is untouched.
    await unlink(fixtureMigration);
    await runLegacyRunner(directory, fixtureUrl.href);
    const rollbackLedger = await fixture.query('SELECT name FROM schema_migrations ORDER BY name');
    assert.deepEqual(rollbackLedger.rows, upgradedLedger.rows);
    assert.deepEqual(await tableNames(fixture), upgradedTables);
    const state = await fixture.query(
      `SELECT (SELECT count(*)::integer FROM smart_search_sso_sessions WHERE revoked_at IS NOT NULL) AS tombstones,
              (SELECT count(*)::integer FROM smart_search_sso_audit_log WHERE action = 'parent_logout') AS audit_entries`
    );
    assert.deepEqual(state.rows, [{ tombstones: 1, audit_entries: 1 }]);
  } catch {
    // PostgreSQL and child-process errors can contain connection parameters.
    throw new Error(`SSO production upgrade probe failed during ${phase}`);
  } finally {
    try {
      if (fixture) await fixture.end();
      if (created) {
        assert.match(fixtureName, /^workspace_sso_upgrade_[a-f0-9]{32}$/u);
        await admin.query(`DROP DATABASE "${fixtureName}"`);
      }
    } finally {
      await admin.end();
      if (directory) {
        const entry = await lstat(directory);
        assert.ok(entry.isDirectory() && !entry.isSymbolicLink());
        const target = await realpath(directory);
        const parent = await realpath(os.tmpdir());
        assert.equal(target, path.join(parent, path.basename(directory)));
        assert.equal(path.dirname(target), parent);
        assert.match(path.basename(target), /^workspace-sso-upgrade-[A-Za-z0-9_-]+$/u);
        await rm(target, { recursive: true });
      }
    }
  }
});
