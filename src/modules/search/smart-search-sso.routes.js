import express, { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth.js';
import { getSmartSearchSsoConfig } from './smart-search-sso.config.js';
import { getParentSession } from './smart-search-sso.session.js';
import {
  issueAuthorizationCode, exchangeAuthorizationCode, introspectAccessToken, revokeAccessToken
} from './smart-search-sso.service.js';

const router = Router();
const authorizePath = '/api/integrations/smart-search/authorize';
const urlSafe43 = /^[A-Za-z0-9_-]{43}$/;
const authorizeKeys = ['response_type', 'client_id', 'redirect_uri', 'scope', 'state', 'code_challenge_method', 'code_challenge'];

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});

function limiter(limit) {
  return rateLimit({
    windowMs: 60_000, limit, standardHeaders: true, legacyHeaders: false,
    message: { error: 'temporarily_unavailable' }
  });
}

function parseParameters(raw, keys) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 4096) return null;
  try { decodeURIComponent(raw.replace(/\+/g, ' ')); } catch { return null; }
  const params = new URLSearchParams(raw);
  if ([...params].length !== keys.length || keys.some((key) => params.getAll(key).length !== 1)
    || [...params.keys()].some((key) => !keys.includes(key))) return null;
  return Object.fromEntries(params);
}

router.get('/entry', requireAuth, (_req, res) => {
  const config = getSmartSearchSsoConfig();
  res.json({ data: { url: config?.entryUrl || null } });
});

router.get('/authorize', limiter(120), (req, res, next) => {
  const config = getSmartSearchSsoConfig();
  if (!config) return res.status(503).json({ error: 'temporarily_unavailable' });
  const rawQuery = req.originalUrl.split('?').slice(1).join('?');
  const input = parseParameters(rawQuery, authorizeKeys);
  if (!input || input.client_id !== config.clientId || input.redirect_uri !== config.redirectUri
    || input.response_type !== 'code' || input.scope !== 'smart-search:admin'
    || input.code_challenge_method !== 'S256' || !urlSafe43.test(input.state)
    || !urlSafe43.test(input.code_challenge)) return res.status(400).json({ error: 'invalid_request' });
  req.smartSearchAuthorize = { config, input };
  const parent = getParentSession(req);
  if (!parent) {
    // Reconstruct from validated fields, never from Host, a caller return URL or a path.
    const returnTo = `${authorizePath}?${new URLSearchParams(input)}`;
    return res.redirect(302, `/login?${new URLSearchParams({ returnTo })}`);
  }
  req.smartSearchParent = parent;
  next();
}, requireAuth, async (req, res, next) => {
  try {
    const { config, input } = req.smartSearchAuthorize;
    const code = await issueAuthorizationCode({
      clientId: config.clientId, redirectUri: config.redirectUri,
      codeChallenge: input.code_challenge, parent: req.smartSearchParent
    });
    const callback = new URL(config.redirectUri);
    callback.searchParams.set(code ? 'code' : 'error', code || 'access_denied');
    callback.searchParams.set('state', input.state);
    res.redirect(302, callback.href);
  } catch (error) { next(error); }
});

function authenticateClient(req, res, next) {
  const config = getSmartSearchSsoConfig();
  if (!config) return res.status(503).json({ error: 'temporarily_unavailable' });
  const authorization = req.get('authorization') || '';
  // Canonical, bounded Basic prevents permissive base64 decoding and duplicate credentials.
  const match = /^Basic ([A-Za-z0-9+/]{4,400}={0,2})$/.exec(authorization);
  let credentials = '';
  if (match) {
    const decoded = Buffer.from(match[1], 'base64');
    if (decoded.toString('base64') === match[1]) credentials = decoded.toString('utf8');
  }
  const expected = `${config.clientId}:${config.clientSecret}`;
  const digest = (value) => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(digest(credentials), digest(expected))) {
    res.set('WWW-Authenticate', 'Basic realm="smart-search"');
    return res.status(401).json({ error: 'invalid_client' });
  }
  req.smartSearchClient = config;
  next();
}

function form(keys, error = 'invalid_request') {
  return [
    (req, res, next) => {
      if (!req.is('application/x-www-form-urlencoded') || req.originalUrl.includes('?')) {
        return res.status(400).json({ error });
      }
      next();
    },
    express.text({ type: 'application/x-www-form-urlencoded', limit: '4kb', inflate: false }),
    (req, res, next) => {
      const input = parseParameters(req.body, keys);
      if (!input) return res.status(400).json({ error });
      req.smartSearchForm = input;
      next();
    }
  ];
}

router.post('/token', limiter(120), authenticateClient,
  ...form(['grant_type', 'code', 'redirect_uri', 'code_verifier'], 'invalid_grant'), async (req, res, next) => {
    const input = req.smartSearchForm;
    const config = req.smartSearchClient;
    if (input.grant_type !== 'authorization_code' || !urlSafe43.test(input.code)
      || input.redirect_uri !== config.redirectUri || !/^[A-Za-z0-9._~-]{43,128}$/.test(input.code_verifier)) {
      return res.status(400).json({ error: 'invalid_grant' });
    }
    try {
      const result = await exchangeAuthorizationCode({
        clientId: config.clientId, redirectUri: config.redirectUri, code: input.code, codeVerifier: input.code_verifier
      });
      if (!result) return res.status(400).json({ error: 'invalid_grant' });
      res.json(result);
    } catch (error) { next(error); }
  });

const tokenForm = ['token', 'token_type_hint'];
router.post('/introspect', limiter(1200), authenticateClient, ...form(tokenForm), async (req, res, next) => {
  const input = req.smartSearchForm;
  if (input.token_type_hint !== 'access_token') return res.status(400).json({ error: 'invalid_request' });
  if (!urlSafe43.test(input.token)) return res.json({ active: false });
  try {
    res.json(await introspectAccessToken({ clientId: req.smartSearchClient.clientId, token: input.token }));
  } catch (error) { next(error); }
});

router.post('/revoke', limiter(120), authenticateClient, ...form(tokenForm), async (req, res, next) => {
  const input = req.smartSearchForm;
  if (input.token_type_hint !== 'access_token') return res.status(400).json({ error: 'invalid_request' });
  try {
    if (urlSafe43.test(input.token)) await revokeAccessToken({ clientId: req.smartSearchClient.clientId, token: input.token });
    res.status(200).end();
  } catch (error) { next(error); }
});

router.use((_req, res) => res.status(404).json({ error: 'invalid_request' }));
// DB errors may contain SQL parameters: never forward/log the original error here.
router.use((error, _req, res, _next) => {
  if (error?.status === 413 || error?.type === 'entity.too.large') return res.status(413).json({ error: 'invalid_request' });
  if (error?.status === 415 || error?.status === 400) return res.status(400).json({ error: 'invalid_request' });
  if (error?.status === 401 || error?.status === 403) return res.status(error.status).json({ error: 'access_denied' });
  console.error(JSON.stringify({ event: 'smart_search_sso_unavailable' }));
  return res.status(503).json({ error: 'temporarily_unavailable' });
});

export default router;
