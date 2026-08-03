# Архітектура MT Workspace

## Загальна модель

MT Workspace — модульний моноліт. Один Express-процес надає захищене API, публічні API, статичні frontend-збірки та SEO-HTML сторінок товарів. Дані зберігаються у PostgreSQL, медіафайли каталогу — у persistent volume.

Vite створює чотири entrypoint-и:

- `workspace` — внутрішній кабінет;
- `storefront` — публічна вітрина смартфонів;
- `tradeIn` — публічна trade-in сторінка;
- `storeMap` — вбудовувана карта магазинів.

## Потік захищеного запиту

1. Клієнт викликає типізований метод із `client/src/lib/api.ts`.
2. `client/src/lib/api-client.ts` додає cookie, timeout, abort signal і нормалізує API-помилки.
3. Express middleware перевіряє JWT та актуальний стан користувача в PostgreSQL.
4. Модульний route застосовує роль або `requireToolAccess` і валідовує input через Zod.
5. Service/route виконує SQL і повертає `{ data }` або уніфікований `{ error }`.
6. TanStack Query оновлює cache; live-модулі отримують додаткові події через SSE.

Перевірки доступу на frontend потрібні для навігації, але джерелом істини завжди залишається backend.

## Backend-модулі

Код організований за бізнес-доменами у `src/modules`: access, admin, applications, auth, backups, banners, catalog, chat, grids, integrations, notifications, product-tables, publications, store-map, tasks, trade-in та users.

Новий функціонал слід додавати всередині відповідного домену. Якщо зростає великий route/service, його варто ділити за ресурсами або сценаріями, зберігаючи публічний URL і формат відповіді.

## Дані та фонові процеси

- Міграції з `src/migrations` виконуються перед запуском HTTP-сервера під PostgreSQL advisory lock.
- Кожна міграція виконується у власній транзакції та реєструється у `schema_migrations`.
- Сервер запускає workers нагадувань, публікацій, резервних копій і парсера фотографій.
- Graceful shutdown зупиняє workers, HTTP-сервер і connection pool.

## Перевірки

- `npm run lint` — JavaScript, TypeScript і React Hooks;
- `npm run check` — TypeScript;
- `npm run test:server` — API, доменні та deployment-тести;
- `npm run test:web` — React і frontend unit-тести;
- `npm run build` — production bundle;
- `npm run test:e2e` — browser smoke-тести на ізольованій `pg-mem` базі;
- `npm run verify` — основний швидкий quality-gate без завантаження браузера.

Перед зміною контракту потрібно оновити Zod-валідацію, serializer/response, клієнтські типи, API-клієнт і відповідні integration/E2E-тести.

## Deployment

CI запускається на push і pull request для `dev` та `main`. Deployment workflow повторно виконує quality-gate й E2E, створює immutable GHCR image із SHA, перевіряє revision через health endpoint і видаляє лише невикористані образи цього застосунку.
