import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
const compose = readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8');
const catalogMedia = readFileSync(new URL('../src/modules/catalog/catalog.media.js', import.meta.url), 'utf8');

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

test('remote deployment retries transient container registry failures', () => {
  assert.match(workflow, /command_timeout: 20m/);
  assert.match(workflow, /retry\(\) \{[\s\S]*until "\$@"; do[\s\S]*delay_seconds=\$\(\(delay_seconds \* 2\)\)/);
  assert.match(workflow, /retry 4 5 login_ghcr/);
  assert.match(workflow, /retry 5 10 docker pull "\$IMAGE"/);
});

test('remote deployment starts PostgreSQL, waits for readiness, and prints diagnostics on failure', () => {
  assert.match(workflow, /docker compose up -d --no-build db/);
  assert.match(workflow, /DB_CONTAINER_ID="\$\(docker compose ps -q db\)"/);
  assert.match(workflow, /DB_HEALTH=.*\.State\.Health\.Status/);
  assert.match(workflow, /if ! wait_for_database; then[\s\S]*docker compose restart db[\s\S]*wait_for_database/);
  assert.match(workflow, /docker compose logs --no-color --tail=120 db app/);
});

test('remote deployment removes unused tagged images and limits container logs', () => {
  assert.match(workflow, /docker container prune -f/);
  assert.match(workflow, /docker image prune -af/);
  assert.match(workflow, /docker builder prune -af/);
  assert.match(compose, /max-size:\s*"10m"/);
  assert.match(compose, /max-file:\s*"3"/);
});

test('runtime image carries the build revision used by the health check', () => {
  assert.match(dockerfile, /ARG APP_BUILD_SHA=development/);
  assert.match(dockerfile, /ENV APP_BUILD_SHA=\$APP_BUILD_SHA/);
  assert.match(dockerfile, /org\.opencontainers\.image\.revision=\$APP_BUILD_SHA/);
});

test('catalog photos use persistent writable storage in production', () => {
  assert.match(compose, /CATALOG_MEDIA_DIR:\s*\/app\/storage\/catalog-media/);
  assert.match(compose, /- catalog_media_data:\/app\/storage\/catalog-media/);
  assert.match(compose, /\n\s{2}catalog_media_data:\s*(?:\r?\n|$)/);
  assert.match(dockerfile, /mkdir -p \/app\/storage\/catalog-media/);
  assert.match(dockerfile, /chown -R nodeapp:nodeapp \/app\/storage/);
  assert.match(catalogMedia, /NODE_ENV === 'production'/);
  assert.match(catalogMedia, /Configure a writable persistent CATALOG_MEDIA_DIR/);
});

test('first persistent-storage deployment migrates media from the legacy container', () => {
  assert.match(workflow, /uses: appleboy\/scp-action@v1[\s\S]*source: docker-compose\.yml[\s\S]*target: \$\{\{ secrets\.APP_DIR \}\}/);
  assert.match(workflow, /HAS_MEDIA_VOLUME=.*\/app\/storage\/catalog-media/);
  assert.match(workflow, /docker cp "\$OLD_CONTAINER_ID:\/tmp\/mt-panel-catalog-media\/\." "\$MEDIA_BACKUP\/"/);
  assert.match(workflow, /docker cp "\$MEDIA_BACKUP\/\." "\$CONTAINER_ID:\/app\/storage\/catalog-media\/"/);
  assert.match(workflow, /chown -R nodeapp:nodeapp \/app\/storage\/catalog-media/);
  assert.match(workflow, /test "\$MEDIA_MOUNT_TYPE" = "volume"/);
  assert.match(workflow, /docker exec "\$CONTAINER_ID" test -w \/app\/storage\/catalog-media/);
});
