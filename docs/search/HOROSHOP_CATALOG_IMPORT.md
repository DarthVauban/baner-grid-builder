# Інтеграція й каталог Хорошоп

Статус: connection, synchronization, catalog browsing, accessories і photo workflows реалізовані
на PostgreSQL. Intelligent search runtime на OpenSearch ще не реалізований.

## Connection administration

Admin підключає один магазин на **Адміністрування → Інтеграції**. Backend:

- нормалізує store domain;
- автентифікується через Horoshop `/api/auth/`;
- виконує read-only capability probes;
- шифрує login/password AES-256-GCM;
- не повертає login, password, encrypted payload або transient token у браузер;
- створює immutable `connection_id` і `generation`;
- запускає initial full sync.

```text
GET    /api/admin/integrations/horoshop
POST   /api/admin/integrations/horoshop/connect
POST   /api/admin/integrations/horoshop/sync
PATCH  /api/admin/integrations/horoshop/settings
DELETE /api/admin/integrations/horoshop
```

Маршрути admin-only і повертають `Cache-Control: no-store`.

## Synchronization

Categories завантажуються через `pages/export`, products — через `catalog/export` batch-ами до 200.
Horoshop export не надає надійного `updated_since`, тому manual/scheduled reconciliation читає
актуальний catalog повністю.

Щоб не переписувати незмінні rows, normalizer створює stable SHA-256 `sync_signature`. Repository:

1. створює нові categories/products/modifications;
2. оновлює лише змінені або раніше inactive rows;
3. позначає `last_seen_sync_id`;
4. після повного успішного проходу деактивує відсутні rows;
5. зберігає safe source object у `source_data`.

Connection status переходить між `connected`, `syncing`, `error`, `disconnecting`, `purge_failed`.
Sync run має mode `full`, `manual` або `scheduled`, counts, timestamps і error. Worker раз на хвилину
перевіряє, чи настав збережений polling interval; паралельний sync не запускається.

## Цілісність і disconnect

Кожна write transaction блокує connection row і перевіряє generation. Пакет від старого sync не
може записатись після reconnect або в інший store.

Disconnect:

1. ставить `disconnecting` і блокує нову роботу;
2. серіалізується з активним sync/external write;
3. видаляє connection row та всі `search_horoshop_*` children каскадно;
4. видаляє connection-owned photo media;
5. перевіряє zero counts;
6. записує sanitized audit з HMAC domain fingerprint і deletion counts.

Failure залишає `purge_failed`, доки cleanup не завершено. Дані в самому Horoshop не видаляються.

## Catalog tool

`/tools/horoshop-related-products` захищений `horoshop_related_products`.

```text
GET  /api/search/horoshop/catalog
POST /api/search/horoshop/sync
```

Catalog endpoint повертає paginated parent products, modification tree, categories й availability
options. Фільтри: search, category, availability, visibility, active/inactive state. Пошук охоплює
title, brand, parent SKU та modification title/SKU. `source_data` і credentials не повертаються.

## Accessories

У вкладці accessories користувач працює з локальною draft конкретного parent product. Draft може
містити individual products і leaf categories; limits — по 16 елементів кожного типу.

Codex review є user-invoked admin-time workflow. Застосунок не має recommendation algorithm і не
викликає LLM у runtime. Review import:

- використовує `horoshop-codex-accessory-review/v1`;
- вимагає незмінні connection generation/catalog revision;
- охоплює кожен active parent product, включно з порожніми recommendations;
- зберігає proposals unselected;
- не публікує їх у Horoshop.

Після import користувач окремо приймає proposals у drafts, редагує їх і окремо запускає publication.
Bulk publication використовує NDJSON progress. `catalog/import` отримує повний accessories array,
тому publish завжди вимагає explicit overwrite confirmation.

Повний контракт: [Супутні товари — чинні вимоги](../horoshop-related-products/REQUIREMENTS.md).

## Photos

Окремий інструмент `/tools/horoshop-photo-parser` використовує той самий connection/catalog, але має
власне право `horoshop_photo_parser`. Він підтримує:

- selections вручну або з catalog filters;
- draft на product gallery чи modification images;
- server або paired desktop executor;
- asset selection до 40 photos;
- `append` або `replace` publication;
- streaming bulk publication progress.

Desktop contract: [Десктопний парсер фото](horoshop-photo-desktop-parser.md).

## Data ownership

Основні групи таблиць:

```text
search_horoshop_connections / sync_runs / audit_log
search_horoshop_categories / products / modifications
search_horoshop_accessory_sets / links / proposals / publications
search_horoshop_photo_selections / drafts / assets / batches / runs
search_horoshop_photo_parser_devices / pairings / run_uploads
```

Усі вони незалежні від `used_smartphone_*`. PostgreSQL є source of truth для synchronized metadata й
local workflow state; Horoshop — source of commercial product truth.

## Зовнішні джерела

- [Офіційна сторінка інтеграцій та API Хорошоп](https://horoshop.ua/ua/integration/)
- [Центр допомоги Хорошоп](https://help.horoshop.ua/uk/)
- [Офіційний method `catalog/import`](https://horoshop.notion.site/1b6cc2897079812b9127de30b8fd106c)

Перед зміною auth/import/write contract перевіряйте актуальну official documentation і live staging
account read-only probes. Production mutation не використовується як capability test.
