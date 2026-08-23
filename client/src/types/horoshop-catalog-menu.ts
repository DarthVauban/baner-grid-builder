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
  draftDefaultCategoryExternalId: string | null;
  publishedDefaultCategoryExternalId: string | null;
  publishedVersion: number;
  storeDomain: string;
  updatedAt: string;
  publishedAt: string | null;
  embedCode: string;
}

export interface HoroshopCatalogMenuDefaultCategory {
  externalId: string;
  title: string;
}

export interface HoroshopCatalogMenuSettingsEnvelope {
  settings: HoroshopCatalogMenuSettings;
  themes: HoroshopCatalogMenuTheme[];
  defaultCategories: HoroshopCatalogMenuDefaultCategory[];
}
