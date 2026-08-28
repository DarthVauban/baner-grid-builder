# Search implementation plan

Оновлено 2026-08-28. План стосується intelligent product search. Реалізовані на базі того самого
Horoshop catalog accessory/photo tools позначені окремо й не означають завершення search runtime.

## Поточна база

Repository — Express/PostgreSQL modular monolith із React workspace, auth/tool access, append-only
migrations, Docker delivery і automated tests. Horoshop mirror живе в окремих
`search_horoshop_*` tables і не використовує `used_smartphone_*`.

## Stage 0 — foundation: complete

- [x] Repository/runtime/deployment/test audit.
- [x] Technical specification v1.0 і ADRs.
- [x] Repository та linguistic safety instructions.
- [x] Opt-in Compose profile для Redis/OpenSearch.
- [x] Pinned OpenSearch 3.7.0 image з `analysis-ukrainian`.
- [x] Optional validated search environment variables.
- [x] Proposal/export/snapshot directories і policies.
- [x] Foundation tests.

Historical Stage 0 verification (2026-08-08):

- `docker compose --profile search config --quiet` — passed;
- `npm run check` — passed;
- `npm run lint` — passed із 11 тоді наявними warnings;
- `npm run test:server` — 80 passed;
- `npm run test:web` — 175 passed;
- `npm run build` — passed.

Ці counts є історичним записом, не поточним розміром test suite.

## Stage 1 — Horoshop catalog: application implementation complete

- [x] Singleton connection administration і live authentication.
- [x] AES-256-GCM credential storage.
- [x] `pages/export` categories і paginated `catalog/export`.
- [x] Normalization products/modifications/categories.
- [x] Parent-scoped category hierarchy і recovery для неекспортованих technical roots.
- [x] Horoshop creation timestamps та photo-availability metadata для products/modifications.
- [x] Immutable connection generation і store isolation.
- [x] Full/manual/scheduled reconciliation.
- [x] Stable sync signatures й update-only-changed rows.
- [x] Inactive reconciliation після complete traversal.
- [x] Sync status/counts/history, received/total export progress й sanitized disconnect audit.
- [x] Protected integration screen і catalog tool.
- [x] Fixture-backed connector/service/repository tests.
- [x] Full purge before another store connection.

Operational follow-ups before search production:

- [ ] Reconfirm current Horoshop rate limits/token behavior against staging.
- [ ] Record enabled locales and real catalog/variant volume.
- [ ] Agree peak search traffic and hosting capacity.
- [ ] Decide whether first production search remains singleton or introduces tenant/site tables.

Delivered companion workflows:

- [x] Accessory drafts and manual product/category candidates.
- [x] Proposal-only Codex review with generation/revision validation.
- [x] Explicit accept and single/bulk publication with NDJSON progress.
- [x] Horoshop photo selections/drafts, server parser and publication.
- [x] Paired desktop parser with device auth, leases, heartbeat і staging uploads.

These workflows consume the catalog boundary but are not recommendation/search algorithms.

## Stage 2 — indexing, query і linguistics: not started

1. Add OpenSearch/Redis clients with health and feature-flag behavior.
2. Define tenant/site identity migration or explicitly constrain v1 to singleton.
3. Create versioned index templates, physical indices and aliases.
4. Define normalized indexing document contract from existing Horoshop rows.
5. Implement exact/SKU/brand, Ukrainian morphology, transliteration, keyboard layout, autocomplete,
   scoped synonym and fuzzy fields.
6. Add protected-term behavior and field-specific analyzers.
7. Implement bulk/single indexing, incremental updates and zero-downtime rebuild.
8. Add ruleset, synonym, morphology exception, protected term and product override migrations.
9. Implement public query/suggest endpoints, facets, ranking and rate limits.
10. Add relevance fixtures and initial catalog-grounded golden queries.

Exit criteria:

- reproducible index rebuild from PostgreSQL;
- stable query/suggest contract with version identity;
- critical golden-query regression gate;
- controlled unavailable behavior;
- no runtime Codex dependency.

## Stage 3 — widget: not started

1. Add dedicated Vite entrypoint and stable public configuration.
2. Implement domain allowlist/CORS/rate-limit policy.
3. Build standalone and attach-to-existing-input modes.
4. Add desktop/mobile UI, keyboard/focus/screen-reader behavior, facets and zero-results state.
5. Propagate `query_id` to navigation/events.
6. Integrate on staging Horoshop theme and verify CSP/layout/cart compatibility.

## Stage 4 — administration and analytics: not started

1. Add search-specific `toolId`, routes and pages.
2. Build index/sync health, overrides, rules, proposals, preview, publication and rollback UI.
3. Add event ingestion with bounded payloads, redaction and retention.
4. Add aggregates, dashboards, query drill-down and ruleset impact reports.
5. Add structural validation, before/after preview and immutable audit.

## Stage 5 — Codex loop і production hardening: not started

1. Implement deterministic redaction and aggregate JSONL/YAML exports.
2. Implement versioned linguistic proposal schemas/import.
3. Run schema validation and offline relevance evaluation before human review.
4. Add load, security, recovery and accessibility checks.
5. Record licenses/checksums/notices for linguistic artifacts.
6. Roll out behind feature flag with monitoring and rollback.

Codex remains proposal-only. It cannot publish a ruleset or participate in runtime requests.

## Required product/operations inputs

- safe Horoshop staging account for read/write contract verification;
- enabled languages and approximate products/modifications count;
- production memory/CPU and expected p95 traffic;
- staging theme integration path;
- brand/UI references for widget;
- analytics consent, raw-query retention and redaction policy;
- initial golden queries and forbidden-result examples;
- decision on singleton vs tenant-aware first release.
