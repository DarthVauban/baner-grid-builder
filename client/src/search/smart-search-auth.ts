const AUTHORIZE_PATH = '/api/integrations/smart-search/authorize';
const AUTHORIZE_PARAMETERS = new Set([
  'response_type', 'client_id', 'redirect_uri', 'scope', 'state', 'code_challenge_method', 'code_challenge'
]);

// This permits only a local provider round-trip. The provider independently checks
// the configured client and exact callback before it can redirect to Search.
export function getSmartSearchReturnPath(search: string): string | null {
  const returnValues = new URLSearchParams(search).getAll('returnTo');
  if (returnValues.length !== 1) return null;
  const path = returnValues[0];
  if (path.length > 4096 || !path.startsWith(`${AUTHORIZE_PATH}?`) || /[\\#\u0000-\u0020\u007f]/u.test(path)) return null;

  const url = new URL(path, 'https://workspace.invalid');
  if (url.pathname !== AUTHORIZE_PATH || url.origin !== 'https://workspace.invalid') return null;
  const params = url.searchParams;
  const names = [...params.keys()];
  if (names.length !== AUTHORIZE_PARAMETERS.size || names.some((name) => !AUTHORIZE_PARAMETERS.has(name))
      || [...AUTHORIZE_PARAMETERS].some((name) => params.getAll(name).length !== 1)) return null;
  if (params.get('response_type') !== 'code' || params.get('scope') !== 'smart-search:admin'
      || params.get('code_challenge_method') !== 'S256'
      || !/^[A-Za-z0-9_-]{3,100}$/u.test(params.get('client_id') || '')
      || !/^[A-Za-z0-9_-]{43}$/u.test(params.get('state') || '')
      || !/^[A-Za-z0-9_-]{43}$/u.test(params.get('code_challenge') || '')) return null;
  try {
    const callback = new URL(params.get('redirect_uri') || '');
    if (callback.protocol !== 'https:' || callback.username || callback.password || callback.hash) return null;
  } catch {
    return null;
  }
  return path;
}

export function resumeSmartSearchAuthorization(path: string): void {
  // React Router must not handle an API path: the browser must send the full
  // session cookie to the provider after the complete login has succeeded.
  window.location.replace(path);
}
