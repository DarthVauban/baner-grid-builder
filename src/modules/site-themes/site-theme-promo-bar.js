export const promoBarStyleDefaults = Object.freeze({
  textFontSize: 14,
  textFontWeight: 'inherit',
  buttonFontSize: 14,
  buttonFontWeight: 600,
  buttonPaddingY: 4,
  buttonPaddingX: 12
});

export function withPromoBarStyleDefaults(promoBar) {
  return { ...promoBarStyleDefaults, ...promoBar };
}
