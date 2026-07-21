# Standalone storefront domain

The public used-smartphone storefront can be mounted at the root of a separate domain while the workspace remains on `mt-panel.sbs`.

## Application configuration

Set the complete HTTPS address in **Public origin** in the storefront builder:

```text
https://used.example.com
```

Saving the builder activates the hostname immediately. Editing `.env` or restarting the application is not required. `STOREFRONT_ORIGIN` remains an optional emergency fallback when the saved setting is empty or temporarily unavailable.

Requests with the saved hostname receive only the public storefront surface. Workspace pages and private APIs return `404` on that hostname.

## DNS and TLS

1. Keep the apex and `www` records used by Horoshop unchanged.
2. Create an `A` record for the selected subdomain and point it to this server.
3. Install an HTTPS certificate for the subdomain.
4. Copy `nginx/storefront.conf.example` into the active Nginx configuration and replace `used.example.com` with the real hostname.
5. Copy `nginx/mt-storefront-proxy.conf.example` to `/etc/nginx/snippets/mt-storefront-proxy.conf`, validate the configuration, and reload Nginx.

The public routes are:

- `/` — storefront catalog;
- `/smartphones/:slug` — product page;
- `/api/storefront/*` — public catalog and order API;
- `/api/public/application-forms/*` — connected public form;
- `/media/catalog/*` and `/web-assets/*` — product media and frontend assets.

The legacy `/storefront` URLs remain available on the workspace domain. On the standalone hostname they redirect to the root-mounted equivalents.
