# Інтеграція MT Workspace Mobile

Статус: веб/backend-контур реалізовано міграціями `049`, `050` і `055`. Реальний push залежить від
окремо ввімкненого Firebase Admin credential.

## Можливості

- pairing першого або додаткового пристрою через QR чи 12-символьний Base32-код;
- TOTP/recovery fallback і Passkey login;
- підтвердження або відхилення password login з уже підключеного пристрою;
- browser QR login без попереднього введення email/пароля;
- multi-account pairing одного installation, коли feature flag увімкнено;
- спільний read/unread стан web/mobile notifications;
- transactional push outbox, Firebase worker і відкликання пристроїв.

## Два QR-сценарії

### Pairing пристрою

Авторизований користувач створює одноразовий pairing у профілі. Мобільний застосунок обмінює manual
token на device access token. Pairing діє 10 хвилин, зберігається тільки як HMAC і приймається один раз.

### Browser QR login

Неавторизований браузер створює challenge через `/api/auth/login/qr`. QR містить deployment identity,
challenge ID і одноразовий scan token, але не JWT/cookie. Мобільний пристрій:

1. читає preview через device-authenticated API;
2. показує browser/OS/location і target deployment;
3. підписує approve/deny своїм зареєстрованим ES256 auth key;
4. сервер перевіряє signature, device/user state, nonce й expiry;
5. браузер одноразово consume-ить approved challenge і лише тоді отримує session cookie.

Browser token передається в JSON body, не в URL. Challenge має стани `pending`, `approved`, `denied`,
`expired`, `consumed`, `cancelled` і типовий TTL 120 секунд.

## Дані й безпека

PostgreSQL зберігає pairing requests, devices, login approvals, QR challenges, push outbox і security
events. Device access tokens, installation IDs і manual codes зберігаються як hashes; FCM token —
зашифрованим разом із hash для пошуку/інвалідації; device auth public key — як JWK. Secrets і access
tokens не потрапляють у logs або push payload.

Відкликання окремого пристрою або mobile access виконується після вимкнення 2FA, зміни password,
відхилення/видалення користувача або явної дії в профілі. Кожен mobile request повторно перевіряє
device, user і deployment state.

## Environment variables

```text
MOBILE_TOKEN_PEPPER=<stable secret, мінімум 32 символи>
MOBILE_PUSH_ENABLED=false
MOBILE_DEPLOYMENT_ID=mt-workspace-development
MOBILE_ENVIRONMENT=development
MOBILE_DEPLOYMENT_NAME=MT Workspace DEV
MOBILE_PUBLIC_ORIGIN=http://localhost:3000
MOBILE_API_BASE_URL=http://localhost:3000/api
MOBILE_QR_LOGIN_ENABLED=false
MOBILE_MULTI_ACCOUNT_PAIRING_ENABLED=false
MOBILE_QR_LOGIN_TTL_SECONDS=120
MOBILE_QR_CREATE_RATE_LIMIT=20
MOBILE_QR_STATUS_RATE_LIMIT=180
MOBILE_QR_PREVIEW_RATE_LIMIT=30
MOBILE_QR_DECISION_RATE_LIMIT=30
FIREBASE_PROJECT_ID=mt-workspace-4f42c
FIREBASE_SERVICE_ACCOUNT_BASE64=<base64 service-account JSON>
```

`MOBILE_TOKEN_PEPPER` fallback-ить на `JWT_SECRET`, але production має використовувати окремий
стабільний secret. Його зміна вимагає планового відкликання пристроїв. `MOBILE_ENVIRONMENT` має
збігатися з `APP_ENVIRONMENT` поза test; зовнішні origins мусять використовувати HTTPS.

Для створення Base64 на Windows PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\secure\firebase-service-account.json"))
```

Значення зберігається лише в deployment secrets. `MOBILE_PUSH_ENABLED=false` дозволяє запуск без
Firebase.

## API

Web profile API з HttpOnly session:

```text
POST   /api/users/profile/mobile-pairings
GET    /api/users/profile/mobile-pairings/:pairingId
POST   /api/users/profile/mobile-pairings/:pairingId/acknowledge
DELETE /api/users/profile/mobile-pairings/:pairingId
GET    /api/users/profile/mobile-devices
DELETE /api/users/profile/mobile-devices/:deviceId
```

Mobile API; після першого claim потрібен `Authorization: Bearer <deviceAccessToken>`:

```text
POST   /api/mobile/pairings/claim
PUT    /api/mobile/devices/:deviceId/push-token
PUT    /api/mobile/devices/:deviceId/auth-key
GET    /api/mobile/login-requests
POST   /api/mobile/login-requests/:requestId/approve
POST   /api/mobile/login-requests/:requestId/deny
GET    /api/mobile/notifications
PATCH  /api/mobile/notifications/:notificationId/read
POST   /api/mobile/notifications/read-all
DELETE /api/mobile/devices/:deviceId
POST   /api/mobile/qr-login/preview
POST   /api/mobile/qr-login/approve
POST   /api/mobile/qr-login/deny
```

Browser auth API:

```text
GET  /api/auth/login/qr/config
POST /api/auth/login/qr
POST /api/auth/login/qr/status
POST /api/auth/login/qr/consume
POST /api/auth/login/qr/cancel
POST /api/auth/login/mobile/status
POST /api/auth/login/mobile/cancel
```

Клієнти мають використовувати stable `error.code`, а не визначати помилку за текстом.

## Push worker

`mobile-push.worker.js` читає outbox batch-ами через `FOR UPDATE SKIP LOCKED`, ставить processing
lease, повторює transient Firebase errors з exponential backoff і очищає невалідний FCM token без
відкликання пристрою. Основна транзакція notification не залежить від успішності push.

## Перевірка й rollout

```bash
npm run test:server
npm run test:web
npm run test:e2e
```

Automated tests використовують `pg-mem`, fake device signatures/claims і не викликають Firebase.

Рекомендований rollout:

1. задати deployment identity, public HTTPS origin і стабільний pepper;
2. розгорнути з `MOBILE_PUSH_ENABLED=false` та QR flags вимкненими;
3. перевірити pairing, revoke, TOTP/recovery/Passkey fallback і mobile approval;
4. додати Firebase credential і перевірити push на staging;
5. окремо ввімкнути `MOBILE_QR_LOGIN_ENABLED`, потім за потреби multi-account pairing;
6. перевірити QR approve/deny/expiry/consume на реальних iOS/Android пристроях.
