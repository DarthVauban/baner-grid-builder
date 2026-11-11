import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const installScript = readFileSync(new URL('../.github/scripts/install-playwright.sh', import.meta.url), 'utf8');
const shell = process.platform === 'win32'
  ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe') : 'bash';

function install({ dependencyFailures = 0, downloadFailures = 0, configFails = false } = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'mt-playwright-install-'));
  try {
    const result = spawnSync(shell, ['-c', `
      set -euo pipefail
      dependency_attempt=0
      download_attempt=0
      sudo() {
        [ "$*" = 'tee /etc/apt/apt.conf.d/80-mt-playwright-ci' ] || return 2
        [ "$TEST_CONFIG_FAILS" = false ] || return 1
        cat > "$TEST_APT_CONFIG"
      }
      sleep() { printf 'sleep %s\\n' "$*" >> "$TEST_CALLS"; }
      npx() {
        printf '%s\\n' "$*" >> "$TEST_CALLS"
        case "$*" in
          '--no-install playwright install-deps chromium')
            dependency_attempt=$((dependency_attempt + 1))
            [ "$dependency_attempt" -gt "$TEST_DEPENDENCY_FAILURES" ] || return 100
            ;;
          '--no-install playwright install chromium')
            download_attempt=$((download_attempt + 1))
            [ "$download_attempt" -gt "$TEST_DOWNLOAD_FAILURES" ] || return 1
            ;;
          *) return 2 ;;
        esac
      }
      : > "$TEST_CALLS"
      ${installScript}
      printf 'ready for E2E\\n' >> "$TEST_CALLS"
    `], {
      encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, TEST_APT_CONFIG: path.join(directory, 'apt-config').replaceAll('\\', '/'),
        TEST_CALLS: path.join(directory, 'calls').replaceAll('\\', '/'),
        TEST_DEPENDENCY_FAILURES: String(dependencyFailures), TEST_DOWNLOAD_FAILURES: String(downloadFailures),
        TEST_CONFIG_FAILS: String(configFails) }
    });
    assert.ifError(result.error);
    return { ...result, calls: readFileSync(path.join(directory, 'calls'), 'utf8').trim().split('\n'),
      aptConfig: configFails ? '' : readFileSync(path.join(directory, 'apt-config'), 'utf8') };
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
}

const dependencies = '--no-install playwright install-deps chromium';
const download = '--no-install playwright install chromium';

test('Playwright setup refreshes APT strictly and installs dependencies before browsers', () => {
  const result = install();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, [dependencies, download, 'ready for E2E']);
  assert.match(result.aptConfig, /APT::Update::Error-Mode "any"/);
  assert.match(result.aptConfig, /Acquire::Retries "1"/);
  assert.match(result.aptConfig, /Acquire::https::Timeout "20"/);
});

test('transient dependency and download failures recover independently with bounded backoff', () => {
  const result = install({ dependencyFailures: 2, downloadFailures: 1 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, [dependencies, 'sleep 10', dependencies, 'sleep 20', dependencies,
    download, 'sleep 10', download, 'ready for E2E']);
});

test('persistent dependency failures stop before browser download or E2E', () => {
  const result = install({ dependencyFailures: 3 });
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.calls, [dependencies, 'sleep 10', dependencies, 'sleep 20', dependencies]);
  assert.match(result.stderr, /Chromium system dependencies failed after 3 attempts/);
});

test('persistent browser download failures stop after three attempts without reinstalling dependencies', () => {
  const result = install({ downloadFailures: 3 });
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.calls, [dependencies, download, 'sleep 10', download, 'sleep 20', download]);
  assert.match(result.stderr, /Chromium download failed after 3 attempts/);
});

test('failure to configure APT stops setup before installation', () => {
  const result = install({ configFails: true });
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.calls, ['']);
});

test('CI and deploy use the same bounded Playwright setup on pinned Ubuntu runners', () => {
  for (const [file, job] of [['ci.yml', 'e2e'], ['deploy.yml', 'quality']]) {
    const workflow = readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
    const steps = workflow.split(/\n(?= {2}[a-z][\w-]*:\n)/u).find((section) => section.startsWith(`  ${job}:\n`));
    assert.ok(steps, `${file} must contain ${job}`);
    assert.match(steps, /runs-on: ubuntu-24\.04/);
    assert.match(steps, /timeout-minutes: 30/);
    assert.match(steps, /name: Install Chromium and system dependencies\n\s+timeout-minutes: 10\n\s+run: bash \.github\/scripts\/install-playwright\.sh/);
    assert.match(steps, /install-playwright\.sh[\s\S]*npm run test:e2e/);
    assert.doesNotMatch(steps, /continue-on-error/);
  }
});
