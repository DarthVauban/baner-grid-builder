# Search module boundary

This directory owns the external Horoshop search service. It intentionally does not reuse the
`used_smartphone_*` catalog as its source of truth.

Internal areas:

- `horoshop` — authenticated catalog import, normalization, reconciliation, connection lifecycle,
  and complete local purge before a different store can be connected;
- `catalog` — normalized external products, categories, variants, and sync state;
- `indexing` — OpenSearch mappings, aliases, bulk indexing, and zero-downtime rebuilds;
- `linguistics` — normalization, protected terms, scoped synonyms, morphology overrides, and rulesets;
- `analytics` — query, impression, click, cart, purchase, and reformulation events;
- `widget` — public configuration and domain-authorized search/event endpoints;
- `admin` — protected management endpoints, previews, proposals, publication, and rollback.

PostgreSQL is authoritative. OpenSearch and Redis contain derived or transient state. Codex may
produce reviewable proposals but is not part of the runtime request path and may not publish a
ruleset directly.

