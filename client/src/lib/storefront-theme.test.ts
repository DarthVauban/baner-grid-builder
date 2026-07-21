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
    storefront.header.logoHeight = 54;
    storefront.filters.visible = false;
    storefront.controls.sortVisible = false;
    card.button.label = 'Замовити';
    card.button.fullWidth = true;
    card.image.fit = 'contain';

    expect(storefrontThemeStyle(storefront)).toMatchObject({
      '--sf-font-body': '"Unbounded", sans-serif',
      '--sf-columns-desktop': 5,
      '--sf-brand-logo-height': '54px',
      '--sf-filter-display': 'none',
      '--sf-catalog-columns': 'minmax(0,1fr)',
      '--sf-controls-columns': 'minmax(240px,1fr)'
    });
    expect(productCardThemeStyle(card)).toMatchObject({
      '--sf-card-button-width': '100%',
      '--sf-card-image-fit': 'contain'
    });
  });

  it('maps every configurable filter color to its scoped CSS token', () => {
    const theme = structuredClone(defaultStorefrontTheme);
    Object.assign(theme.filters, {
      titleColor: '#010101',
      resetColor: '#020202',
      groupTitleColor: '#030303',
      optionTextColor: '#040404',
      countColor: '#050505',
      dividerColor: '#060606',
      activeColor: '#070707',
      activeMarkColor: '#080808',
      inactiveControlBorderColor: '#090909',
      inputBackground: '#101010',
      inputBorderColor: '#111111',
      inputTextColor: '#121212',
      buttonBackground: '#131313',
      buttonBorderColor: '#141414',
      buttonTextColor: '#151515',
      rangeTrackColor: '#161616',
      rangeThumbBackground: '#171717',
      rangeThumbBorderColor: '#181818',
      mobileOverlayColor: '#191919',
      mobileButtonBackground: '#202020',
      mobileButtonTextColor: '#212121'
    });

    expect(storefrontThemeStyle(theme)).toMatchObject({
      '--sf-filter-title': '#010101',
      '--sf-filter-reset': '#020202',
      '--sf-filter-group-title': '#030303',
      '--sf-filter-option-text': '#040404',
      '--sf-filter-count': '#050505',
      '--sf-filter-divider': '#060606',
      '--sf-filter-active': '#070707',
      '--sf-filter-active-mark': '#080808',
      '--sf-filter-control-border': '#090909',
      '--sf-filter-input-bg': '#101010',
      '--sf-filter-input-border': '#111111',
      '--sf-filter-input-text': '#121212',
      '--sf-filter-button-bg': '#131313',
      '--sf-filter-button-border': '#141414',
      '--sf-filter-button-text': '#151515',
      '--sf-filter-range-track': '#161616',
      '--sf-filter-range-thumb-bg': '#171717',
      '--sf-filter-range-thumb-border': '#181818',
      '--sf-filter-mobile-overlay': '#191919',
      '--sf-filter-mobile-button-bg': '#202020',
      '--sf-filter-mobile-button-text': '#212121'
    });
  });

  it('maps product page layout, gallery and action settings to scoped CSS variables', () => {
    const theme = structuredClone(defaultProductPageTheme);
    theme.layout.galleryWidth = 45;
    theme.gallery.showThumbnails = false;
    theme.gallery.imageFit = 'cover';
    theme.gallery.imageScale = 64;
    theme.button.background = '#123456';
    theme.tabs.activeColor = '#654321';

    expect(productPageThemeStyle(theme)).toMatchObject({
      '--sf-product-columns': '45fr 55fr',
      '--sf-product-thumbs-display': 'none',
      '--sf-product-image-fit': 'cover',
      '--sf-product-image-scale': '64%',
      '--sf-product-button-bg': '#123456',
      '--sf-product-tabs-active': '#654321'
    });
  });
});
