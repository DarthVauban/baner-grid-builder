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

## Автентифікація та Passkeys

- Звичайний вхід створює HTTP-only сесію. Для користувачів із 2FA пароль відкриває короткочасний challenge, який можна завершити TOTP-кодом або зареєстрованим Passkey.
- Passkeys реалізовані через WebAuthn. Приватний ключ ніколи не надходить на сервер; PostgreSQL зберігає лише credential ID, публічний ключ, лічильник і метадані пристрою.
- QR для входу через телефон є WebAuthn hybrid transport. Його генерує захищений інтерфейс браузера після натискання «Відкрити QR-код»; застосунок не повинен створювати власний QR із JWT, cookie або іншим сесійним секретом.
- Registration та authentication challenges одноразові, прив'язані до origin/RP ID, мають строк дії п'ять хвилин і позначаються використаними після успішної перевірки.
- Новий Passkey можна додати лише в авторизованому профілі після повторного підтвердження чинним TOTP або recovery-кодом. Вимкнення 2FA видаляє всі Passkeys користувача.
- Production `APP_ORIGIN` має бути стабільним HTTPS-origin. Зміна домену/RP ID робить раніше створені Passkeys непридатними для цього origin.

## Backend-модулі

Код організований за бізнес-доменами у `src/modules`: access, admin, applications, auth, backups, banners, catalog, chat, grids, integrations, notifications, product-tables, publications, store-map, tasks, trade-in та users.

Новий функціонал слід додавати всередині відповідного домену. Якщо зростає великий route/service, його варто ділити за ресурсами або сценаріями, зберігаючи публічний URL і формат відповіді.

## Компоненти інтерфейсу

- У внутрішньому React-інтерфейсі всі одновибірні випадаючі меню мають використовувати фірмовий `StyledSelect` із `client/src/components/StyledSelect.tsx`.
- Не додавайте сирий HTML `<select>` у новий функціонал адмін-панелі. Передавайте зрозумілий `ariaLabel`, типізовані `options` і використовуйте `compact` лише для щільних панелей інструментів.
- Якщо потрібної поведінки немає у `StyledSelect`, спочатку розширте спільний компонент зі збереженням доступності та клавіатурного керування, а не створюйте локальний аналог.
- Нові модальні вікна мають використовувати `ModalDialog` із `client/src/components/ModalDialog.tsx`. Компонент є джерелом істини для відступів, закриття, доступності та структури `header / body / footer`.
- Коренева `.modal` у структурованій модалці не скролиться: прокручуватися може лише `.modal__body`, а header і footer завжди залишаються видимими. Не додавайте локальний `overflow: auto` на модалку, від'ємні margin для footer або компенсаційні padding у формі.
- Footer самостійно забезпечує повні внутрішні відступи з усіх боків і safe-area на мобільних пристроях. Нову модалку потрібно перевірити щонайменше у desktop viewport та у вузькому viewport із малою висотою.

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
