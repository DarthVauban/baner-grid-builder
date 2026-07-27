import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cacheSavedTradeInOrigin,
  invalidateSavedTradeInOriginCache,
  isAllowedStandaloneTradeInRequest,
  isStandaloneTradeInRequest,
  normalizeTradeInOrigin,
  resolveStandaloneTradeInOrigin,
  tradeInHostFromOrigin
} from '../src/modules/trade-in/trade-in.domain.js';
import {
  defaultTradeInConfig,
  matchesTradeInCondition,
  normalizeTradeInConfig
} from '../src/modules/trade-in/trade-in.defaults.js';

function fakeRequest({ host = 'mt-panel.sbs', forwardedHost = '', method = 'GET', path = '/' } = {}) {
  return {
    method,
    path,
    get(name) {
      if (name === 'x-forwarded-host') return forwardedHost;
      if (name === 'host') return host;
      return '';
    }
  };
}

test('recognizes and normalizes the configured Trade-in hostname', () => {
  assert.equal(normalizeTradeInOrigin('https://TradeIn.Example.com/form/'), 'https://tradein.example.com');
  assert.equal(normalizeTradeInOrigin('javascript:alert(1)'), '');
  assert.equal(tradeInHostFromOrigin('https://tradein.example.com/form'), 'tradein.example.com');
  assert.equal(isStandaloneTradeInRequest(fakeRequest({ host: 'tradein.example.com:443' }), 'https://tradein.example.com'), true);
  assert.equal(isStandaloneTradeInRequest(fakeRequest({ forwardedHost: 'tradein.example.com, proxy.internal' }), 'https://tradein.example.com'), true);
  assert.equal(isStandaloneTradeInRequest(fakeRequest(), 'https://tradein.example.com'), false);
});

test('caches the saved Trade-in origin and supports an environment fallback', async () => {
  let loadCount = 0;
  invalidateSavedTradeInOriginCache();
  const loadOrigin = async () => {
    loadCount += 1;
    return 'https://saved-tradein.example.com/page';
  };
  assert.equal(await resolveStandaloneTradeInOrigin(loadOrigin), 'https://saved-tradein.example.com');
  assert.equal(await resolveStandaloneTradeInOrigin(loadOrigin), 'https://saved-tradein.example.com');
  assert.equal(loadCount, 1);
  cacheSavedTradeInOrigin('');
  assert.equal(await resolveStandaloneTradeInOrigin(async () => '', 'https://fallback.example.com'), 'https://fallback.example.com');
});

test('allows only Trade-in public resources on the standalone hostname', () => {
  for (const request of [
    { path: '/' },
    { path: '/trade-in' },
    { path: '/web-assets/trade-in.js' },
    { path: '/api/public/trade-in/settings' },
    { path: '/api/public/trade-in/applications', method: 'POST' },
    { path: '/api/public/trade-in/settings', method: 'OPTIONS' }
  ]) {
    assert.equal(isAllowedStandaloneTradeInRequest(fakeRequest(request)), true, `${request.method || 'GET'} ${request.path}`);
  }
  for (const request of [
    { path: '/login' },
    { path: '/trade-in/editor' },
    { path: '/api/trade-in/settings' },
    { path: '/api/auth/me' },
    { path: '/api/public/trade-in/settings', method: 'PATCH' }
  ]) {
    assert.equal(isAllowedStandaloneTradeInRequest(fakeRequest(request)), false, `${request.method || 'GET'} ${request.path}`);
  }
});

test('normalizes Trade-in configuration and evaluates conditional scenarios', () => {
  const config = normalizeTradeInConfig({
    ...defaultTradeInConfig,
    theme: { ...defaultTradeInConfig.theme, maxWidth: 99999 },
    form: defaultTradeInConfig.form
  });
  assert.equal(config.theme.maxWidth, 1800);
  assert.ok(config.form.steps.length >= 5);
  assert.equal(matchesTradeInCondition({ fieldKey: 'category', operator: 'one_of', value: 'smartphone,apple' }, { category: 'apple' }), true);
  assert.equal(matchesTradeInCondition({ fieldKey: 'category', operator: 'equals', value: 'laptop' }, { category: 'apple' }), false);
});
