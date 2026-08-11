# Trade-in standalone domain

The public Trade-in page is served from `https://tradein.mobiletrend.com.ua` by the production application on `127.0.0.1:3100`.

## Prerequisites

- The DNS `A` record for `tradein.mobiletrend.com.ua` points to the production server.
- In the Trade-in builder, the public address is saved as `https://tradein.mobiletrend.com.ua`.
- TCP ports 80 and 443 are open on the production server.
- Nginx and Certbot are installed, and the operator can run commands through `sudo`.

## Initial certificate issuance

Run these commands from the repository checkout on the production server:

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

Certbot asks for a notification email and acceptance of the Let's Encrypt terms during the first run. Do not install the HTTPS configuration before the certificate exists because Nginx validates the referenced certificate files during `nginx -t`.

## Verification and renewal

```sh
curl -fsSI https://tradein.mobiletrend.com.ua/
curl -fsS https://tradein.mobiletrend.com.ua/api/public/trade-in/settings
sudo certbot renew --dry-run
systemctl status certbot.timer
```

The Nginx host exposes only the public Trade-in page, its public API, and compiled web assets. Other application routes return `404` on this subdomain.
