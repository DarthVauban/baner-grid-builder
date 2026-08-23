# Супутні товари Хорошоп — чинні вимоги

Статус: основний workflow реалізовано міграціями `051–058`. Цей документ описує поточний безпечний
контракт; він замінює ранній draft із рекомендаційним алгоритмом та автоматичною публікацією.

## Мета й межі

Інструмент `/tools/horoshop-related-products` дозволяє:

- переглядати окремо синхронізований каталог Хорошоп із деревом модифікацій;
- вручну формувати чернетки аксесуарів із товарів і кінцевих розділів;
- імпортувати змістовні Codex-пропозиції для кожного активного parent product;
- явно приймати пропозиції в чернетку;
- окремою дією публікувати підтверджену чернетку в Хорошоп.

Це не runtime search і не частина локального `used_smartphone_*` каталогу.

## Непорушні правила

- Застосунок не містить і не виконує recommendation algorithm, scorer або fixed weights.
- Runtime не викликає Codex/LLM.
- Codex працює лише на явний запит користувача як admin-time reviewer.
- Codex-authored scores описують судження reviewer-а і не обчислюються application code.
- Import review створює тільки локальні proposals і ніколи не публікує їх у Хорошоп.
- Прийняття proposal у draft і публікація draft — різні явні дії.
- Публікація всього каталогу дозволена лише після окремого прямого запиту користувача.
- Horoshop лишається commercial source of truth; PostgreSQL зберігає synchronized mirror і local
  review/draft/publication state.

## Каталог і connection lifecycle

Адміністратор підключає один магазин через `/admin/integrations`. Backend автентифікується login і
password, шифрує credentials AES-256-GCM і не повертає їх або transient API token у браузер.

Кожне connection має immutable `connectionId` і `generation`. Categories, products, modifications,
sync runs, accessories, proposals, publications і photo data scoped до цієї identity.

Store domain не редагується в активному connection. Для іншого магазину потрібен explicit
disconnect із підтвердженням домену:

1. connection переходить у `disconnecting`;
2. нові sync/external writes блокуються;
3. backend чекає активну критичну секцію;
4. connection і всі дочірні PostgreSQL rows видаляються каскадно;
5. виконується zero-count verification;
6. мінімальний audit зберігає actor, HMAC fingerprint і counts без credentials/catalog payload.

Помилка очищення залишає `purge_failed` і не дозволяє підключити інший магазин.

## Чернетка аксесуарів

Для кожного parent product існує accessory set. Draft items мають два типи:

- `product` — інший активний parent product;
- `category` — активний leaf category, яка не збігається з category target product.

Дублікати й self-reference заборонені. Максимум — 16 individual products і 16 categories на product
card. Manual search повертає тільки targets з активного connection.

Horoshop `catalog/import` трактує `products[].accessories` як повну заміну. Тому publish завжди
вимагає `{ "confirmOverwrite": true }`, формує повний intended array і не маскує partial failure.

## Codex review workflow

### Export

Codex отримує `GET /api/search/horoshop/accessories/review/catalog` через authenticated in-app
browser. Якщо session недоступна, використовується JSON export із UI **Супутні товари Хорошоп**.

Export має формат `horoshop-codex-accessory-review/v1` і включає:

- незмінні `connectionGeneration` і `catalogRevision`;
- store domain і export timestamp;
- кожен активний parent product;
- titles, descriptions, category, characteristics, price, availability, popularity і modification
  tree.

Credentials, tokens і raw private responses не експортуються.

### Review document

Codex повертає `horoshop-codex-accessory-review/v1`:

- `connectionGeneration` і `catalogRevision` без змін;
- кожен активний parent product рівно один раз;
- `{ "recommendations": [] }`, якщо немає достатньо сумісного й корисного target;
- не більше 16 рекомендацій на product;
- лише інші active parent product IDs;
- короткий product-specific reason;
- scores у діапазоні `0..1` з ключами `compatibility`, `utility`, `availability`, `popularity`,
  `total`. `utility` описує корисність, а `total` — загальну впевненість Codex.

Codex аналізує зміст семантично. Не потрібно заповнювати список заради coverage; coverage означає
наявність parent record, а не обов’язкову рекомендацію.

### Server validation

`POST /api/search/horoshop/accessories/review/proposals` перевіряє:

- schema/version;
- точну generation і revision;
- повне й недубльоване покриття активних parent products;
- існування target IDs, відсутність self-reference і duplicates;
- score ranges і limits.

Сервер не перевіряє семантичну сумісність і не перераховує scores. Якщо catalog змінився, відповідь
`HOROSHOP_CODEX_REVIEW_STALE` вимагає нового export/review.

### Acceptance і publication

Imported proposals зберігаються як unselected. Користувач може:

- прийняти proposals одного product у draft;
- прийняти всі актуальні proposals у drafts;
- відредагувати draft вручну;
- перевірити pending publication summary;
- опублікувати один product або всі pending drafts окремою дією.

Bulk publication передає NDJSON progress і виконується пакетами. Вона не повинна запускатися лише
тому, що review було імпортовано або прийнято.

## Реалізований API

Catalog:

```text
GET  /api/search/horoshop/catalog
POST /api/search/horoshop/sync
```

Review і bulk operations:

```text
GET  /api/search/horoshop/accessories/review/catalog
POST /api/search/horoshop/accessories/review/proposals
POST /api/search/horoshop/accessories/review/proposals/accept-all
GET  /api/search/horoshop/accessories/publications/pending
POST /api/search/horoshop/accessories/publications/publish-all
POST /api/search/horoshop/accessories/publications/publish-all/stream
```

Product operations:

```text
GET  /api/search/horoshop/accessories/products/:productId
GET  /api/search/horoshop/accessories/products/:productId/candidates
PUT  /api/search/horoshop/accessories/products/:productId/draft
POST /api/search/horoshop/accessories/products/:productId/review/proposals/accept
POST /api/search/horoshop/accessories/products/:productId/publish
```

Усі endpoints вимагають auth і `horoshop_related_products`; connection administration доступне лише
ролі `admin`.

## Audit і failure behavior

- Sync/accessory/publication data видаляються з connection, але мінімальний disconnect audit
  зберігається без каталожних payload.
- Publication attempts мають started/succeeded/failed state, actor і error.
- External writes серіалізуються з catalog sync/іншими writes.
- Failure у batch не позначає необроблені products успішними.
- Повторний publish використовує поточний draft і створює нову спробу, не переписуючи історію.

## Не реалізовано й не слід припускати

- автоматичні рекомендації після sync;
- deterministic candidate scorer або recommendation weights;
- background Codex calls;
- автоматична публікація під час review import;
- category recommendations від Codex (categories додаються вручну);
- order-basket, margin, attach-rate або conversion optimization;
- runtime OpenSearch recommendations.

## Зовнішні джерела

- [Офіційна сторінка інтеграцій та API Хорошоп](https://horoshop.ua/ua/integration/)
- [Центр допомоги Хорошоп](https://help.horoshop.ua/uk/)
- [Офіційний метод `catalog/import`](https://horoshop.notion.site/1b6cc2897079812b9127de30b8fd106c)

Поведінку API, яка може змінитися, перед зміною write contract потрібно повторно перевіряти
небезпечними не є лише read-only probes; тестові write calls потребують окремого дозволу й staging.
