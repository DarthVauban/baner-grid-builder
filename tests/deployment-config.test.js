import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const ciWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const tradeInTlsWorkflow = readFileSync(new URL('../.github/workflows/configure-trade-in-tls.yml', import.meta.url), 'utf8');
const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
const compose = readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8');
const catalogMedia = readFileSync(new URL('../src/modules/catalog/catalog.media.js', import.meta.url), 'utf8');
const nginx = readFileSync(new URL('../nginx/nginx.conf', import.meta.url), 'utf8');
const tradeInNginx = readFileSync(new URL('../nginx/tradein.mobiletrend-host.conf', import.meta.url), 'utf8');
const tradeInBootstrapNginx = readFileSync(new URL('../nginx/tradein.mobiletrend-bootstrap.conf', import.meta.url), 'utf8');

test('deployment publishes and pulls the same immutable full-SHA image', () => {
  assert.match(workflow, /type=sha,prefix=sha-,format=long/);
  assert.match(workflow, /REPOSITORY="\$\(echo 'ghcr\.io\/\$\{\{ github\.repository \}\}' \| tr '\[:upper:\]' '\[:lower:\]'\)"/);
  assert.match(workflow, /IMAGE="\$REPOSITORY:sha-\$\{\{ github\.sha \}\}"/);
  assert.match(workflow, /APP_BUILD_SHA=\$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(workflow, /type=raw,value=latest/);
});

test('deployment separates development and production by directory, port, project, and environment', () => {
  assert.match(workflow, /branches: \[main, dev\]/);
  assert.match(workflow, /environment: \$\{\{ github\.ref_name == 'main' && 'production' \|\| 'development' \}\}/);
  assert.match(workflow, /APP_DIR: \$\{\{ github\.ref_name == 'main' && '\/opt\/mt-workspace\/prod' \|\| '\/opt\/mt-workspace\/dev' \}\}/);
  assert.match(workflow, /APP_PORT: \$\{\{ github\.ref_name == 'main' && '3100' \|\| '3101' \}\}/);
  assert.match(workflow, /COMPOSE_PROJECT: \$\{\{ github\.ref_name == 'main' && 'mt-panel-prod' \|\| 'mt-panel-dev' \}\}/);
  assert.match(workflow, /APP_ENVIRONMENT: \$\{\{ github\.ref_name == 'main' && 'production' \|\| 'development' \}\}/);
  assert.match(workflow, /export APP_ENVIRONMENT/);
  assert.match(compose, /APP_ENVIRONMENT: \$\{APP_ENVIRONMENT:-production\}/);
  assert.match(compose, /127\.0\.0\.1:\$\{APP_BIND_PORT:-3000\}:3000/);
  assert.match(compose, /image: \$\{APP_IMAGE:-ghcr\.io\/darthvauban\/baner-grid-builder:latest\}/);
});

test('deployment uses a dedicated SSH key and the rootless Docker socket', () => {
  assert.match(workflow, /username: \$\{\{ secrets\.SSH_USER \}\}/);
  assert.match(workflow, /key: \$\{\{ secrets\.SSH_PRIVATE_KEY \}\}/);
  assert.doesNotMatch(workflow, /password: \$\{\{ secrets\.SSH_PASSWORD \}\}/);
  assert.match(workflow, /XDG_RUNTIME_DIR="\/run\/user\/\$\(id -u\)"/);
  assert.match(workflow, /DOCKER_HOST="unix:\/\/\$XDG_RUNTIME_DIR\/docker\.sock"/);
  assert.match(workflow, /test -S "\$XDG_RUNTIME_DIR\/docker\.sock"/);
});

test('remote deployment fails fast and verifies the running revision', () => {
  assert.match(workflow, /script: \|\r?\n\s+set -euo pipefail/);
  assert.match(workflow, /test "\$RUNNING_IMAGE_ID" = "\$EXPECTED_IMAGE_ID"/);
  assert.match(workflow, /test "\$RUNNING_REVISION" = "\$\{\{ github\.sha \}\}"/);
  assert.match(workflow, /grep -Fq '"buildSha":"\$\{\{ github\.sha \}\}"' <<< "\$HEALTH"/);
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

test('remote deployment only cleans unused Mobile Trend images and limits container logs', () => {
  assert.doesNotMatch(workflow, /docker container prune/);
  assert.doesNotMatch(workflow, /docker image prune -af/);
  assert.doesNotMatch(workflow, /docker builder prune/);
  assert.match(workflow, /USED_IMAGE_IDS=/);
  assert.match(workflow, /docker image ls "\$REPOSITORY"/);
  assert.match(workflow, /docker image prune -f --filter "label=org\.opencontainers\.image\.source=/);
  assert.match(compose, /max-size:\s*"10m"/);
  assert.match(compose, /max-file:\s*"3"/);
});

test('continuous integration verifies types, server, web and production build', () => {
  assert.match(ciWorkflow, /pull_request:[\s\S]*branches:\s*\[dev, main\]/);
  assert.match(ciWorkflow, /push:[\s\S]*branches:\s*\[dev, main\]/);
  assert.match(ciWorkflow, /npm ci/);
  assert.match(ciWorkflow, /npm run lint/);
  assert.match(ciWorkflow, /npm run check/);
  assert.match(ciWorkflow, /npm run test:server/);
  assert.match(ciWorkflow, /npm run test:web/);
  assert.match(ciWorkflow, /npm run build/);
  assert.match(ciWorkflow, /playwright install --with-deps chromium/);
  assert.match(ciWorkflow, /npm run test:e2e/);
  assert.match(workflow, /quality:[\s\S]*npm run verify/);
  assert.match(workflow, /quality:[\s\S]*npm run test:e2e/);
  assert.match(workflow, /build-and-push:[\s\S]*needs:\s*quality/);
});

test('runtime image carries the build revision used by the health check', () => {
  assert.match(dockerfile, /ARG APP_BUILD_SHA=development/);
  assert.match(dockerfile, /ENV APP_BUILD_SHA=\$APP_BUILD_SHA/);
  assert.match(dockerfile, /org\.opencontainers\.image\.revision=\$APP_BUILD_SHA/);
});

test('runtime image includes Chromium for the server-side catalog photo parser', () => {
  assert.match(dockerfile, /CHROMIUM_EXECUTABLE_PATH=\/usr\/bin\/chromium/);
  assert.match(dockerfile, /apk add --no-cache chromium/);
  assert.match(dockerfile, /apk add --no-cache chromium ca-certificates curl/);
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

test('reverse proxy accepts Telegram backup restore archives', () => {
  assert.match(nginx, /client_max_body_size\s+55m/);
  assert.match(nginx, /location \/api\/admin\/backups\/\s*\{[\s\S]*client_body_timeout\s+900s/);
  assert.match(nginx, /location \/api\/admin\/backups\/\s*\{[\s\S]*proxy_read_timeout\s+900s/);
});

test('standalone Trade-in domain has an ACME bootstrap and isolated HTTPS proxy', () => {
  assert.match(tradeInBootstrapNginx, /server_name\s+tradein\.mobiletrend\.com\.ua/);
  assert.match(tradeInBootstrapNginx, /location \^~ \/\.well-known\/acme-challenge\//);
  assert.doesNotMatch(tradeInBootstrapNginx, /listen\s+443/);

  assert.match(tradeInNginx, /return 301 https:\/\/tradein\.mobiletrend\.com\.ua\$request_uri/);
  assert.match(tradeInNginx, /ssl_certificate \/etc\/letsencrypt\/live\/tradein\.mobiletrend\.com\.ua\/fullchain\.pem/);
  assert.match(tradeInNginx, /ssl_certificate_key \/etc\/letsencrypt\/live\/tradein\.mobiletrend\.com\.ua\/privkey\.pem/);
  assert.match(tradeInNginx, /location ~ \^\/\(\?:\$\|trade-in\$\|api\/public\/trade-in\/\|web-assets\/\|favicon\\\.ico\$\)/);
  assert.match(tradeInNginx, /proxy_pass http:\/\/127\.0\.0\.1:3100/);
  assert.match(tradeInNginx, /proxy_set_header X-Forwarded-Host \$host/);
  assert.match(tradeInNginx, /location \/\s*\{\s*return 404;/);
});

test('Trade-in TLS workflow is guarded, validates DNS, and verifies renewal', () => {
  assert.match(tradeInTlsWorkflow, /workflow_dispatch:/);
  assert.match(tradeInTlsWorkflow, /inputs\.confirmation == 'CONFIGURE-TRADEIN-TLS'/);
  assert.match(tradeInTlsWorkflow, /environment: production/);
  assert.match(tradeInTlsWorkflow, /EXPECTED_IP='45\.88\.191\.194'/);
  assert.match(tradeInTlsWorkflow, /key: \$\{\{ secrets\.SSH_PRIVATE_KEY \}\}/);
  assert.match(tradeInTlsWorkflow, /SUDO_PASSWORD: \$\{\{ secrets\.SSH_PASSWORD \}\}/);
  assert.match(tradeInTlsWorkflow, /sudo -S -p ''/);
  assert.match(tradeInTlsWorkflow, /certbot" certonly|CERTBOT_BIN" certonly/);
  assert.match(tradeInTlsWorkflow, /--webroot-path "\$ACME_ROOT"/);
  assert.match(tradeInTlsWorkflow, /run_root "\$NGINX_BIN" -t/);
  assert.match(tradeInTlsWorkflow, /--dry-run/);
  assert.match(tradeInTlsWorkflow, /ROLLBACK_REQUIRED='true'/);
});

test('first persistent-storage deployment migrates media from the legacy container', () => {
  assert.match(workflow, /uses: appleboy\/scp-action@v1[\s\S]*source: docker-compose\.yml[\s\S]*target: \$\{\{ env\.APP_DIR \}\}/);
  assert.match(workflow, /HAS_MEDIA_VOLUME=.*\/app\/storage\/catalog-media/);
  assert.match(workflow, /docker cp "\$OLD_CONTAINER_ID:\/tmp\/mt-panel-catalog-media\/\." "\$MEDIA_BACKUP\/"/);
  assert.match(workflow, /docker cp "\$MEDIA_BACKUP\/\." "\$CONTAINER_ID:\/app\/storage\/catalog-media\/"/);
  assert.match(workflow, /chown -R nodeapp:nodeapp \/app\/storage\/catalog-media/);
  assert.match(workflow, /test "\$MEDIA_MOUNT_TYPE" = "volume"/);
  assert.match(workflow, /docker exec "\$CONTAINER_ID" test -w \/app\/storage\/catalog-media/);
});
