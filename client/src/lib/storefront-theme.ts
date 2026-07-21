import type { CSSProperties } from 'react';
import type {
  CatalogProductCardTheme,
  CatalogProductPageTheme,
  CatalogStorefrontFontFamily,
  CatalogStorefrontTheme,
  CatalogThemeShadow
} from '../types/catalog';

export const storefrontFontOptions: Array<{ value: CatalogStorefrontFontFamily; label: string }> = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Unbounded', label: 'Unbounded' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Roboto', label: 'Roboto' }
];

export const fontWeightOptions = [200, 300, 400, 500, 600, 700, 800, 900].map((value) => ({
  value: String(value),
  label: String(value)
}));

export const defaultStorefrontTheme: CatalogStorefrontTheme = {
  version: 1,
  typography: { bodyFontFamily: 'Inter', headingFontFamily: 'Inter', bodyWeight: 400, headingWeight: 800, baseSize: 16 },
  colors: { pageBackground: '#f5f7f6', surface: '#ffffff', text: '#162033', muted: '#788493', accent: '#6c5ce7', action: '#ffd400', border: '#dde5e3' },
  layout: { maxWidth: 1480, pagePaddingDesktop: 54, pagePaddingTablet: 24, pagePaddingMobile: 14, sectionGap: 28, catalogGap: 18, gridGap: 14, filterWidth: 260, columnsDesktop: 4, columnsTablet: 3, columnsMobile: 1 },
  header: { visible: true, sticky: false, height: 58, paddingX: 0, paddingY: 0, background: '#f5f7f6', borderColor: '#f5f7f6', borderWidth: 0, radius: 0, shadow: 'none', brandText: 'Mobile Trend', brandMark: 'MT', logoUrl: '', logoLink: '', logoHeight: 42, brandSize: 15, actionVisible: true },
  hero: { visible: true, eyebrowVisible: true, eyebrowText: 'USED & REFURBISHED', title: 'Смартфони з перевіреним станом', subtitle: '', alignment: 'left', titleSizeDesktop: 35, titleSizeMobile: 30, paddingX: 0, paddingY: 0, backgroundStart: '#f5f7f6', backgroundEnd: '#f5f7f6', gradientAngle: 135, radius: 0 },
  controls: { searchPlaceholder: 'iPhone, Samsung, код товару', sortVisible: true, height: 44, radius: 8, background: '#ffffff', borderColor: '#d9e1e7' },
  filters: {
    visible: true,
    sticky: true,
    background: '#ffffff',
    borderColor: '#dde5e3',
    titleColor: '#162033',
    resetColor: '#6c5ce7',
    groupTitleColor: '#263248',
    optionTextColor: '#39465a',
    countColor: '#8b95a5',
    dividerColor: '#edf1f3',
    activeColor: '#6c5ce7',
    activeMarkColor: '#ffffff',
    inactiveControlBorderColor: '#cbd5e1',
    inputBackground: '#ffffff',
    inputBorderColor: '#d9e1e7',
    inputTextColor: '#263248',
    buttonBackground: '#ffffff',
    buttonBorderColor: '#9aa4b2',
    buttonTextColor: '#39465a',
    rangeTrackColor: '#ffd400',
    rangeThumbBackground: '#ffffff',
    rangeThumbBorderColor: '#9aa4b2',
    mobileOverlayColor: '#0f172a',
    mobileButtonBackground: '#ffd400',
    mobileButtonTextColor: '#111827',
    radius: 8,
    padding: 16,
    groupGap: 16,
    shadow: 'soft',
    showCounts: true
  }
};

export const defaultProductCardTheme: CatalogProductCardTheme = {
  version: 1,
  container: { background: '#ffffff', borderColor: '#dde5e3', borderWidth: 1, radius: 8, padding: 14, gap: 12, shadow: 'soft', hoverShadow: 'strong', hoverLift: 2 },
  image: { aspectRatio: '1 / 1', fit: 'contain', background: '#eef2f4', radius: 8, padding: 0, hoverZoom: 1 },
  visibility: { image: true, badge: true, brand: true, title: true, meta: true, availability: true, modifications: true, price: true, button: true },
  contentOrder: ['image', 'badge', 'brand', 'title', 'meta'],
  badge: { textColor: '#2f5e46', background: '#e9f6ef', radius: 999, fontSize: 10, fontWeight: 800, paddingX: 8, paddingY: 5 },
  typography: { brandColor: '#162033', brandSize: 14, brandWeight: 800, titleColor: '#162033', titleSize: 14, titleWeight: 700, titleLines: 2, metaColor: '#788493', metaSize: 11, priceColor: '#1f2f46', priceSize: 19, priceWeight: 800 },
  button: { label: 'Купити', unavailableLabel: 'Немає в наявності', background: '#ffd400', hoverBackground: '#f5c900', textColor: '#111827', radius: 9, height: 36, fontSize: 15, fontWeight: 800, fullWidth: false },
  modifications: { mode: 'hover', labelColor: '#39465a', optionBackground: '#ffffff', optionTextColor: '#263248', optionBorderColor: '#b8c2ce', activeBackground: '#111827', activeTextColor: '#ffffff', activeBorderColor: '#111827', radius: 8, optionHeight: 30, swatchSize: 34 }
};

export const defaultProductPageTheme: CatalogProductPageTheme = {
  version: 1,
  layout: { galleryWidth: 50, gap: 22, sectionGap: 22 },
  gallery: { background: '#ffffff', borderColor: '#dde5e3', borderWidth: 1, radius: 8, padding: 0, imageFit: 'contain', imageScale: 72, thumbnailHeight: 91, thumbnailGap: 8, showThumbnails: true, showArrows: true, showCounter: true },
  details: { background: '#ffffff', borderColor: '#dde5e3', borderWidth: 1, radius: 8, padding: 36, gap: 24, shadow: 'soft' },
  visibility: { backLink: true, meta: true, shortDescription: true, quickSpecs: true, modifications: true, tabs: true },
  typography: { titleColor: '#162033', titleSizeDesktop: 52, titleSizeMobile: 36, titleWeight: 800, priceColor: '#111827', priceSize: 38, priceWeight: 800, leadColor: '#667085', leadSize: 14 },
  button: { label: 'Оформити заявку', unavailableLabel: 'Немає в наявності', previewLabel: 'Preview без заявки', background: '#6c5ce7', hoverBackground: '#5b4bd6', textColor: '#ffffff', radius: 10, height: 50, fontSize: 16, fontWeight: 800 },
  tabs: { descriptionLabel: 'Опис товару', characteristicsLabel: 'Характеристики', background: '#ffffff', borderColor: '#dde5e3', textColor: '#697586', activeColor: '#4f46e5', radius: 8, padding: 42 }
};

export function cloneStorefrontTheme(theme = defaultStorefrontTheme) {
  return structuredClone(theme);
}

export function cloneProductCardTheme(theme = defaultProductCardTheme) {
  return structuredClone(theme);
}

export function cloneProductPageTheme(theme = defaultProductPageTheme) {
  return structuredClone(theme);
}

const shadowValues: Record<CatalogThemeShadow, string> = {
  none: 'none',
  soft: '0 8px 24px rgba(28,45,55,.05)',
  strong: '0 18px 42px rgba(28,45,55,.13)'
};

type ThemeStyle = CSSProperties & Record<`--${string}`, string | number>;

export function storefrontThemeStyle(theme: CatalogStorefrontTheme): ThemeStyle {
  return {
    '--sf-font-body': `"${theme.typography.bodyFontFamily}", sans-serif`,
    '--sf-font-heading': `"${theme.typography.headingFontFamily}", sans-serif`,
    '--sf-body-weight': theme.typography.bodyWeight,
    '--sf-heading-weight': theme.typography.headingWeight,
    '--sf-base-size': `${theme.typography.baseSize}px`,
    '--sf-page-bg': theme.colors.pageBackground,
    '--sf-surface': theme.colors.surface,
    '--sf-text': theme.colors.text,
    '--sf-muted': theme.colors.muted,
    '--sf-accent': theme.colors.accent,
    '--sf-action': theme.colors.action,
    '--sf-border': theme.colors.border,
    '--sf-max-width': `${theme.layout.maxWidth}px`,
    '--sf-page-padding-desktop': `${theme.layout.pagePaddingDesktop}px`,
    '--sf-page-padding-tablet': `${theme.layout.pagePaddingTablet}px`,
    '--sf-page-padding-mobile': `${theme.layout.pagePaddingMobile}px`,
    '--sf-section-gap': `${theme.layout.sectionGap}px`,
    '--sf-catalog-gap': `${theme.layout.catalogGap}px`,
    '--sf-grid-gap': `${theme.layout.gridGap}px`,
    '--sf-filter-width': `${theme.layout.filterWidth}px`,
    '--sf-catalog-columns': theme.filters.visible ? `${theme.layout.filterWidth}px minmax(0,1fr)` : 'minmax(0,1fr)',
    '--sf-columns-desktop': theme.layout.columnsDesktop,
    '--sf-columns-tablet': theme.layout.columnsTablet,
    '--sf-columns-mobile': theme.layout.columnsMobile,
    '--sf-header-display': theme.header.visible ? 'flex' : 'none',
    '--sf-header-position': theme.header.sticky ? 'sticky' : 'relative',
    '--sf-header-height': `${theme.header.height}px`,
    '--sf-header-padding-x': `${theme.header.paddingX}px`,
    '--sf-header-padding-y': `${theme.header.paddingY}px`,
    '--sf-header-bg': theme.header.background,
    '--sf-header-border': theme.header.borderColor,
    '--sf-header-border-width': `${theme.header.borderWidth}px`,
    '--sf-header-radius': `${theme.header.radius}px`,
    '--sf-header-shadow': shadowValues[theme.header.shadow],
    '--sf-brand-size': `${theme.header.brandSize}px`,
    '--sf-brand-logo-height': `${theme.header.logoHeight}px`,
    '--sf-header-action-display': theme.header.actionVisible ? 'inline-flex' : 'none',
    '--sf-hero-display': theme.hero.visible ? 'grid' : 'none',
    '--sf-hero-eyebrow-display': theme.hero.eyebrowVisible ? 'block' : 'none',
    '--sf-hero-align': theme.hero.alignment,
    '--sf-hero-items': theme.hero.alignment === 'center' ? 'center' : theme.hero.alignment === 'right' ? 'end' : 'start',
    '--sf-hero-title-size': `${theme.hero.titleSizeDesktop}px`,
    '--sf-hero-title-mobile-size': `${theme.hero.titleSizeMobile}px`,
    '--sf-hero-padding-x': `${theme.hero.paddingX}px`,
    '--sf-hero-padding-y': `${theme.hero.paddingY}px`,
    '--sf-hero-bg': `linear-gradient(${theme.hero.gradientAngle}deg, ${theme.hero.backgroundStart}, ${theme.hero.backgroundEnd})`,
    '--sf-hero-radius': `${theme.hero.radius}px`,
    '--sf-control-height': `${theme.controls.height}px`,
    '--sf-control-radius': `${theme.controls.radius}px`,
    '--sf-control-bg': theme.controls.background,
    '--sf-control-border': theme.controls.borderColor,
    '--sf-controls-columns': theme.controls.sortVisible ? 'minmax(240px,1fr) 276px' : 'minmax(240px,1fr)',
    '--sf-sort-display': theme.controls.sortVisible ? 'block' : 'none',
    '--sf-filter-display': theme.filters.visible ? 'grid' : 'none',
    '--sf-filter-position': theme.filters.sticky ? 'sticky' : 'relative',
    '--sf-filter-bg': theme.filters.background,
    '--sf-filter-border': theme.filters.borderColor,
    '--sf-filter-title': theme.filters.titleColor,
    '--sf-filter-reset': theme.filters.resetColor,
    '--sf-filter-group-title': theme.filters.groupTitleColor,
    '--sf-filter-option-text': theme.filters.optionTextColor,
    '--sf-filter-count': theme.filters.countColor,
    '--sf-filter-divider': theme.filters.dividerColor,
    '--sf-filter-active': theme.filters.activeColor,
    '--sf-filter-active-mark': theme.filters.activeMarkColor,
    '--sf-filter-control-border': theme.filters.inactiveControlBorderColor,
    '--sf-filter-input-bg': theme.filters.inputBackground,
    '--sf-filter-input-border': theme.filters.inputBorderColor,
    '--sf-filter-input-text': theme.filters.inputTextColor,
    '--sf-filter-button-bg': theme.filters.buttonBackground,
    '--sf-filter-button-border': theme.filters.buttonBorderColor,
    '--sf-filter-button-text': theme.filters.buttonTextColor,
    '--sf-filter-range-track': theme.filters.rangeTrackColor,
    '--sf-filter-range-thumb-bg': theme.filters.rangeThumbBackground,
    '--sf-filter-range-thumb-border': theme.filters.rangeThumbBorderColor,
    '--sf-filter-mobile-overlay': theme.filters.mobileOverlayColor,
    '--sf-filter-mobile-button-bg': theme.filters.mobileButtonBackground,
    '--sf-filter-mobile-button-text': theme.filters.mobileButtonTextColor,
    '--sf-filter-radius': `${theme.filters.radius}px`,
    '--sf-filter-padding': `${theme.filters.padding}px`,
    '--sf-filter-gap': `${theme.filters.groupGap}px`,
    '--sf-filter-shadow': shadowValues[theme.filters.shadow],
    '--sf-filter-count-display': theme.filters.showCounts ? 'block' : 'none'
  };
}

export function productCardThemeStyle(theme: CatalogProductCardTheme): ThemeStyle {
  return {
    '--sf-card-bg': theme.container.background,
    '--sf-card-border': theme.container.borderColor,
    '--sf-card-border-width': `${theme.container.borderWidth}px`,
    '--sf-card-radius': `${theme.container.radius}px`,
    '--sf-card-padding': `${theme.container.padding}px`,
    '--sf-card-gap': `${theme.container.gap}px`,
    '--sf-card-shadow': shadowValues[theme.container.shadow],
    '--sf-card-hover-shadow': shadowValues[theme.container.hoverShadow],
    '--sf-card-hover-lift': `${theme.container.hoverLift * -1}px`,
    '--sf-card-image-ratio': theme.image.aspectRatio,
    '--sf-card-image-fit': theme.image.fit,
    '--sf-card-image-bg': theme.image.background,
    '--sf-card-image-radius': `${theme.image.radius}px`,
    '--sf-card-image-padding': `${theme.image.padding}px`,
    '--sf-card-image-zoom': theme.image.hoverZoom,
    '--sf-card-badge-color': theme.badge.textColor,
    '--sf-card-badge-bg': theme.badge.background,
    '--sf-card-badge-radius': `${theme.badge.radius}px`,
    '--sf-card-badge-size': `${theme.badge.fontSize}px`,
    '--sf-card-badge-weight': theme.badge.fontWeight,
    '--sf-card-badge-padding': `${theme.badge.paddingY}px ${theme.badge.paddingX}px`,
    '--sf-card-brand-color': theme.typography.brandColor,
    '--sf-card-brand-size': `${theme.typography.brandSize}px`,
    '--sf-card-brand-weight': theme.typography.brandWeight,
    '--sf-card-title-color': theme.typography.titleColor,
    '--sf-card-title-size': `${theme.typography.titleSize}px`,
    '--sf-card-title-weight': theme.typography.titleWeight,
    '--sf-card-title-lines': theme.typography.titleLines,
    '--sf-card-meta-color': theme.typography.metaColor,
    '--sf-card-meta-size': `${theme.typography.metaSize}px`,
    '--sf-card-price-color': theme.typography.priceColor,
    '--sf-card-price-size': `${theme.typography.priceSize}px`,
    '--sf-card-price-weight': theme.typography.priceWeight,
    '--sf-card-button-bg': theme.button.background,
    '--sf-card-button-hover-bg': theme.button.hoverBackground,
    '--sf-card-button-color': theme.button.textColor,
    '--sf-card-button-radius': `${theme.button.radius}px`,
    '--sf-card-button-height': `${theme.button.height}px`,
    '--sf-card-button-size': `${theme.button.fontSize}px`,
    '--sf-card-button-weight': theme.button.fontWeight,
    '--sf-card-button-width': theme.button.fullWidth ? '100%' : 'auto',
    '--sf-card-mod-label': theme.modifications.labelColor,
    '--sf-card-mod-bg': theme.modifications.optionBackground,
    '--sf-card-mod-color': theme.modifications.optionTextColor,
    '--sf-card-mod-border': theme.modifications.optionBorderColor,
    '--sf-card-mod-active-bg': theme.modifications.activeBackground,
    '--sf-card-mod-active-color': theme.modifications.activeTextColor,
    '--sf-card-mod-active-border': theme.modifications.activeBorderColor,
    '--sf-card-mod-radius': `${theme.modifications.radius}px`,
    '--sf-card-mod-height': `${theme.modifications.optionHeight}px`,
    '--sf-card-swatch-size': `${theme.modifications.swatchSize}px`
  };
}

export function productPageThemeStyle(theme: CatalogProductPageTheme): ThemeStyle {
  const detailsWidth = 100 - theme.layout.galleryWidth;
  return {
    '--sf-product-columns': `${theme.layout.galleryWidth}fr ${detailsWidth}fr`,
    '--sf-product-gap': `${theme.layout.gap}px`,
    '--sf-product-section-gap': `${theme.layout.sectionGap}px`,
    '--sf-product-gallery-bg': theme.gallery.background,
    '--sf-product-gallery-border': theme.gallery.borderColor,
    '--sf-product-gallery-border-width': `${theme.gallery.borderWidth}px`,
    '--sf-product-gallery-radius': `${theme.gallery.radius}px`,
    '--sf-product-gallery-padding': `${theme.gallery.padding}px`,
    '--sf-product-image-fit': theme.gallery.imageFit,
    '--sf-product-image-scale': `${theme.gallery.imageScale}%`,
    '--sf-product-preview-image-width': `${Math.round(theme.gallery.imageScale * 0.44)}%`,
    '--sf-product-preview-image-height': `${theme.gallery.imageScale}%`,
    '--sf-product-thumbs-height': `${theme.gallery.thumbnailHeight}px`,
    '--sf-product-thumb-gap': `${theme.gallery.thumbnailGap}px`,
    '--sf-product-thumbs-display': theme.gallery.showThumbnails ? 'block' : 'none',
    '--sf-product-arrows-display': theme.gallery.showArrows ? 'inline-flex' : 'none',
    '--sf-product-counter-display': theme.gallery.showCounter ? 'inline-flex' : 'none',
    '--sf-product-details-bg': theme.details.background,
    '--sf-product-details-border': theme.details.borderColor,
    '--sf-product-details-border-width': `${theme.details.borderWidth}px`,
    '--sf-product-details-radius': `${theme.details.radius}px`,
    '--sf-product-details-padding': `${theme.details.padding}px`,
    '--sf-product-details-gap': `${theme.details.gap}px`,
    '--sf-product-details-shadow': shadowValues[theme.details.shadow],
    '--sf-product-title-color': theme.typography.titleColor,
    '--sf-product-title-size': `${theme.typography.titleSizeDesktop}px`,
    '--sf-product-title-mobile-size': `${theme.typography.titleSizeMobile}px`,
    '--sf-product-title-weight': theme.typography.titleWeight,
    '--sf-product-price-color': theme.typography.priceColor,
    '--sf-product-price-size': `${theme.typography.priceSize}px`,
    '--sf-product-price-weight': theme.typography.priceWeight,
    '--sf-product-lead-color': theme.typography.leadColor,
    '--sf-product-lead-size': `${theme.typography.leadSize}px`,
    '--sf-product-button-bg': theme.button.background,
    '--sf-product-button-hover-bg': theme.button.hoverBackground,
    '--sf-product-button-color': theme.button.textColor,
    '--sf-product-button-radius': `${theme.button.radius}px`,
    '--sf-product-button-height': `${theme.button.height}px`,
    '--sf-product-button-size': `${theme.button.fontSize}px`,
    '--sf-product-button-weight': theme.button.fontWeight,
    '--sf-product-tabs-bg': theme.tabs.background,
    '--sf-product-tabs-border': theme.tabs.borderColor,
    '--sf-product-tabs-color': theme.tabs.textColor,
    '--sf-product-tabs-active': theme.tabs.activeColor,
    '--sf-product-tabs-radius': `${theme.tabs.radius}px`,
    '--sf-product-tabs-padding': `${theme.tabs.padding}px`
  };
}
