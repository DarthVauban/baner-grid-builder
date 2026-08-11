import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const agents = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
const compose = readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8');
const opensearchDockerfile = readFileSync(new URL('../docker/opensearch/Dockerfile', import.meta.url), 'utf8');
const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const normalizedCompose = compose.replace(/\r\n/g, '\n');
const appService = normalizedCompose.match(
  /\n {2}app:\n([\s\S]*?)(?=\n {2}[a-z0-9_-]+:\n|\n[a-z0-9_-]+:\n|$)/i
)?.[1] || '';

test('search infrastructure stays opt-in and binds data services to loopback', () => {
  assert.match(compose, /redis:[\s\S]*profiles:\s*\["search"\]/);
  assert.match(compose, /opensearch:[\s\S]*profiles:\s*\["search"\]/);
  assert.match(compose, /127\.0\.0\.1:\$\{REDIS_BIND_PORT:-6379\}:6379/);
  assert.match(compose, /127\.0\.0\.1:\$\{OPENSEARCH_BIND_PORT:-9200\}:9200/);
  assert.ok(appService, 'app service must remain present');
  assert.doesNotMatch(appService, /^\s+(redis|opensearch):\s*$/m);
});

test('OpenSearch is pinned and includes the Ukrainian analyzer', () => {
  assert.match(opensearchDockerfile, /ARG OPENSEARCH_VERSION=3\.7\.0/);
  assert.match(opensearchDockerfile, /analysis-ukrainian/);
  assert.match(envExample, /OPENSEARCH_VERSION=3\.7\.0/);
});

test('project instructions protect published linguistic data', () => {
  assert.match(agents, /Never modify a published linguistic ruleset in place/);
  assert.match(agents, /Codex-generated changes must be written only as proposals/);
  assert.match(agents, /Publishing requires an explicit user\/admin action/);
  assert.match(agents, /Keep raw search-query exports out of Git/);
});
