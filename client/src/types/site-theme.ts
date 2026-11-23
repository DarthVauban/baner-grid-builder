export interface SiteThemePromoBar {
  text: string;
  buttonText: string;
  buttonUrl: string;
  backgroundColor: string;
  textColor: string;
  buttonColor: string;
  buttonTextColor: string;
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
