# Search module boundary

## Поточний стан

Під `src/modules/search` реалізовано лише `horoshop/`:

- connection lifecycle, encrypted credentials і API client;
- catalog normalization, PostgreSQL repository, full/manual/scheduled sync;
- catalog routes для інструмента супутніх товарів;
- accessory drafts, Codex proposals, acceptance і publication;
- photo selections/drafts, server worker integration і desktop device queue.

У коді немає OpenSearch/Redis client, query/suggest endpoint, widget, analytics ingestion або
linguistic ruleset service. Не імпортуйте такі capability з порожніх/вигаданих directory.

## Ownership

- Horoshop є commercial source of truth.
- `search_horoshop_*` PostgreSQL tables є synchronized mirror і local workflow state.
- Цей модуль не читає `used_smartphone_*` як джерело Horoshop data.
- Connection `generation` захищає від stale writes після disconnect/reconnect.
- Credentials і transient auth tokens не залишають server boundary.

## Accessories

Application code не містить recommendation algorithm. Codex review:

1. експортує safe current catalog;
2. повертає повне versioned proposal document;
3. проходить structural/generation/revision validation;
4. зберігається unselected;
5. приймається у draft окремою дією;
6. публікується в Horoshop тільки після іншої explicit дії.

## Майбутній intelligent search

Коли capabilities будуть реалізовані, вони можуть додаватися окремими areas:

```text
catalog/      indexing document contract
indexing/     OpenSearch mappings, aliases, rebuilds
linguistics/  protected terms, synonyms, overrides, rulesets
analytics/    events, retention, aggregates, exports
widget/       public config/query/event routes
admin/        protected preview/publication/rollback routes
```

PostgreSQL лишається authoritative. OpenSearch — rebuildable index, Redis — transient
leases/jobs/cache. Codex — offline proposal author, а не runtime dependency.

Документація:

- `docs/search/architecture.md` — current/target architecture;
- `docs/search/HOROSHOP_CATALOG_IMPORT.md` — realized catalog contract;
- `docs/horoshop-related-products/REQUIREMENTS.md` — accessory safety contract;
- `docs/search/IMPLEMENTATION_PLAN.md` — search roadmap.
