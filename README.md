# MT Workspace

Внутрішній робочий простір компанії на React та Express. Усі користувацькі й адміністративні сценарії працюють у єдиному React-інтерфейсі; старий статичний клієнт видалено.

## Можливості

- авторизація та керування профілем;
- адміністрування користувачів;
- особистий список справ, запрошення учасників і сповіщення;
- конструктор сіток банерів із попереднім переглядом та генерацією коду;
- бібліотеки збережених сіток і банерів;
- генератор коду для добірки товарів;
- імпорт, редагування та збереження XLSX-таблиць товарів.

## Технології

- React 19, TypeScript, Vite;
- React Router і TanStack Query;
- Express 5, PostgreSQL;
- Vitest, Testing Library і Node Test Runner.

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
npm run check
npm test
npm run build
```

## Основні маршрути

- `/` — огляд робочого простору;
- `/tasks` — список справ;
- `/tools/banner-grid` — конструктор і бібліотеки банерних сіток;
- `/tools/product-selection` — генератор добірки товарів;
- `/tools/product-tables` — таблиці товарів;
- `/admin/users` — керування користувачами для адміністратора.

## Структура

```text
client/       React-застосунок
src/          Express API та сервер production-збірки
migrations/   міграції PostgreSQL
tests/        інтеграційні тести API
dist/web/     production-збірка React (генерується)
```

Production-збірка також доступна через `docker compose up --build` після заповнення `.env`.
