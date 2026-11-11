import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const runnerScript = readFileSync(new URL('../.github/scripts/run-playwright.sh', import.meta.url), 'utf8');
const shell = process.platform === 'win32'
  ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe') : 'bash';
const image = 'mcr.microsoft.com/playwright:v1.62.1-noble';
const imageId = `sha256:${'a'.repeat(64)}`;

function run({ pullFailures = 0, pullStatus = 1, version = '1.62.1', versionStatus = 0,
  inspectedId = imageId, inspectStatus = 0, testStatus = 0 } = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'mt-playwright-runner-'));
  try {
    const result = spawnSync(shell, ['-c', `
      set -euo pipefail
      pull_attempt=0
      node() {
        [ "$*" = "-p require('@playwright/test/package.json').version" ] || return 2
        printf '%s\\n' "$TEST_VERSION"
        return "$TEST_VERSION_STATUS"
      }
      sleep() { printf 'sleep %s\\n' "$*" >> "$TEST_CALLS"; }
      timeout() {
        printf 'timeout %s\\n' "$1" >> "$TEST_CALLS"
        [ "$1" = 180s ] || return 2
        shift
        "$@"
      }
      docker() {
        printf 'docker %s\\n' "$*" >> "$TEST_CALLS"
        case "$1" in
          pull)
            pull_attempt=$((pull_attempt + 1))
            [ "$pull_attempt" -gt "$TEST_PULL_FAILURES" ] || return "$TEST_PULL_STATUS"
            ;;
          image)
            printf '%s\\n' "$TEST_IMAGE_ID"
            return "$TEST_INSPECT_STATUS"
            ;;
          run)
            printf '%s\\n' "$@" > "$TEST_RUN_ARGS"
            return "$TEST_E2E_STATUS"
            ;;
          *) return 2 ;;
        esac
      }
      : > "$TEST_CALLS"
      : > "$TEST_RUN_ARGS"
      ${runnerScript}
      printf 'E2E passed\\n' >> "$TEST_CALLS"
    `], {
      encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, TEST_CALLS: path.join(directory, 'calls').replaceAll('\\', '/'),
        TEST_RUN_ARGS: path.join(directory, 'run-args').replaceAll('\\', '/'),
        TEST_PULL_FAILURES: String(pullFailures), TEST_PULL_STATUS: String(pullStatus),
        TEST_VERSION: version, TEST_VERSION_STATUS: String(versionStatus), TEST_IMAGE_ID: inspectedId,
        TEST_INSPECT_STATUS: String(inspectStatus), TEST_E2E_STATUS: String(testStatus) }
    });
    assert.ifError(result.error);
    const lines = (name) => readFileSync(path.join(directory, name), 'utf8').trim().split('\n').filter(Boolean);
    return { ...result, calls: lines('calls'), args: lines('run-args') };
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
}

const pullCalls = ['timeout 180s', `docker pull ${image}`];
const inspectCall = `docker image inspect ${image} --format {{.Id}}`;

test('E2E runs once in the official image matching the installed test dependency', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls.slice(0, 3), [...pullCalls, inspectCall]);
  assert.deepEqual(result.args.slice(0, 5), ['run', '--rm', '--init', '--ipc=host', '--mount']);
  assert.match(result.args[5], /^type=bind,source=.+,target=\/workspace$/);
  assert.deepEqual(result.args.slice(6), ['--workdir', '/workspace', '--env', 'CI=true', imageId, 'npm', 'run', 'test:e2e']);
  assert.equal(result.calls.at(-1), 'E2E passed');
  assert.equal(result.calls.filter((call) => call.startsWith('docker run ')).length, 1);
  assert.doesNotMatch(runnerScript, /apt-get|install-deps|--privileged|--env-file/);
});

test('updating the installed test dependency selects its matching browser image', () => {
  const result = run({ version: '1.63.2' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls[1], 'docker pull mcr.microsoft.com/playwright:v1.63.2-noble');
});

test('transient image pull failures recover with bounded backoff', () => {
  const result = run({ pullFailures: 2 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls.slice(0, 9), [...pullCalls, 'sleep 10', ...pullCalls, 'sleep 20', ...pullCalls, inspectCall]);
});

test('persistent image pull failures stop before container execution', () => {
  const result = run({ pullFailures: 3 });
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.calls, [...pullCalls, 'sleep 10', ...pullCalls, 'sleep 20', ...pullCalls]);
  assert.deepEqual(result.args, []);
  assert.match(result.stderr, /Playwright image pull failed after 3 attempts/);
});

test('pull timeouts use the same bounded retry and stop before E2E', () => {
  const result = run({ pullFailures: 3, pullStatus: 124 });
  assert.notEqual(result.status, 0);
  assert.equal(result.calls.filter((call) => call === 'timeout 180s').length, 3);
  assert.deepEqual(result.args, []);
});

test('missing or invalid dependency versions stop before accessing Docker', () => {
  for (const options of [{ versionStatus: 1 }, { version: '' }, { version: '1.63.0-beta' }]) {
    const result = run(options);
    assert.notEqual(result.status, 0);
    assert.deepEqual(result.calls, []);
  }
});

test('failed inspection or an invalid image ID stops before E2E', () => {
  for (const options of [{ inspectStatus: 1 }, { inspectedId: '' }, { inspectedId: 'latest' }]) {
    const result = run(options);
    assert.notEqual(result.status, 0);
    assert.deepEqual(result.calls, [...pullCalls, inspectCall]);
    assert.deepEqual(result.args, []);
  }
});

test('E2E failure propagates without retrying tests or reporting success', () => {
  const result = run({ testStatus: 42 });
  assert.equal(result.status, 42);
  assert.equal(result.calls.filter((call) => call.startsWith('docker run ')).length, 1);
  assert.ok(!result.calls.includes('E2E passed'));
});

test('CI and deploy share containerized E2E and keep their quality gates', () => {
  for (const [file, job] of [['ci.yml', 'e2e'], ['deploy.yml', 'quality']]) {
    const workflow = readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
    const steps = workflow.split(/\n(?= {2}[a-z][\w-]*:\n)/u).find((section) => section.startsWith(`  ${job}:\n`));
    assert.ok(steps, `${file} must contain ${job}`);
    assert.match(steps, /runs-on: ubuntu-24\.04/);
    assert.match(steps, /timeout-minutes: 30/);
    assert.match(steps, /name: Run E2E in Playwright image\n\s+timeout-minutes: 20\n\s+run: bash \.github\/scripts\/run-playwright\.sh/);
    assert.match(steps, /npm ci[\s\S]*run-playwright\.sh/);
    assert.doesNotMatch(steps, /continue-on-error|install-playwright|install --with-deps/);
    if (job === 'e2e') assert.match(steps, /needs: verify/);
    else assert.match(steps, /npm run verify[\s\S]*run-playwright\.sh/);
  }
});
