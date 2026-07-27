function normalizeHostname(value) {
  return String(value || '').trim().toLowerCase().replace(/\.$/, '');
}

function hostnameFromHost(value) {
  const host = String(value || '').trim();
  if (!host) return '';
  try {
    return normalizeHostname(new URL(`http://${host}`).hostname);
  } catch {
    return '';
  }
}

const cacheTtlMs = 15_000;
let cachedOrigin = '';
let cacheExpiresAt = 0;
let hasCachedOrigin = false;
let pendingOrigin = null;
let revision = 0;

export function normalizeTradeInOrigin(origin) {
  const value = String(origin || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : '';
  } catch {
    return '';
  }
}

export function tradeInHostFromOrigin(origin) {
  const value = normalizeTradeInOrigin(origin);
  if (!value) return '';
  try {
    return normalizeHostname(new URL(value).hostname);
  } catch {
    return '';
  }
}

function storeOrigin(origin, now = Date.now()) {
  cachedOrigin = normalizeTradeInOrigin(origin);
  cacheExpiresAt = now + cacheTtlMs;
  hasCachedOrigin = true;
}

export function cacheSavedTradeInOrigin(origin, now = Date.now()) {
  revision += 1;
  storeOrigin(origin, now);
}

export function invalidateSavedTradeInOriginCache() {
  revision += 1;
  cacheExpiresAt = 0;
}

export async function resolveStandaloneTradeInOrigin(loadSavedOrigin, fallbackOrigin = '', now = Date.now()) {
  const fallback = normalizeTradeInOrigin(fallbackOrigin);
  if (hasCachedOrigin && now < cacheExpiresAt) return cachedOrigin || fallback;
  if (!pendingOrigin) {
    const loadingRevision = revision;
    pendingOrigin = Promise.resolve()
      .then(loadSavedOrigin)
      .then((origin) => {
        if (loadingRevision !== revision) return cachedOrigin;
        storeOrigin(origin);
        return cachedOrigin;
      })
      .finally(() => {
        pendingOrigin = null;
      });
  }
  try {
    return (await pendingOrigin) || fallback;
  } catch (error) {
    if (hasCachedOrigin) return cachedOrigin || fallback;
    if (fallback) return fallback;
    throw error;
  }
}

export function isStandaloneTradeInRequest(req, origin) {
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const requestHost = hostnameFromHost(forwardedHost || req.get('host'));
  return Boolean(tradeInHostFromOrigin(origin) && requestHost === tradeInHostFromOrigin(origin));
}

export function isAllowedStandaloneTradeInRequest(req) {
  const method = String(req.method || 'GET').toUpperCase();
  const path = String(req.path || '/');
  const readable = method === 'GET' || method === 'HEAD';
  if (readable && (path === '/' || path === '/trade-in')) return true;
  if (readable && (path.startsWith('/web-assets/') || path === '/favicon.ico')) return true;
  return ['GET', 'POST', 'OPTIONS'].includes(method) && path.startsWith('/api/public/trade-in');
}
