import { describe, expect, it } from 'vitest';
import {
  defaultProductCardTheme,
  defaultProductPageTheme,
  defaultStorefrontTheme,
  fontWeightOptions,
  productCardThemeStyle,
  productPageThemeStyle,
  storefrontFontOptions,
  storefrontThemeStyle
} from './storefront-theme';

describe('storefront theme tokens', () => {
  it('exposes the curated Google Fonts set and every Unbounded weight', () => {
    expect(storefrontFontOptions.map((option) => option.value)).toEqual([
      'Inter',
      'Unbounded',
      'Montserrat',
      'Roboto'
    ]);
    expect(fontWeightOptions.map((option) => Number(option.value))).toEqual([200, 300, 400, 500, 600, 700, 800, 900]);
  });

  it('maps persisted storefront and card settings to scoped CSS variables', () => {
    const storefront = structuredClone(defaultStorefrontTheme);
    const card = structuredClone(defaultProductCardTheme);
    storefront.typography.bodyFontFamily = 'Unbounded';
    storefront.layout.columnsDesktop = 5;
    storefront.filters.visible = false;
    storefront.controls.sortVisible = false;
    card.button.label = 'Замовити';
    card.button.fullWidth = true;
    card.image.fit = 'contain';

    expect(storefrontThemeStyle(storefront)).toMatchObject({
      '--sf-font-body': '"Unbounded", sans-serif',
      '--sf-columns-desktop': 5,
      '--sf-filter-display': 'none',
      '--sf-catalog-columns': 'minmax(0,1fr)',
      '--sf-controls-columns': 'minmax(240px,1fr)'
    });
    expect(productCardThemeStyle(card)).toMatchObject({
      '--sf-card-button-width': '100%',
      '--sf-card-image-fit': 'contain'
    });
  });

  it('maps product page layout, gallery and action settings to scoped CSS variables', () => {
    const theme = structuredClone(defaultProductPageTheme);
    theme.layout.galleryWidth = 45;
    theme.gallery.showThumbnails = false;
    theme.gallery.imageFit = 'cover';
    theme.button.background = '#123456';
    theme.tabs.activeColor = '#654321';

    expect(productPageThemeStyle(theme)).toMatchObject({
      '--sf-product-columns': '45fr 55fr',
      '--sf-product-thumbs-display': 'none',
      '--sf-product-image-fit': 'cover',
      '--sf-product-button-bg': '#123456',
      '--sf-product-tabs-active': '#654321'
    });
  });
});
