import { env } from '../../config/env.js';

// Validate this optional integration separately: misconfiguration closes Search,
// while ordinary Workspace authentication and tools can still start normally.
export function getSmartSearchSsoConfig() {
  const clientId = process.env.SMART_SEARCH_SSO_CLIENT_ID;
  const clientSecret = process.env.SMART_SEARCH_SSO_CLIENT_SECRET;
  const redirectUri = process.env.SMART_SEARCH_SSO_REDIRECT_URI;
  if (!/^[A-Za-z0-9_-]{3,100}$/.test(clientId || '')
    || !/^[A-Za-z0-9_-]{43,128}$/.test(clientSecret || '')
    || clientSecret === env.JWT_SECRET || typeof redirectUri !== 'string' || redirectUri.length > 1024) return null;
  try {
    const callback = new URL(redirectUri);
    const databasePassword = new URL(env.DATABASE_URL).password;
    if (clientSecret === decodeURIComponent(databasePassword)
      || callback.protocol !== 'https:' || callback.username || callback.password
      || callback.search || callback.hash || callback.pathname !== '/auth/workspace/callback'
      || callback.href !== redirectUri) return null;
    return { clientId, clientSecret, redirectUri, entryUrl: `${callback.origin}/auth/workspace/login` };
  } catch {
    return null;
  }
}
