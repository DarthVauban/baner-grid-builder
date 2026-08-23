# Standalone storefront domain

Статус: реалізовано для локального каталогу `used_smartphone_*`.

Публічна вітрина може працювати в корені окремого HTTPS-домену, тоді як workspace залишається на
основному домені.

## Налаштування

У storefront builder збережіть повний origin:

```text
https://used.example.com
```

Backend нормалізує origin і кешує збережене значення. Зміна починає діяти без редагування `.env` або
рестарту. `STOREFRONT_ORIGIN` є лише emergency fallback, коли database setting порожній або тимчасово
недоступний.

Host isolation middleware визначає standalone request за `Host`/forwarded host. На цьому hostname
дозволено тільки:

- `GET /` і legacy `GET /storefront`;
- `GET /smartphones/:slug` і legacy storefront product path;
- `GET|POST|OPTIONS /api/storefront/*`;
- `GET|POST|OPTIONS /api/public/application-forms/*`;
- `/media/catalog/*`, `/web-assets/*` і auto-height sandbox asset.

Workspace, admin і всі інші private API повертають `404`. Не додавайте новий endpoint до allowlist
лише через CORS: він має бути справді частиною публічної storefront surface.

## SEO і маршрути

Product page HTML читається із зібраного `storefront.html`, після чого Express інжектує canonical,
Open Graph і product metadata. Preview routes вимагають auth/tool access і отримують
`X-Robots-Tag: noindex, nofollow`.

Основні публічні маршрути:

- `/` — каталог;
- `/smartphones/:slug` — SEO product page;
- `/api/storefront/*` — products, settings, applications і live stream;
- `/api/public/application-forms/*` — підключена публічна форма;
- `/media/catalog/*`, `/web-assets/*` — медіа й compiled assets.

Legacy `/storefront/*` лишається доступним на workspace domain і перенаправляється на root-mounted
URL на standalone hostname.

## DNS, TLS і Nginx

1. Не змінюйте apex/`www` records, які належать іншому storefront.
2. Створіть окремий `A` record і направте його на сервер MT Workspace.
3. Видайте HTTPS certificate.
4. Скопіюйте `nginx/storefront.conf.example` в активну Nginx-конфігурацію та замініть hostname.
5. Встановіть `nginx/mt-storefront-proxy.conf.example` як proxy snippet.
6. Виконайте `nginx -t`, reload і перевірте, що private routes повертають `404`.

## Перевірка

```bash
curl -fsSI https://used.example.com/
curl -fsSI https://used.example.com/smartphones/<slug>
curl -fsS https://used.example.com/api/storefront/settings
curl -sS -o /dev/null -w '%{http_code}\n' https://used.example.com/admin/system
```

Остання команда має повернути `404`.
