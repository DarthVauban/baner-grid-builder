export type HoroshopCartThemeId = 'balanced-upsell' | 'accessory-showcase' | 'compact-wide';

export interface HoroshopCartTheme {
  id: HoroshopCartThemeId;
  name: string;
  description: string;
  recommended: boolean;
}

export interface HoroshopCartThemeSettings {
  publicId: string;
  enabled: boolean;
  draftThemeId: HoroshopCartThemeId;
  publishedThemeId: HoroshopCartThemeId | null;
  publishedVersion: number;
  storeDomain: string;
  updatedAt: string;
  publishedAt: string | null;
  embedCode: string;
}

export interface HoroshopCartThemeSettingsEnvelope {
  settings: HoroshopCartThemeSettings;
  themes: HoroshopCartTheme[];
}
