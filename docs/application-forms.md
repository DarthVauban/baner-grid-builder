# Форми й заявки

Статус: реалізовано. Основна схема сформована міграціями `018`, `019`, `026`, `032` і `041`.

## Межі доступу

Домен розділено на два незалежні інструменти:

- `form_builder` — форми, банки, поля, options, кнопки та embed-скрипти;
- `applications` — список заявок, лічильники, detail, призначення менеджера, статуси й коментарі.

Admin має автоматичний доступ. Інші користувачі отримують права через `user_tool_access`; backend
перевіряє їх на кожному захищеному запиті.

## Модель форми

Форма має стабільні внутрішній `id` і публічний `publicId`, тип `simple` або `workflow`, статус
`draft`, `published`, `disabled` чи `archived`, settings/styles і набір полів. Підтримуються текстові,
числові, email/phone, select/radio/checkbox поля, system fields і options.

`workflow` зберігає кроки й переходи у тому самому домені, що й Trade-in form logic. Опублікована
форма не втрачає історичні snapshots у вже створених заявках після редагування builder-а.

Builder API під `/api/forms` підтримує CRUD банків, форм і кнопок, duplicate, publish, disable,
archive та генерацію button script. Усі inputs проходять Zod validation.

## Публічний потік

1. Оператор створює форму й активні довідники, а потім публікує її.
2. Button configuration генерує embed-скрипт із selector/position і product selectors.
3. Скрипт завантажує public loader лише після взаємодії користувача.
4. Loader читає опубліковану форму, показує UI, валідовує input і надсилає заявку.
5. Backend створює п’ятизначний номер, snapshot полів і безпечний product context.
6. Користувачі з потрібним доступом/notification settings отримують live update і сповіщення.

Публічні endpoints:

```text
GET  /api/public/application-forms/loader.js
GET  /api/public/application-forms/buttons/:id/embed.js
GET  /api/public/application-forms/:publicId
POST /api/public/application-forms/:publicId/applications
```

Submission endpoint має rate limiter. Generated button script не містить credentials і не отримує
доступу до захищеного API.

## Робота із заявками

Protected API під `/api/applications` надає:

- paginated feed, counts і form summaries;
- detail із values, product snapshot, history та comments;
- explicit claim/manager assignment;
- статуси `new`, `in_progress`, `rejected`, `closed`;
- контрольоване видалення з підтвердженням;
- proxy доступ до snapshot product image.

Зміни призначення, статусу й коментарів записуються транзакційно, оновлюють version/history та
публікують application, notification і chat entity events.

## Realtime і chat links

`GET /api/applications/stream` відкриває SSE. Подія містить `eventId`, `timestamp`, `type`,
`applicationId` і лише мінімальний стан; повні дані клієнт повторно читає з API через TanStack Query.

Внутрішнє посилання на заявку:

```text
/tools/applications?application=<application-id>
```

Chat entity resolution виконується сервером окремо для кожного viewer. Користувач без доступу до
`applications` отримує unavailable payload, а не дані заявки.

## Точки розширення

- Нове поле потребує узгоджених змін Zod schema, snapshots, client types, builder/public UI і tests.
- Новий статус змінює database constraints, serializers, counts, filters і всі status transitions.
- Нове notification rule не повинно обходити per-user application notification settings.
- Public payload не може містити внутрішні user IDs, credentials або необмежений raw product data.
