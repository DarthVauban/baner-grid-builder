# MT Workspace

Внутрішній робочий простір компанії на React та Express. Усі користувацькі й адміністративні сценарії працюють у єдиному React-інтерфейсі; старий статичний клієнт видалено.

## Можливості

- авторизація та керування профілем;
- адміністрування користувачів;
- особистий список справ, запрошення учасників і сповіщення;
- конструктор сіток банерів із попереднім переглядом та генерацією коду;
- бібліотеки збережених сіток і банерів;
- генератор коду для добірки товарів;
- імпорт, редагування та збереження XLSX-таблиць товарів;
- каталог уживаних смартфонів із публічною вітриною, темами та парсером фотографій;
- конструктор заявок і публічні форми;
- trade-in, карта магазинів, чат і контент-план;
- підготовка ручних публікацій у міські Facebook-групи з XLSX-довідниками, локалізацією текстів, контролем темпу та історією спроб;
- системна діагностика, інтеграції та резервні копії.

## Технології

- React 19, TypeScript, Vite;
- React Router і TanStack Query;
- Express 5, PostgreSQL;
- Vitest, Testing Library, Node Test Runner і Playwright.

## Локальний запуск

Потрібні Node.js 20+ і PostgreSQL.

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

Після запуску React-інтерфейс доступний на `http://localhost:5173`, API — на `http://localhost:3000`.

Для production-запуску:

```bash
npm run build
npm start
```

Зібраний застосунок буде доступний на `http://localhost:3000`.

## Перевірки

```bash
npm run verify
```

`verify` запускає ESLint, перевіряє TypeScript, серверні й клієнтські тести та production-збірку. Для першого локального запуску browser E2E:

```bash
npm run test:e2e:install
npm run test:e2e
```

E2E використовує ізольовану `pg-mem` базу та не підключається до локальної чи production PostgreSQL. CI автоматично запускає всі перевірки для `dev` і `main`; deployment має власний quality-gate перед складанням Docker-образу.

## Основні маршрути

- `/` — огляд робочого простору;
- `/tasks` — список справ;
- `/tools/banner-grid` — конструктор і бібліотеки банерних сіток;
- `/tools/product-selection` — генератор добірки товарів;
- `/tools/product-tables` — таблиці товарів;
- `/tools/blog-publications` — контент-план;
- `/tools/applications` — заявки;
- `/tools/forms` — конструктор публічних форм;
- `/chat` — особисті й групові чати;
- `/catalog` — каталог смартфонів, storefront і налаштування;
- `/trade-in` — огляд і конструктор trade-in;
- `/tools/store-map` — карта магазинів;
- `/tools/facebook-publications` — ручна підготовка й облік публікацій у міських Facebook-групах;
- `/admin/users` — керування користувачами для адміністратора.
- `/admin/system`, `/admin/integrations`, `/admin/backups` — системні розділи адміністратора.

## Структура

```text
client/               React-застосунки й frontend unit-тести
src/modules/           модулі Express API
src/migrations/        міграції PostgreSQL
tests/                 server integration та deployment-тести
tests/e2e/             Playwright browser smoke-тести
docs/                  експлуатаційна й архітектурна документація
dist/web/              production-збірка React (генерується)
```

Production-збірка також доступна через `docker compose up --build` після заповнення `.env`.

Детальніше про межі модулів і типовий процес змін: [docs/architecture.md](docs/architecture.md).
