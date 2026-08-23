# Telegram backups

Статус: ручні/планові backup, Telegram delivery і transactional restore реалізовані. Керування
доступне admin-користувачу на `/admin/integrations` і `/admin/backups`.

## Telegram integration

1. Створіть bot через `@BotFather`.
2. Для personal chat натисніть **Start** і використовуйте ID користувача, не bot ID.
3. Для group додайте bot і використовуйте numeric chat ID.
4. Для channel додайте bot як admin із правом публікації та використовуйте `@username` або ID.
5. Збережіть token і target у **Адміністрування → Інтеграції**.

Сервер перевіряє token, відхиляє власний bot ID і виконує безпечну перевірку надсилання документа до
збереження encrypted token.

Telegram Bot API приймає documents до 50 MB. MT Workspace залишає safety margin і не намагається
надсилати частковий archive. Restore endpoint приймає compressed upload до 55 MB; розпакований архів
додатково обмежений 256 MB, а вихідний database/media snapshot — 128 MB.

## Формат архіву

Ім’я містить environment marker і timestamp:

```text
mt-workspace-backup_<environment>_<date>.tar.gz
```

Архів містить:

- `manifest.json` — format/version, `APP_ENVIRONMENT`, hostname, build SHA, schema migration,
  checksums і HMAC signature;
- `database.json` — application tables без `schema_migrations`;
- `media/` — файли локального catalog media volume.

Environment також входить у Telegram caption. Не визначайте DEV/PROD за `NODE_ENV`: deployment
передає `APP_ENVIRONMENT=development|production`.

Signing key і integration encryption key походять від `JWT_SECRET`. Після його зміни попередні
архіви навмисно не проходять перевірку. Зберігайте secret стабільним і поза Git.

## Розклад і API

Підтримуються daily/weekly schedule, local `HH:mm`, weekday й IANA timezone. Worker перевіряє due
schedule раз на хвилину та записує success/failure у `backup_runs`.

```text
GET  /api/admin/backups
PUT  /api/admin/backups/settings
POST /api/admin/backups/run
POST /api/admin/backups/restore
```

Одночасно може виконуватись лише одна backup/restore operation в app process.

## Restore

Restore доступний лише admin і приймає оригінальний `.tar.gz`:

1. перевіряє format/version, HMAC, database checksum і кожен media checksum;
2. переходить у maintenance mode;
3. готує media у staging directory і створює rollback copy;
4. замінює database snapshot в одній PostgreSQL transaction;
5. активує staged media;
6. записує результат у `backup_runs` і виходить із maintenance mode.

Якщо валідація або database transaction не завершилась, попередні media відновлюються. Runtime
staging directories не є користувацькими backup-копіями й не повинні додаватися в Git.

## Перевірка

Після конфігурації:

1. запустіть manual backup і перевірте caption/environment/file name;
2. завантажте archive з Telegram без перепакування;
3. на staging виконайте restore та звірте користувачів, settings і media;
4. перевірте daily/weekly `nextRunAt` у потрібній timezone;
5. переконайтеся, що reverse proxy дозволяє `/api/admin/backups/restore` до 55 MB.
