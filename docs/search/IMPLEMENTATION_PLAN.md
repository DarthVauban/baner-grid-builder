# Search implementation plan

## Current repository assessment

The repository is an established Express 5 + PostgreSQL modular monolith with a React 19/Vite
workspace, append-only SQL migrations, authentication, role/tool access, audit patterns, Docker
deployment, and broad automated test coverage. Search will extend this architecture instead of
introducing a second application stack.

The existing `used_smartphone_*` catalog owns a local storefront. It is not the real Horoshop
catalog and must not become the source of truth for this project. Search receives separate
`search_*` tables and OpenSearch indices while reusing shared platform capabilities.

## Stage 0 — foundation

- [x] Audit repository, Git state, runtime, migrations, deployment, and test workflow.
- [x] Record specification v1.0.
- [x] Add root project and linguistic safety instructions.
- [x] Record architecture decisions.
- [x] Add an opt-in Docker Compose `search` profile for Redis and OpenSearch.
- [x] Pin OpenSearch and install `analysis-ukrainian` in a derived image.
- [x] Add validated optional environment settings without enabling search in production.
- [x] Create proposal/export/snapshot/evaluation directories and policies.
- [x] Add foundation tests.
- [x] Run all focused and repository quality gates and record results.

### Stage 0 verification — 2026-08-08

- `git diff --check` — passed;
- `docker compose --profile search config --quiet` — passed (Docker reported only a local
  `~/.docker/config.json` permission warning, not a Compose error);
- `npm run check` — passed;
- `npm run lint` — passed with 11 pre-existing warnings and no errors;
- `npm run test:server` — 80 passed;
- `npm run test:web` — 175 passed across 64 files;
- `npm run build` — passed.

The OpenSearch image was not pulled or built during Stage 0 because that would download a large
external image. The derived Dockerfile and Compose configuration are validated structurally; the
first real image build belongs to Stage 2 infrastructure bring-up.

## Stage 1 — Horoshop catalog

1. Obtain a testable store domain and Horoshop API credentials.
2. Verify live authentication, pagination, product/category schemas, locales, rate limits, and
   availability of order events with read-only calls.
3. Add append-only `search_*` catalog/connection/sync migrations.
4. Encrypt connection credentials with an application-level encryption key.
5. Implement the connector behind an interface and fixture-backed contract tests.
6. Implement full import, scheduled polling, reconciliation, retry, and sync audit.
7. Add protected connection/sync status endpoints and the first admin integration screen.
8. Define the normalized indexing document contract without yet coupling it to OpenSearch writes.

Stage 1 completion requires an idempotent full sync from the real store into separate PostgreSQL
tables, visible sync diagnostics, and integration tests that do not contact production by default.

## Stage 2 — search and linguistics

1. Add OpenSearch/Redis clients with health and feature-flag behavior.
2. Create tenant/versioned index templates and aliases.
3. Implement exact, Ukrainian morphology, transliteration, layout, autocomplete, synonym, and fuzzy
   fields plus protected-term behavior.
4. Implement bulk and single-product indexing and zero-downtime rebuilds.
5. Add ruleset, synonym, morphology-exception, protected-term, and product-override migrations.
6. Implement public query/suggest endpoints, facets, ranking, and rate limits.
7. Add relevance fixtures and an initial catalog-grounded golden-query suite.

## Stage 3 — widget

1. Add a dedicated Vite widget entry and stable public configuration contract.
2. Build standalone and attach-to-existing-input modes.
3. Add desktop/mobile UI, keyboard/accessibility behavior, facets, corrections, and zero-results UI.
4. Add domain allowlisting and resilient event batching.
5. Integrate on a staging Horoshop theme and verify CSP, layout, navigation, and optional cart action.

## Stage 4 — administration and analytics

1. Add a search tool/access entry and workspace routes.
2. Build connection, sync, product override, linguistic rule, proposal, ruleset, and widget screens.
3. Add event ingestion, partitions/retention, aggregation jobs, dashboards, query drill-down, exports,
   and ruleset impact reports.
4. Add before/after preview, structural rule validation, publication, audit, and rollback.

## Stage 5 — Codex loop and production hardening

1. Implement deterministic redaction and aggregate JSONL/YAML exports.
2. Implement proposal schemas and import validation.
3. Add Codex-facing workflow documentation and commands that can only write drafts.
4. Run relevance, load, security, recovery, and E2E checks.
5. Complete licensing review for every bundled linguistic data artifact.
6. Roll out behind a feature flag, monitor, compare to the current search, and retain rollback.

## Inputs needed before Stage 1 live verification

- real Horoshop domain and a non-destructive API account;
- enabled languages and approximate product/variant count;
- staging or safe theme-integration path;
- production hosting constraints and expected peak search traffic;
- brand/UI references for the widget;
- confirmation of analytics consent and retention policy.
