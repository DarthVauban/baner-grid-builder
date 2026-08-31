# Архітектура MT Workspace

Актуально для міграцій `001–078` і коду станом на 2026-08-28.

## Загальна модель

MT Workspace — модульний моноліт. Один Node.js/Express-процес:

- надає захищені й публічні API;
- віддає п’ять Vite-збірок та статичні медіафайли;
- формує SEO-HTML сторінок локального storefront;
- запускає фонові workers;
- використовує PostgreSQL як основне сховище.

Ця модель зберігає одну систему автентифікації, міграцій, деплою та адміністрування. Новий домен
додається у `src/modules`, а не як окремий застосунок або новий package workspace.

## Runtime і startup

`src/server.js` перед відкриттям HTTP-порту:

1. виконує всі невиконані SQL-міграції;
2. створює bootstrap-admin, якщо задані відповідні environment variables;
3. запускає HTTP-сервер;
4. запускає workers нагадувань, публікацій, backups, локального/Horoshop photo parser, mobile push і
   Horoshop catalog sync.

`SIGTERM` і `SIGINT` зупиняють workers, HTTP listener і PostgreSQL pool. Під час restore backup
maintenance middleware повертає контрольований `503` для всіх запитів, крім health check.

Express middleware у `src/app.js` відповідає за build revision header, maintenance mode, Helmet/CSP,
ізоляцію standalone-доменів, CORS, JSON limit, cookies, auth rate limiting, router mounts, статичні
assets, SPA fallbacks і централізований error handler.

## Backend-домени

| Домен | Відповідальність |
| --- | --- |
| `access`, `auth`, `users`, `admin` | сесії, 2FA, Passkeys, ролі, tool access, користувачі й адміністрування |
| `tasks`, `notifications`, `chat` | задачі, нагадування, live-сповіщення й командні чати |
| `banners`, `grids` | конструктори й збережені робочі артефакти |
| `publications`, `media`, `facebook-publications` | контент-план, редактор/медіа та ручні Facebook-публікації |
| `applications` | форми, public embed, заявки, призначення менеджерів і коментарі |
| `catalog` | локальний каталог смартфонів, імпорт, storefront, themes і photo parser |
| `trade-in`, `store-map` | builder/API для Trade-in і карти магазинів |
| `support-chat`, `popup-banners` | операторські інструменти та публічні віджети |
| `horoshop-catalog-menu` | CSS-only оформлення штатного меню категорій Хорошопа |
| `integrations`, `backups` | encrypted settings, Telegram/Mailtrap і backup/restore |
| `mobile` | пристрої, pairing, QR login, login approval і Firebase outbox |
| `search/horoshop` | окремий Horoshop catalog, accessories і photo workflow |

Старіші модулі можуть містити SQL безпосередньо в routes. Для нового коду рекомендований шаблон:

```text
routes (HTTP + Zod + access)
  -> service (use case + transaction boundary)
    -> repository (SQL + mapping)
      -> PostgreSQL/external client
```

Великі існуючі файли (`catalog.routes.js`, `catalog.service.js`, Horoshop photo service) не слід
збільшувати новими незалежними ресурсами — їх треба розділяти зі збереженням контракту.

## API і помилки

`client/src/lib/api.ts` збирає типізовані domain clients у стабільний об’єкт `api`. Horoshop
catalog/accessory/photo methods належать `client/src/lib/api-horoshop.ts`, а shared transport у
`api-client.ts` додає same-origin credentials, timeout/AbortSignal, декодує JSON або NDJSON і
нормалізує помилки.

```json
{ "data": {} }
```

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [] } }
```

Input перевіряється Zod через `parseInput`; некоректні дані отримують `422`. `AppError` задає
контрольований HTTP status/code/message. Error middleware також нормалізує invalid JSON, payload
limits, unique conflicts, відсутність PostgreSQL і неочікувані помилки.

Публічний контракт змінюється атомарно: validation → service/serializer → client type → API method →
integration/UI/E2E test.

## Автентифікація й авторизація

Захищений запит приймає JWT з HttpOnly cookie або Bearer header. `requireAuth` перевіряє підпис, після
чого повторно читає користувача з PostgreSQL і відхиляє відсутній або несхвалений обліковий запис.

Авторизація має три рівні:

- роль (`admin`, `editor`, `content_manager`, `manager`);
- окремий доступ до `toolId`;
- опційна вимога ввімкненої 2FA для конкретного інструмента.

Frontend guards керують лише UX. Backend middleware залишається джерелом істини.

Підтримуються password login, TOTP/recovery codes, WebAuthn Passkeys, підтвердження входу в мобільному
застосунку та browser QR login. QR login зберігає browser secret у body, прив’язаний до origin,
deployment і одноразового challenge; JWT або cookie не кодуються у QR.

## Frontend

`client/src/main.tsx` створює provider tree:

```text
QueryClient -> BrowserRouter -> Auth -> Theme -> Toast -> ConfirmDialog -> App
```

React Router описує захищені workspace routes, admin routes і tool guards. Великі сторінки
завантажуються через `React.lazy`. TanStack Query є основним сховищем server state; auth/theme/toast,
confirm dialog і banner workspace використовують React contexts. Redux або окремого глобального
store немає.

П’ять Vite entrypoint-ів мають окремі HTML-файли й React roots: workspace, storefront, Trade-in,
store map і support chat. Публічні API підключаються через явні `/api/public/*` або `/api/storefront/*`
маршрути.

Меню каталогу Хорошопа не є окремим Vite entrypoint або iframe: публічний framework-free адаптер має
працювати безпосередньо зі штатним DOM магазину. Він підключає версіонований CSS, не читає й не
надсилає каталог і при невідомій розмітці залишає стандартне меню без змін.

В адмін-інтерфейсі нові single-select поля використовують `StyledSelect`, а модальні вікна —
`ModalDialog`. Це спільні accessibility/layout контракти, а не лише стилістична рекомендація.

## Realtime і довгі операції

Chat, notifications, applications, catalog, storefront і support chat використовують SSE. Події
публікуються через process-local `EventEmitter`, а клієнт після сигналу інвалідовує TanStack Query
cache і повторно читає server state.

Це означає, що live-події розраховані на один app instance. Перед горизонтальним масштабуванням
потрібен спільний event transport (наприклад, PostgreSQL/Redis pub-sub або durable outbox).

Публікація великих наборів accessories і Horoshop photos використовує `application/x-ndjson` із
progress records та фінальним результатом. Нові довгі HTTP-операції мають підтримувати cancellation,
idle timeout і контрольоване відновлення, а durable роботу краще оформляти як job.

## PostgreSQL і міграції

- `src/migrations` — єдине місце зміни схеми;
- застосовані міграції не редагуються;
- runner сортує `.sql` за іменем і записує їх у `schema_migrations`;
- кожна міграція виконується транзакційно під advisory lock;
- складні use cases використовують явні `BEGIN/COMMIT/ROLLBACK`, row locks і за потреби
  `FOR UPDATE SKIP LOCKED`;
- `pg-mem` використовується в automated tests, тому новий SQL має бути сумісним або мати тестовий
  еквівалент.

PostgreSQL є source of truth. Медіафайли локального каталогу зберігаються у persistent volume.
OpenSearch — майбутній derived index, Redis — майбутні leases/cache для intelligent search.

## Horoshop і search boundary

Таблиці `search_horoshop_*` належать зовнішньому каталогу Хорошоп і не мають використовувати
`used_smartphone_*` як джерело істини. Реалізовано singleton connection з immutable `generation`,
зашифрованими credentials, full/differential reconciliation, parent-scoped category hierarchy,
Horoshop creation/photo metadata, received/total export progress, accessories
drafts/proposals/publication та photo selections/drafts/queues.

OpenSearch query runtime, widget, search analytics і versioned linguistic rulesets ще не
реалізовані. `SEARCH_FEATURE_ENABLED`, `OPENSEARCH_URL` і `REDIS_URL` зарезервовані для цього контуру;
вони не вимикають уже реалізовані Horoshop admin tools.

Codex не є runtime dependency. Для accessories він може лише створити reviewable proposals; імпорт
не публікує їх у Хорошоп. Для майбутньої лінгвістики він також буде proposal-only.

Публічна desktop- і mobile-вітрини Хорошопа мають окремі DOM- та interaction-контракти. Embed-код
визначає surface за DOM-коренем, а не лише viewport, і підтримує окремі selector maps та fixtures.
Канонічні правила, поточні cart/product selectors і матриця перевірки описані в
[DOM-контракті вітрини Хорошопа](horoshop-storefront-dom-contract.md).

## Workers і відмовостійкість

- reminders і publication checks блокують рядки через `FOR UPDATE SKIP LOCKED`;
- mobile push використовує transactional outbox, leases, retry/backoff і видалення лише невалідного
  FCM credential;
- photo parser відновлює перервані server runs, а desktop jobs мають lease/heartbeat;
- Horoshop catalog worker періодично перевіряє due connection і не створює паралельний sync;
- backup worker поважає maintenance mode й зберігає історію запусків.

Process-local `running` flags запобігають overlap всередині одного процесу. Для кількох app replicas
потрібна перевірка кожного worker на database-level lock/lease.

## Тестування й delivery

- `npm run lint` — JavaScript, TypeScript, React Hooks і E2E config;
- `npm run check` — strict TypeScript;
- `npm run test:server` — Node unit/integration/contract/deployment tests;
- `npm run test:web` — Vitest/Testing Library;
- `npm run build` — production Vite bundle;
- `npm run verify` — основний quality gate;
- `npm run test:e2e` — Playwright на ізольованій `pg-mem` базі.

CI запускає verify і E2E окремими jobs для `dev` та `main`. Deployment повторює quality gate, будує
immutable GHCR image із SHA й перевіряє revision через `/api/health`.

## Типовий новий вертикальний зріз

1. Визначити власника домену й публічний контракт.
2. Додати нову numbered migration.
3. Реалізувати routes/service/repository та server-side access checks.
4. Змонтувати router у `src/app.js`; для job додати startup/shutdown lifecycle у `src/server.js`.
5. Додати client types, API method, lazy page/route і за потреби `toolId`/tools catalog.
6. Оновити документацію та focused integration/UI tests.
7. Запустити focused checks і `npm run verify`, не змінюючи generated/runtime data вручну.
