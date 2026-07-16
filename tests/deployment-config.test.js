import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');

test('deployment publishes and pulls the same immutable full-SHA image', () => {
  assert.match(workflow, /type=sha,prefix=sha-,format=long/);
  assert.match(workflow, /REPOSITORY="\$\(echo 'ghcr\.io\/\$\{\{ github\.repository \}\}' \| tr '\[:upper:\]' '\[:lower:\]'\)"/);
  assert.match(workflow, /IMAGE="\$REPOSITORY:sha-\$\{\{ github\.sha \}\}"/);
  assert.match(workflow, /APP_BUILD_SHA=\$\{\{ github\.sha \}\}/);
});

test('remote deployment fails fast and verifies the running revision', () => {
  assert.match(workflow, /script: \|\r?\n\s+set -euo pipefail/);
  assert.match(workflow, /test "\$RUNNING_IMAGE_ID" = "\$EXPECTED_IMAGE_ID"/);
  assert.match(workflow, /test "\$RUNNING_REVISION" = "\$\{\{ github\.sha \}\}"/);
  assert.match(workflow, /grep -Fq '\"buildSha\":\"\$\{\{ github\.sha \}\}\"' <<< "\$HEALTH"/);
  assert.match(workflow, /grep -Fq 'id="storefront-root"' <<< "\$STOREFRONT"/);
});

test('runtime image carries the build revision used by the health check', () => {
  assert.match(dockerfile, /ARG APP_BUILD_SHA=development/);
  assert.match(dockerfile, /ENV APP_BUILD_SHA=\$APP_BUILD_SHA/);
  assert.match(dockerfile, /org\.opencontainers\.image\.revision=\$APP_BUILD_SHA/);
});
