# Інтеграція MT Workspace Mobile

Цей документ описує вебчастину підключення MT Workspace Mobile. Мобільний API-контракт збережено: вебпроєкт не потребує змін у Flutter-репозиторії.

## Можливості

- підключення першого або додаткового пристрою через одноразовий QR або 12-символьний Base32-код;
- 2FA за допомогою MT Workspace з TOTP і резервними кодами;
- підтвердження або відхилення парольного входу з мобільного пристрою;
- спільний стан read/unread для web- і mobile-сповіщень;
- transactional outbox і Firebase Cloud Messaging worker;
- відкликання окремого пристрою або всього мобільного доступу після вимкнення 2FA, зміни пароля, відхилення чи видалення користувача.

Звичайний Google Authenticator, recovery-code і Passkey flows залишаються доступними.

## Схема даних

Міграції `049_mobile_workspace.sql` і `050_mobile_login_passkey_link.sql` додають:

- метод 2FA у `users`;
- одноразові pairing requests і мобільні пристрої;
- login approval requests, прив'язані до підписаного browser challenge;
- push outbox і журнал подій мобільної безпеки;
- зв'язок login request з використаним Passkey challenge.

Міграції append-only і виконуються звичайним `npm run db:migrate`.

## Змінні середовища

```text
MOBILE_TOKEN_PEPPER=<окремий стабільний secret, щонайменше 32 символи>
MOBILE_PUSH_ENABLED=false
FIREBASE_PROJECT_ID=mt-workspace-4f42c
FIREBASE_SERVICE_ACCOUNT_BASE64=<base64 вмісту service-account JSON>
```

`MOBILE_TOKEN_PEPPER` використовується для HMAC і шифрування mobile credentials. Якщо значення не задано, застосунок використовує `JWT_SECRET`. Після production-запуску не змінюйте пепер без планового відкликання всіх пристроїв. Реальні secrets не зберігаються у Git.

Для створення Base64 на Windows PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\secure\firebase-service-account.json"))
```

Вставте результат лише у secret-сховище deployment. Після цього встановіть `MOBILE_PUSH_ENABLED=true`. За замовчуванням push вимкнено, тому локальні та тестові запуски не потребують Firebase credential.

## API

Вебендпоїнти профілю використовують чинну HttpOnly browser session:

- `POST /api/users/profile/mobile-pairings`;
- `GET /api/users/profile/mobile-pairings/:pairingId`;
- `POST /api/users/profile/mobile-pairings/:pairingId/acknowledge`;
- `DELETE /api/users/profile/mobile-pairings/:pairingId`;
- `GET /api/users/profile/mobile-devices`;
- `DELETE /api/users/profile/mobile-devices/:deviceId`.

Мобільні ендпоїнти, крім першого claim, вимагають `Authorization: Bearer <deviceAccessToken>`:

- `POST /api/mobile/pairings/claim`;
- `PUT /api/mobile/devices/:deviceId/push-token`;
- `GET /api/mobile/login-requests`;
- `POST /api/mobile/login-requests/:requestId/approve`;
- `POST /api/mobile/login-requests/:requestId/deny`;
- `GET /api/mobile/notifications`;
- `PATCH /api/mobile/notifications/:notificationId/read`;
- `POST /api/mobile/notifications/read-all`;
- `DELETE /api/mobile/devices/:deviceId`.

Браузерний login state machine залишає challenge token у body, а не в URL:

- `POST /api/auth/login` — створює pending mobile approval після правильного пароля;
- `POST /api/auth/login/mobile/status` — одноразово створює cookie лише для approved request і пов'язаного browser challenge;
- `POST /api/auth/login/mobile/cancel` — закриває pending request;
- `POST /api/auth/login/2fa` — TOTP/recovery fallback і закриття pending mobile request.

Stable API error codes не потрібно визначати за текстом помилки: мобільний клієнт має використовувати `error.code`.

## Push worker

`src/modules/mobile/mobile-push.worker.js` обробляє outbox малими batch через `FOR UPDATE SKIP LOCKED`, повторює transient Firebase errors з exponential backoff і очищає недійсний FCM token, не відкликаючи сам пристрій. Push містить лише сигнал і рядкові IDs; access tokens, TOTP secrets та browser challenge до payload не потрапляють.

При `registration-token-not-registered` або invalid registration token worker видаляє лише FCM credential. Помилка push не відкочує основну транзакцію web-сповіщення.

## Безпека та експлуатація

- production має працювати лише через HTTPS;
- pairing token, device access token, FCM token і secrets не логуються і не зберігаються у відкритому вигляді;
- manual pairing code має TTL 10 хвилин, повторний claim відхиляється;
- відкликаний пристрій більше не може використовувати mobile API;
- останній MT Workspace device не можна непомітно відкликати з web UI — спочатку треба додати інший або вимкнути 2FA;
- при відкликанні сервер може надіслати останній data-only `device_revoked`, після чого FCM credential очищається.

## Перевірка

```bash
# Усі unit/integration перевірки та production build
npm run verify

# Browser E2E, включно з pairing і mobile approval
npm run test:e2e
```

E2E використовує ізольовану `pg-mem` базу, симульований mobile claim/approval і не виконує зовнішніх Firebase-запитів.

## Production rollout

1. Задати стабільний `MOBILE_TOKEN_PEPPER` у secret-сховищі.
2. Виконати міграції і розгорнути web/backend з `MOBILE_PUSH_ENABLED=false`.
3. Перевірити QR, manual pairing, TOTP/recovery fallback і revoke на staging.
4. Додати Firebase Admin service account для `mt-workspace-4f42c`, встановити `MOBILE_PUSH_ENABLED=true` і перезапустити сервіс.
5. Перевірити на реальному пристрої: FCM token registration, login approve/deny, workspace push, read/unread і self-disconnect.

Для включення реального push власник проєкту має надати Firebase Admin service account через захищений канал і додати його до deployment secrets. Сам JSON у цьому репозиторі не зберігається.
