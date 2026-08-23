# Trade-in standalone domain

Статус: builder, preview, public API й standalone host isolation реалізовані.

Production Trade-in сторінка розрахована на `https://tradein.mobiletrend.com.ua`. Конкретний
loopback port визначає deployment/Nginx-конфігурація; публічний контракт не залежить від нього.

## Application flow

- Інструмент `trade_in` має overview і editor у `/trade-in/*`.
- Draft config редагується окремо від published config.
- Public origin зберігається в PostgreSQL і кешується backend-ом.
- Preview routes вимагають auth та `trade_in` access і забороняють індексацію.
- `GET /api/public/trade-in/settings` повертає лише published public config.
- `POST /api/public/trade-in/applications` валідовує відповіді й створює заявку через спільний
  applications domain.

Standalone hostname допускає тільки `/`, `/trade-in`, compiled assets, favicon і
`/api/public/trade-in/*`. Workspace/private API повертають `404`.

## Налаштування

1. DNS `A` record для `tradein.mobiletrend.com.ua` має вказувати на production server.
2. У Trade-in builder збережіть `https://tradein.mobiletrend.com.ua` як public origin.
3. TCP 80/443 мають бути доступні для Nginx/ACME.
4. Встановіть Nginx і Certbot.

## Перше отримання certificate

```sh
sudo install -d -m 755 /var/www/certbot
sudo install -m 644 nginx/tradein.mobiletrend-bootstrap.conf /etc/nginx/conf.d/tradein.mobiletrend.com.ua.conf
sudo nginx -t
sudo systemctl reload nginx

sudo certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --domain tradein.mobiletrend.com.ua

sudo install -m 644 nginx/tradein.mobiletrend-host.conf /etc/nginx/conf.d/tradein.mobiletrend.com.ua.conf
sudo nginx -t
sudo systemctl reload nginx
```

Не встановлюйте HTTPS host config до появи certificate files: `nginx -t` перевіряє їх існування.

## Перевірка й renewal

```sh
curl -fsSI https://tradein.mobiletrend.com.ua/
curl -fsS https://tradein.mobiletrend.com.ua/api/public/trade-in/settings
curl -sS -o /dev/null -w '%{http_code}\n' https://tradein.mobiletrend.com.ua/admin/system
sudo certbot renew --dry-run
systemctl status certbot.timer
```

Private route має повернути `404`. Після зміни public origin перевірте і root page, і submission на
staging до production publication.
