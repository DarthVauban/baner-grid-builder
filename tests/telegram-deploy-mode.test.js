import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../telegram-bot-api-deploy-mode.sh', import.meta.url));
const shell = process.platform === 'win32'
  ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe')
  : 'sh';

function resolveMode({ mode, hasSettings = true, hasCredentials = true, bootstrap, configFails = false, databaseFails = false } = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'mt-telegram-deploy-test-'));
  const callsFile = path.join(directory, 'calls');
  try {
    if (bootstrap !== undefined) writeFileSync(path.join(directory, '.telegram-bot-api.env'), bootstrap);
    writeFileSync(callsFile, '');
    const result = spawnSync(shell, ['-c', `
      docker() {
        printf '%s\\n' "$*" >> "$TEST_CALLS_FILE"
        case "$*" in
          'compose config --environment')
            if [ "$TEST_CONFIG_FAILS" = true ]; then return 1; fi
            printf 'UNRELATED_SECRET=must-not-appear-in-output\\n'
            if [ -n "$TEST_MODE" ]; then printf 'TELEGRAM_LOCAL_MODE=%s\\n' "$TEST_MODE"; fi
            ;;
          'compose exec -T db sh -c '*)
            if [ "$TEST_DATABASE_FAILS" = true ]; then return 1; fi
            sql="$(cat)"
            printf '%s\\n' "$sql" >> "$TEST_CALLS_FILE"
            case "$sql" in
              *to_regclass*) printf '%s\\n' "$TEST_HAS_SETTINGS" ;;
              *'SELECT EXISTS'*) printf '%s\\n' "$TEST_HAS_CREDENTIALS" ;;
              *) return 2 ;;
            esac
            ;;
          *) return 2 ;;
        esac
      }
      . "$TEST_SCRIPT"
    `], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        TEST_SCRIPT: script.replaceAll('\\', '/'),
        TEST_CALLS_FILE: callsFile.replaceAll('\\', '/'),
        TEST_MODE: mode ?? '',
        TEST_HAS_SETTINGS: hasSettings ? 't' : 'f',
        TEST_HAS_CREDENTIALS: hasCredentials ? 't' : 'f',
        TEST_CONFIG_FAILS: String(configFails),
        TEST_DATABASE_FAILS: String(databaseFails)
      }
    });
    assert.ifError(result.error);
    return { ...result, calls: readFileSync(callsFile, 'utf8') };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('deployment recovers local Telegram delivery from saved credentials when the flag is lost', () => {
  const result = resolveMode();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'true\n');
  assert.match(result.calls, /WHERE key = 'telegram_local_api'/);
  assert.match(result.calls, /secret_ciphertext IS NOT NULL/);
  assert.doesNotMatch(result.stdout + result.stderr, /UNRELATED_SECRET|must-not-appear-in-output/);
});

test('an explicitly disabled local API stays on the cloud even with saved credentials', () => {
  const result = resolveMode({ mode: 'false' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'false\n');
  assert.doesNotMatch(result.calls, /compose exec/);
});

test('an explicitly enabled local API can start before credentials have been saved', () => {
  const result = resolveMode({ mode: 'true', hasCredentials: false });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'true\n');
  assert.doesNotMatch(result.calls, /compose exec/);
});

test('an installation without saved credentials keeps cloud Telegram delivery', () => {
  const result = resolveMode({ hasCredentials: false });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'false\n');
});

test('a fresh database does not require the integration table before application migrations', () => {
  const result = resolveMode({ hasSettings: false });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'false\n');
  assert.doesNotMatch(result.calls, /FROM public.integration_settings/);
});

test('valid bootstrap credentials recover local mode without printing their values', () => {
  const apiHash = '0123456789abcdef0123456789abcdef';
  const result = resolveMode({ bootstrap: `TELEGRAM_API_ID=12345678\nTELEGRAM_API_HASH=${apiHash}\n` });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'true\n');
  assert.doesNotMatch(result.calls, /compose exec/);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(apiHash));
});

test('a bootstrap placeholder does not activate an unconfigured local API', () => {
  const result = resolveMode({ hasCredentials: false, bootstrap: 'TELEGRAM_API_ID=\nTELEGRAM_API_HASH=\n' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'false\n');
});

test('deployment fails instead of silently selecting cloud delivery on configuration or database errors', () => {
  for (const options of [{ configFails: true }, { databaseFails: true }, { mode: 'invalid' }]) {
    const result = resolveMode(options);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
  }
});
