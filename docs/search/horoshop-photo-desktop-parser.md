# Десктопний парсер фото Хорошоп

Статус: web queue, desktop pairing/device API, lease/heartbeat, staging uploads і publication
реалізовані міграціями `063`, `065–070`.

## Призначення

Web-інструмент `/tools/horoshop-photo-parser` формує точну selection товарів/модифікацій із
синхронізованого Horoshop catalog. Завдання може виконати server parser або paired desktop app.
Desktop app шукає source pages, запускає свої adapters і повертає вибрані images. Публікація в
Horoshop завжди лишається окремою web-дією.

## Черга й draft model

- Selection створюється зі списку title/SKU entries або поточних catalog filters.
- Product без modifications отримує `gallery_common` draft.
- Кожна active modification отримує окремий `images` draft.
- Один draft не може одночасно мати більше одного active `queued|running` run.
- Selection items і runs мають стабільний `sort_order`/`queue_position`.
- Batch зберігає provenance: source selection/run, creator, executor і timestamps.

Server worker відновлює interrupted server runs після restart. Desktop run має device lease,
heartbeat, progress і повертається в queue після expiry/revoke/release.

## Pairing

1. Авторизований користувач із `horoshop_photo_parser` створює pairing.
2. Web показує 12-символьний одноразовий code з TTL 10 хвилин.
3. Desktop app обмінює code на opaque 256-bit device token.
4. Backend зберігає лише HMAC token; повторний claim неможливий.
5. Device бачить тільки jobs користувача, який його підключив.

Web management API:

```text
GET    /api/search/horoshop/photos/desktop/devices
POST   /api/search/horoshop/photos/desktop/pairings
GET    /api/search/horoshop/photos/desktop/pairings/:id
DELETE /api/search/horoshop/photos/desktop/devices/:id
```

## Device API

Перший claim не має device token:

```text
POST /api/desktop/photo-parser/pairings/claim
```

Після claim усі requests використовують `Authorization: Bearer <device-token>`:

```text
GET    /api/desktop/photo-parser/session
DELETE /api/desktop/photo-parser/session
GET    /api/desktop/photo-parser/jobs
POST   /api/desktop/photo-parser/jobs/:id/claim
POST   /api/desktop/photo-parser/jobs/:id/heartbeat
PUT    /api/desktop/photo-parser/jobs/:id/source
POST   /api/desktop/photo-parser/jobs/:id/assets
POST   /api/desktop/photo-parser/jobs/:id/complete
POST   /api/desktop/photo-parser/jobs/:id/fail
POST   /api/desktop/photo-parser/jobs/:id/release
```

Asset upload приймає raw `image/*` до 8 MB. На run дозволено до 40 unique images; server перевіряє
source URL, SHA-256, MIME/dimensions і sort order.

## Завершення run

Desktop app:

1. claim-ить job і продовжує lease heartbeat-ами;
2. зберігає validated HTTPS source URL;
3. upload-ить staging assets;
4. `complete` передає source metadata й атомарно замінює local draft assets;
5. `fail` фіксує sanitized error та очищає staging uploads;
6. `release` повертає job у queue без success.

Expired lease, revoked device або app crash не повинні залишати draft у вічному `running`.

## Web publication

```text
POST /api/search/horoshop/photos/drafts/:id/publish
POST /api/search/horoshop/photos/selections/:id/publish/stream
```

Mode — `append` або `replace`. Bulk endpoint повертає NDJSON progress. Publication повторно перевіряє
active connection/generation і серіалізується з іншими Horoshop external writes.

## Security

- source pages і image URLs мусять використовувати HTTPS;
- device token, pairing code і Horoshop credentials не логуються;
- кожен request повторно перевіряє device revoke, user approval, tool access і 2FA requirement;
- desktop token має бути доступний тільки Electron main process;
- на Windows token зберігається через Electron `safeStorage`/DPAPI;
- browser renderer не отримує token або Horoshop credentials;
- device не може claim-ити job іншого user.

## Cleanup

- revoke device повертає його active jobs у queue;
- failed/expired staging uploads видаляються;
- delete selection каскадно прибирає selection-based queue;
- disconnect Horoshop видаляє selections, drafts, runs, pairings і connection-owned media;
- generated/runtime media не додаються в Git.

## Перевірка

Contract tests містяться у `tests/horoshop-photo-parser.test.js` і
`tests/horoshop-routes.integration.test.js`; web interactions — у
`client/src/pages/HoroshopPhotoParserPage.test.tsx`.
