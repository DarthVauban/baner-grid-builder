import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStorefrontTheme } from '../src/modules/catalog/storefront.theme.js';

test('storefront theme keeps the former shared logo in the footer when loading legacy settings', () => {
  const theme = normalizeStorefrontTheme({
    header: {
      logoUrl: '/media/catalog/legacy-logo.webp',
      logoHeight: 56
    }
  });

  assert.equal(theme.footer.logoUrl, '/media/catalog/legacy-logo.webp');
  assert.equal(theme.footer.logoHeight, 56);
});

test('storefront theme preserves an explicitly configured independent footer logo', () => {
  const theme = normalizeStorefrontTheme({
    header: {
      logoUrl: '/media/catalog/header-logo.webp',
      logoHeight: 56
    },
    footer: {
      logoUrl: '/media/catalog/footer-logo.webp',
      logoHeight: 44
    }
  });

  assert.equal(theme.footer.logoUrl, '/media/catalog/footer-logo.webp');
  assert.equal(theme.footer.logoHeight, 44);
});
