import type { SiteThemeConfetti, SiteThemeCornerRibbons } from '../../../client/src/types/site-theme';

export function mountSiteThemeCornerRibbons(
  host: HTMLElement,
  config: SiteThemeCornerRibbons,
  viewport: 'desktop' | 'mobile',
  backgroundImage: (value: string, origin?: string) => string,
  origin?: string
): (() => void) | undefined;

export function mountSiteThemeConfetti(
  host: HTMLElement,
  config: SiteThemeConfetti,
  viewport: 'desktop' | 'mobile',
  themeId: string,
  preview?: boolean
): (() => void) | undefined;
