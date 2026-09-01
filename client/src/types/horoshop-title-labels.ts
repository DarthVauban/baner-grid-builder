export interface HoroshopTitleLabelRule {
  id: string;
  name: string;
  text: string;
  stickerKeys: string[];
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  borderRadius: number;
  enabled: boolean;
}

export interface HoroshopStickerOption {
  key: string;
  id: string;
  title: string;
  productCount: number;
}

export interface HoroshopTitleLabelSettings {
  publicId: string;
  enabled: boolean;
  draftRules: HoroshopTitleLabelRule[];
  publishedRules: HoroshopTitleLabelRule[];
  publishedVersion: number;
  storeDomain: string;
  lastCatalogSyncAt: string | null;
  updatedAt: string;
  publishedAt: string | null;
  embedCode: string;
  stickerOptions: HoroshopStickerOption[];
}
