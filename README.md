# MT Workspace

MT Workspace — внутрішній робочий простір компанії, побудований як модульний моноліт на React,
Express і PostgreSQL. Один застосунок обслуговує захищений кабінет, публічні віджети й сторінки,
інтеграції, фонові черги та адміністративні сценарії.

## Реалізовані можливості

- автентифікація через пароль, TOTP/recovery codes, Passkeys, мобільне підтвердження та QR-вхід;
- профілі, ролі, керування доступом до інструментів і опційна вимога 2FA для окремих інструментів;
- задачі, нагадування, сповіщення, особисті й групові чати;
- конструктор банерних сіток, бібліотеки банерів і генератор товарних добірок;
- XLSX-таблиці товарів, контент-план, редактор блогу й медіабібліотека;
- конструктор форм, заявки, workflow-форми та публічні embed-скрипти;
- локальний каталог уживаних смартфонів, публічна вітрина, теми, імпорт і парсер фото;
- Trade-in, карта магазинів, онлайн-підтримка та popup-банери з публічними віджетами;
- підготовка ручних публікацій у Facebook-групах без автоматичного постингу;
- інтеграція з Хорошоп: синхронізований каталог, супутні товари, Codex-рев’ю, парсер і публікація фото,
  а також CSS-only теми штатного меню категорій;
- мобільні пристрої, Firebase push outbox, системна діагностика й резервні копії в Telegram.

## Технології й структура

- Node.js `>=20.19`, Express 5, PostgreSQL 16 і append-only SQL-міграції;
- React 19, strict TypeScript, Vite, React Router і TanStack Query;
- Vitest, Testing Library, Node Test Runner, Supertest, `pg-mem` і Playwright;
- Docker Compose, GHCR та GitHub Actions.

```text
client/                 React-застосунки, типи, API-клієнт і frontend unit-тести
src/modules/            серверні бізнес-домени
src/migrations/         послідовні PostgreSQL-міграції
tests/                  server integration, contract і deployment-тести
tests/e2e/              Playwright-сценарії
docs/                   актуальна архітектурна й експлуатаційна документація
search-linguistics/     політики та майбутні proposal/export/snapshot артефакти пошуку
docker/                 похідні інфраструктурні образи
```

Vite створює п’ять HTML entrypoint-ів:

- `workspace` — внутрішній кабінет;
- `storefront` — публічна вітрина смартфонів;
- `tradeIn` — публічна Trade-in сторінка;
- `storeMap` — віджет карти магазинів;
- `supportChat` — віджет онлайн-підтримки.

## Локальний запуск

Потрібні Node.js `>=20.19` і PostgreSQL.

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

Frontend працює на `http://localhost:5173`, API — на `http://localhost:3000`. У production Express
віддає результат `npm run build` з `dist/web`.

```bash
npm run build
npm start
```

Для Docker-запуску заповніть `.env` і виконайте `docker compose up --build`. PostgreSQL входить у
звичайний профіль. Redis та OpenSearch навмисно лишаються opt-in:

```bash
npm run infra:search:config
npm run infra:search:up
npm run infra:search:stop
```

Наявність Horoshop-модулів не означає, що intelligent search уже працює. Синхронізація каталогу,
супутні товари й фото реалізовані на PostgreSQL; OpenSearch-індексація, search API, widget,
лінгвістичні rulesets та search analytics залишаються наступними етапами.

## Основні маршрути

- `/` — огляд робочого простору;
- `/tasks`, `/chat`, `/profile`, `/tools` — базові робочі розділи;
- `/catalog/*` — локальний каталог смартфонів і storefront builder;
- `/trade-in/*` — Trade-in workspace;
- `/tools/applications`, `/tools/forms` — заявки та форми;
- `/tools/blog-publications`, `/tools/blog-publications/media` — контент і медіа;
- `/tools/store-map`, `/tools/online-support`, `/tools/popup-banners` — публічні віджети;
- `/tools/horoshop-related-products` — каталог і супутні товари Хорошоп;
- `/tools/horoshop-photo-parser` — фото товарів Хорошоп;
- `/tools/horoshop-catalog-menu` — оформлення штатного меню категорій Хорошопа;
- `/admin/users`, `/admin/system`, `/admin/integrations`, `/admin/backups` — адміністрування.

Доступ до більшості інструментів контролюється окремим `toolId`; перевірка frontend потрібна лише
для навігації, а джерелом істини завжди є backend.

## Перевірки

```bash
npm run lint
npm run check
npm run test:server
npm run test:web
npm run build
npm run verify
```

Browser E2E запускаються окремо:

```bash
npm run test:e2e:install
npm run test:e2e
```

`npm run verify` виконує lint, TypeScript, server/web тести й production build. E2E використовує
ізольовану `pg-mem` базу та не підключається до локальної чи production PostgreSQL.

## Документація

Почніть з [індексу документації](docs/README.md) і [архітектури](docs/architecture.md). Search-документи
чітко розділяють фактичний стан і затверджену цільову архітектуру.
