# Search architecture

## Repository fit

Search is a new business domain inside the current modular monolith. This minimizes deployment and
authentication duplication while keeping a clear extraction seam if search later needs independent
scaling.

```text
src/modules/search/
  connectors/horoshop/
  catalog/
  indexing/
  linguistics/
  analytics/
  widget/
  admin/

client/src/search/
client/src/pages/search/

search-linguistics/
evals/search/
docs/search/
```

Code is introduced by capability during its implementation stage; empty placeholder trees are not
created. `src/modules/search/README.md` owns the boundary until the first services land.

## Data ownership

- Horoshop owns commercial product truth.
- PostgreSQL owns the latest normalized mirror and all project-owned search behavior.
- OpenSearch owns no irreplaceable state and can be rebuilt from PostgreSQL plus published rules.
- Redis owns only leases, jobs, and expiring caches.
- Export files contain redacted analysis inputs and are not production truth.
- Proposal files and draft rows are inert until explicit publication.

The existing local catalog remains independent. Cross-catalog reuse must happen through explicit
interfaces, not direct foreign keys between Horoshop search data and `used_smartphone_*` tables.

## Tenant and version identity

Every catalog row, rule, query event, aggregate, and index name carries tenant identity. Search
responses carry `query_id`, `ruleset_version`, and `index_version` so analytics remain attributable
after changes.

Suggested index naming:

```text
mt-search-<tenant>-products-v000001
mt-search-<tenant>-products-current -> ...-v000001
```

## Publication boundaries

Search-time synonyms can be refreshed without rebuilding product data when supported safely.
Index-time analyzer or mapping changes create a new index version and switch the alias only after
health and golden-query checks. Product aliases reindex only affected products.

## Failure behavior

- Horoshop unavailable: retain current searchable snapshot and retry synchronization.
- OpenSearch unavailable: return a controlled search-unavailable response; keep events buffered only
  within a bounded limit.
- Redis unavailable: prevent duplicate workers through database-safe fallbacks where needed and
  degrade caches; never acknowledge a durable job that was not persisted.
- Analytics unavailable: search and navigation continue.
- Codex unavailable: no runtime effect.
- Bad ruleset: block publication or roll back to the previous immutable version.

## Deployment boundary

The Compose `search` profile is intentionally opt-in. Existing deployment continues to start only
PostgreSQL and the application until search clients and production operating procedures are ready.
Local OpenSearch and Redis bind only to loopback; production applications reach them over the
internal Compose network.

