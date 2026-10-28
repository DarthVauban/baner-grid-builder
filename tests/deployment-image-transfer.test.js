import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const runnerScript = workflow.match(/- name: Prepare deployment image archive\n[\s\S]*?run: \|\n([\s\S]*?)(?=\n {6}- name:)/)[1]
  .split('\n').map((line) => line.slice(10)).join('\n')
  .replaceAll('${{ github.repository }}', 'DarthVauban/baner-grid-builder')
  .replaceAll('${{ github.sha }}', 'a'.repeat(40));
const loadScript = workflow.match(/^ {12}sha256sum --check deployment-image\.tar\.gz\.sha256\n[\s\S]*?(?=^ {12}docker compose config --quiet)/m)[0]
  .split('\n').map((line) => line.slice(12)).join('\n');
const shell = process.platform === 'win32'
  ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe')
  : 'bash';
const image = `ghcr.io/darthvauban/baner-grid-builder:sha-${'a'.repeat(40)}`;

function withTransfer(run) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'mt-deploy-image-test-'));
  const callsFile = path.join(directory, 'calls');
  writeFileSync(callsFile, '');
  function execute(script, { pullFailures = 0, saveFails = false } = {}) {
    const result = spawnSync(shell, ['-c', `
      set -euo pipefail
      pull_attempt=0
      sleep() { :; }
      docker() {
        printf '%s\\n' "$*" >> "$TEST_CALLS_FILE"
        case "$1" in
          pull)
            pull_attempt=$((pull_attempt + 1))
            [ "$pull_attempt" -gt "$TEST_PULL_FAILURES" ]
            ;;
          save)
            [ "$TEST_SAVE_FAILS" = false ] || return 2
            printf 'saved Docker archive fixture'
            ;;
          load) gzip -dc "$3" > loaded-image ;;
          image) printf 'sha256:test-image\\n' ;;
          *) return 2 ;;
        esac
      }
      ${script}
    `], {
      cwd: directory, encoding: 'utf8', timeout: 10_000,
      env: {
        ...process.env, TEST_CALLS_FILE: callsFile.replaceAll('\\', '/'),
        TEST_PULL_FAILURES: String(pullFailures), TEST_SAVE_FAILS: String(saveFails)
      }
    });
    assert.ifError(result.error);
    return { ...result, calls: readFileSync(callsFile, 'utf8') };
  }
  try { run({ directory, execute }); }
  finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
}

test('runner retries registry downloads and server loads the transferred archive without contacting GHCR', () => {
  withTransfer(({ directory, execute }) => {
    const prepared = execute(runnerScript, { pullFailures: 2 });
    assert.equal(prepared.status, 0, prepared.stderr);
    assert.deepEqual(prepared.calls.trim().split('\n'), [`pull ${image}`, `pull ${image}`, `pull ${image}`, `save ${image}`]);
    const loaded = execute(`IMAGE='${image}'\n${loadScript}`);
    assert.equal(loaded.status, 0, loaded.stderr);
    assert.equal(readFileSync(path.join(directory, 'loaded-image'), 'utf8'), 'saved Docker archive fixture');
    assert.ok(loaded.calls.endsWith(`load --input deployment-image.tar.gz\nimage inspect ${image} --format {{.Id}}\n`));
    assert.equal(existsSync(path.join(directory, 'deployment-image.tar.gz')), false);
    assert.equal(existsSync(path.join(directory, 'deployment-image.tar.gz.sha256')), false);
  });
});

test('failed registry downloads stop archive preparation after three attempts', () => {
  withTransfer(({ directory, execute }) => {
    const result = execute(runnerScript, { pullFailures: 3 });
    assert.notEqual(result.status, 0);
    assert.equal(result.calls.trim().split('\n').length, 3);
    assert.doesNotMatch(result.calls, /save /);
    assert.equal(existsSync(path.join(directory, 'deployment-image.tar.gz')), false);
  });
});

test('failed Docker export stops the pipeline before creating a transferable checksum', () => {
  withTransfer(({ directory, execute }) => {
    const result = execute(runnerScript, { saveFails: true });
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(path.join(directory, 'deployment-image.tar.gz.sha256')), false);
  });
});

test('corrupted image delivery fails verification before Docker can load or replace anything', () => {
  withTransfer(({ directory, execute }) => {
    assert.equal(execute(runnerScript).status, 0);
    writeFileSync(path.join(directory, 'deployment-image.tar.gz'), 'truncated image');
    const result = execute(`IMAGE='${image}'\n${loadScript}`);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.calls, /^load /m);
    assert.equal(existsSync(path.join(directory, 'loaded-image')), false);
  });
});
