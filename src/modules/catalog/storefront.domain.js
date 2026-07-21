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

export function storefrontHostFromOrigin(origin) {
  const value = String(origin || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return normalizeHostname(url.hostname);
  } catch {
    return '';
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
