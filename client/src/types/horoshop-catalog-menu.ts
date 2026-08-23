export type HoroshopCatalogMenuThemeId = 'compact-columns' | 'flat-directory' | 'grouped-sections';

export interface HoroshopCatalogMenuTheme {
  id: HoroshopCatalogMenuThemeId;
  name: string;
  description: string;
  recommended: boolean;
}

export interface HoroshopCatalogMenuSettings {
  publicId: string;
  enabled: boolean;
  draftThemeId: HoroshopCatalogMenuThemeId;
  publishedThemeId: HoroshopCatalogMenuThemeId | null;
  publishedVersion: number;
  storeDomain: string;
  updatedAt: string;
  publishedAt: string | null;
  embedCode: string;
}

export interface HoroshopCatalogMenuSettingsEnvelope {
  settings: HoroshopCatalogMenuSettings;
  themes: HoroshopCatalogMenuTheme[];
}
