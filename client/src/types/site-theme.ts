export type SiteThemeFontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export interface SiteThemeGoldGlint {
  color: string;
  intensity: number;
  durationMs: number;
  repeat: 'once' | 'interval';
  intervalSeconds: number;
}

export type SiteThemeStorefrontEffectId = 'cornerRibbons' | 'confetti';
export type SiteThemeEffectId = 'goldGlint' | SiteThemeStorefrontEffectId;

export interface SiteThemeRibbonLayout {
  placement: 'both' | 'left' | 'right' | 'hidden';
  size: number;
}

export interface SiteThemeCornerRibbons {
  imageUrl: string;
  opacity: number;
  desktop: SiteThemeRibbonLayout;
  mobile: SiteThemeRibbonLayout;
}

export interface SiteThemeConfetti {
  primaryColor: string;
  secondaryColor: string;
  count: number;
  durationMs: number;
  delayMs: number;
  frequency: 'session' | 'page';
  showDesktop: boolean;
  showMobile: boolean;
}

export interface SiteThemeStorefrontEffects {
  cornerRibbons: SiteThemeCornerRibbons | null;
  confetti: SiteThemeConfetti | null;
}

export interface SiteThemePromoBar {
  mode: 'standard' | 'marquee';
  marqueeSpeed: number;
  text: string;
  buttonText: string;
  buttonUrl: string;
  backgroundColor: string;
  backgroundImageUrl: string;
  goldGlint: SiteThemeGoldGlint | null;
  textColor: string;
  buttonColor: string;
  buttonTextColor: string;
  textFontSize: number;
  textFontWeight: SiteThemeFontWeight | 'inherit';
  buttonFontSize: number;
  buttonFontWeight: SiteThemeFontWeight;
  buttonPaddingY: number;
  buttonPaddingX: number;
  alignment: 'left' | 'center' | 'right';
  paddingY: number;
  paddingX: number;
  showDesktop: boolean;
  showMobile: boolean;
}

export interface SiteThemeInput {
  name: string;
  promoBar: SiteThemePromoBar;
  storefrontEffects: SiteThemeStorefrontEffects;
}

export interface SiteTheme extends SiteThemeInput {
  id: string;
  promoBarEnabled: boolean;
  goldGlintEnabled: boolean;
  storefrontEffectVisibility: Record<SiteThemeStorefrontEffectId, boolean>;
  active: boolean;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
  createdAt: string;
  updatedAt: string;
}
