# Search architecture

Актуально станом на 2026-08-28. Документ розділяє фактичний Horoshop-контур і цільовий intelligent
search, щоб майбутні API не сприймались як уже доступні.

## Статус можливостей

| Capability | Статус |
| --- | --- |
| Horoshop connection, encrypted credentials і sync history | реалізовано |
| PostgreSQL category hierarchy та products/modifications mirror із creation/photo metadata | реалізовано |
| Catalog tool і manual/scheduled reconciliation із received/total progress | реалізовано |
| Accessory drafts, Codex proposals, accept/publish і bulk progress | реалізовано |
| Horoshop photo selections, server/desktop queue і publication | реалізовано |
| Opt-in Redis/OpenSearch Compose services | підготовлено, не runtime dependency |
| OpenSearch client, mappings, aliases й indexing | не реалізовано |
| Public query/suggest API і search widget | не реалізовано |
| Linguistic rulesets/proposals publication | policy/spec only |
| Search events, analytics, exports і golden-query evaluation | не реалізовано |

## Repository fit

Search залишається бізнес-доменом модульного моноліту. Поточний код існує лише за реально
реалізованими capabilities:

```text
src/modules/search/
  horoshop/
    horoshop.client.js
    credential-cipher.js
    catalog.{routes,service,repository,normalizer,worker}.js
    accessory.{routes,service,repository,review}.js
    photo.{routes,service}.js
    photo-{selection,publication}.js
    photo-desktop.{routes,service,crypto}.js

client/src/
  lib/api-horoshop.ts
  pages/HoroshopRelatedProductsPage.tsx
  pages/HoroshopPhotoParserPage.tsx
  components/horoshop/
  types/horoshop-*.ts

search-linguistics/
  policies/
  proposals/
  exports/
  snapshots/
```

Empty `indexing`, `linguistics`, `analytics`, `widget` або admin trees не створюються наперед.

## Поточний data flow

```text
Horoshop API
  -> HoroshopClient
    -> CatalogService/Normalizer
      -> HoroshopCatalogRepository
        -> search_horoshop_* PostgreSQL tables
          -> catalog/accessory/photo protected APIs
            -> React workspace tools
```

Connection є singleton для однієї інсталяції. `connection_id` і immutable `generation` ізолюють
reconnect; це ще не повна tenant model із target specification.

Category traversal зберігає `parent_external_id` і вміє повторно синхронізувати parent-scoped trees,
зокрема catalogs із неекспортованим technical root. Product/modification rows зберігають
`horoshop_created_at` і `has_photos`; sync runs окремо фіксують `export_items_received` та
`export_items_total` для видимого прогресу довгого export.

## Data ownership

- Horoshop — commercial product truth.
- PostgreSQL — synchronized catalog mirror, local drafts/proposals, sync/publication history і audit.
- `used_smartphone_*` — незалежний локальний catalog/storefront.
- Media library/persistent volume — imported/staged photo assets.
- OpenSearch у майбутньому буде rebuildable derived index.
- Redis у майбутньому зберігатиме лише leases/jobs/short caches.
- Codex outputs — inert proposals, а не production truth.

Між Horoshop і локальним catalog заборонені direct foreign keys або приховане копіювання. Спільна
поведінка повторно використовується через platform services/explicit contracts.

## Поточні concurrency boundaries

Catalog sync і Horoshop external writes виконуються через shared exclusive service boundary. Кожна
repository transaction перевіряє generation. Photo desktop jobs використовують database lease,
heartbeat і partial unique active-run guard.

SSE в інших доменах залишається process-local. Horoshop bulk publication використовує NDJSON, а не
SSE, і не є durable background queue після розриву HTTP connection.

## Target intelligent-search flow

Після Stage 2:

```text
PostgreSQL normalized mirror + published ruleset
  -> versioned OpenSearch index
    -> stable alias
      -> public query/suggest API
        -> domain-authorized widget

widget events -> bounded ingestion -> PostgreSQL events/aggregates
aggregates -> redacted export -> Codex proposal -> validation/evaluation -> explicit publication
```

Target identity:

- tenant/site на product, rule, event і index;
- `query_id`, `ruleset_version`, `index_version` у response/events;
- immutable published rulesets;
- versioned index names і alias switch після health/relevance checks.

Suggested naming remains:

```text
mt-search-<tenant>-products-v000001
mt-search-<tenant>-products-current -> ...-v000001
```

Ці indices/aliases ще не створюються поточним кодом.

## Infrastructure boundary

Compose profile `search` містить pinned Redis 7.2 і derived OpenSearch 3.7.0 із
`analysis-ukrainian`. Ports bind to loopback. Default deployment залежить тільки від PostgreSQL/app.

`SEARCH_FEATURE_ENABLED`, `OPENSEARCH_URL`, `OPENSEARCH_INDEX_PREFIX`, `REDIS_URL`,
`SEARCH_WIDGET_ORIGIN`, sync interval і analytics retention already validated в env config, але
OpenSearch/Redis clients ще відсутні. Horoshop catalog/accessory/photo tools працюють незалежно від
`SEARCH_FEATURE_ENABLED`.

## Planned publication boundaries

- Query-time synonym changes можуть оновлювати published rule view без product rebuild, якщо mapping
  це дозволяє.
- Index-time analyzer/mapping changes створюють новий index version.
- Alias switch виконується лише після health, structural і golden-query checks.
- Product aliases reindex-ять тільки affected products.
- Published ruleset не редагується in place; rollback перемикає на попередню immutable version.

## Failure behavior

Поточний:

- Horoshop unavailable — зберігається останній PostgreSQL snapshot, sync завершується error;
- stale generation/revision — write/review відхиляється;
- partial external publication — processed/failed state фіксується окремо;
- desktop crash — lease expires і job повертається в queue;
- Codex unavailable — жодного runtime impact.

Майбутній search:

- OpenSearch unavailable — controlled search-unavailable response;
- Redis unavailable — database-safe lock/job fallback, без false acknowledgement;
- analytics unavailable — query/navigation продовжують працювати;
- bad ruleset/index — publication блокується або виконується rollback.

## Extraction seam

Модуль можна буде винести в окремий service, якщо search потребуватиме незалежного scaling. До цього
часу він повторно використовує auth, tool access, PostgreSQL migrations, errors, admin UI, backups,
CI й deployment. Extraction не повинна починатися раніше, ніж з’являться реальні навантаження та
окремий operational owner.
