import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedStandaloneStorefrontRequest,
  isStandaloneStorefrontRequest,
  standaloneStorefrontProductPath,
  storefrontHostFromOrigin,
  storefrontProductPathForRequest
} from '../src/modules/catalog/storefront.domain.js';

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

test('recognizes only the configured standalone storefront hostname', () => {
  assert.equal(storefrontHostFromOrigin('https://used.example.com/catalog'), 'used.example.com');
  assert.equal(isStandaloneStorefrontRequest(fakeRequest({ host: 'used.example.com' }), 'https://used.example.com'), true);
  assert.equal(isStandaloneStorefrontRequest(fakeRequest({ host: 'used.example.com:443' }), 'https://used.example.com'), true);
  assert.equal(isStandaloneStorefrontRequest(fakeRequest({ forwardedHost: 'used.example.com, proxy.internal' }), 'https://used.example.com'), true);
  assert.equal(isStandaloneStorefrontRequest(fakeRequest({ host: 'mt-panel.sbs' }), 'https://used.example.com'), false);
  assert.equal(isStandaloneStorefrontRequest(fakeRequest({ host: 'used.example.com' }), ''), false);
});

test('allows only public storefront resources on the standalone hostname', () => {
  const allowed = [
    { path: '/' },
    { path: '/smartphones/iphone-15' },
    { path: '/api/storefront/settings' },
    { path: '/api/storefront/products/iphone-15/applications', method: 'POST' },
    { path: '/api/public/application-forms/form-id' },
    { path: '/media/catalog/iphone.webp' },
    { path: '/web-assets/storefront.js' },
    { path: '/mt-auto-height-sandbox.js' }
  ];
  for (const request of allowed) {
    assert.equal(isAllowedStandaloneStorefrontRequest(fakeRequest(request)), true, `${request.method || 'GET'} ${request.path}`);
  }

  const blocked = [
    { path: '/login' },
    { path: '/catalog/products' },
    { path: '/api/auth/me' },
    { path: '/api/catalog/products' },
    { path: '/api/storefront/settings', method: 'PATCH' }
  ];
  for (const request of blocked) {
    assert.equal(isAllowedStandaloneStorefrontRequest(fakeRequest(request)), false, `${request.method || 'GET'} ${request.path}`);
  }
});

test('uses root-mounted product paths only for standalone storefront requests', () => {
  const product = { slug: 'iphone 15 black', publicPath: '/storefront/smartphones/iphone%2015%20black' };
  assert.equal(standaloneStorefrontProductPath(product.slug), '/smartphones/iphone%2015%20black');
  assert.equal(storefrontProductPathForRequest({ isStandaloneStorefront: true }, product), '/smartphones/iphone%2015%20black');
  assert.equal(storefrontProductPathForRequest({ isStandaloneStorefront: false }, product), product.publicPath);
});
