export type SiteThemeFontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export interface SiteThemePromoBar {
  mode: 'standard' | 'marquee';
  marqueeSpeed: number;
  text: string;
  buttonText: string;
  buttonUrl: string;
  backgroundColor: string;
  backgroundImageUrl: string;
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
}

export interface SiteTheme extends SiteThemeInput {
  id: string;
  promoBarEnabled: boolean;
  active: boolean;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
  createdAt: string;
  updatedAt: string;
}
