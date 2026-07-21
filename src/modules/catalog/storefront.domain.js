function normalizeHostname(value) {
  return String(value || '').trim().toLowerCase().replace(/\.$/, '');
}

const storefrontOriginCacheTtlMs = 15_000;
let cachedSavedOrigin = '';
let cachedSavedOriginExpiresAt = 0;
let hasCachedSavedOrigin = false;
let pendingSavedOrigin = null;
let savedOriginRevision = 0;

function hostnameFromHost(value) {
  const host = String(value || '').trim();
  if (!host) return '';
  try {
    return normalizeHostname(new URL(`http://${host}`).hostname);
  } catch {
    return '';
  }
}

export function storefrontHostFromOrigin(origin) {
  const value = normalizeStorefrontOrigin(origin);
  if (!value) return '';
  try {
    return normalizeHostname(new URL(value).hostname);
  } catch {
    return '';
  }
}

export function normalizeStorefrontOrigin(origin) {
  const value = String(origin || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.origin;
  } catch {
    return '';
  }
}

function storeSavedStorefrontOrigin(origin, now = Date.now()) {
  cachedSavedOrigin = normalizeStorefrontOrigin(origin);
  cachedSavedOriginExpiresAt = now + storefrontOriginCacheTtlMs;
  hasCachedSavedOrigin = true;
}

export function cacheSavedStorefrontOrigin(origin, now = Date.now()) {
  savedOriginRevision += 1;
  storeSavedStorefrontOrigin(origin, now);
}

export function invalidateSavedStorefrontOriginCache() {
  savedOriginRevision += 1;
  cachedSavedOriginExpiresAt = 0;
}

export async function resolveStandaloneStorefrontOrigin(loadSavedOrigin, fallbackOrigin = '', now = Date.now()) {
  const fallback = normalizeStorefrontOrigin(fallbackOrigin);
  if (hasCachedSavedOrigin && now < cachedSavedOriginExpiresAt) return cachedSavedOrigin || fallback;

  if (!pendingSavedOrigin) {
    const loadingRevision = savedOriginRevision;
    pendingSavedOrigin = Promise.resolve()
      .then(loadSavedOrigin)
      .then((origin) => {
        if (loadingRevision !== savedOriginRevision) return cachedSavedOrigin;
        storeSavedStorefrontOrigin(origin);
        return cachedSavedOrigin;
      })
      .finally(() => {
        pendingSavedOrigin = null;
      });
  }

  try {
    return (await pendingSavedOrigin) || fallback;
  } catch (error) {
    if (hasCachedSavedOrigin) return cachedSavedOrigin || fallback;
    if (fallback) return fallback;
    throw error;
  }
}

export function requestHost(req) {
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  return hostnameFromHost(forwardedHost || req.get('host'));
}

export function isStandaloneStorefrontRequest(req, storefrontOrigin) {
  const configuredHost = storefrontHostFromOrigin(storefrontOrigin);
  return Boolean(configuredHost && requestHost(req) === configuredHost);
}

export function isAllowedStandaloneStorefrontRequest(req) {
  const method = String(req.method || 'GET').toUpperCase();
  const path = String(req.path || '/');
  const readable = method === 'GET' || method === 'HEAD';

  if (readable && (path === '/' || path === '/storefront' || path.startsWith('/smartphones/') || path.startsWith('/storefront/smartphones/'))) {
    return true;
  }
  if (readable && (path === '/mt-auto-height-sandbox.js' || path.startsWith('/web-assets/') || path.startsWith('/media/catalog/'))) {
    return true;
  }
  if (['GET', 'POST', 'OPTIONS'].includes(method) && (path.startsWith('/api/storefront/') || path.startsWith('/api/public/application-forms/'))) {
    return true;
  }
  return false;
}

export function standaloneStorefrontProductPath(slug) {
  return `/smartphones/${encodeURIComponent(String(slug || ''))}`;
}

export function storefrontProductPathForRequest(req, product) {
  return req.isStandaloneStorefront
    ? standaloneStorefrontProductPath(product?.slug)
    : product?.publicPath || `/storefront/smartphones/${encodeURIComponent(String(product?.slug || ''))}`;
}
