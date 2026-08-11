export type FacebookGroupStatus = 'active' | 'inactive' | 'do_not_publish';
export type FacebookAdvertisingPolicy = 'allowed' | 'forbidden' | 'unknown';
export type FacebookCampaignStatus = 'draft' | 'active' | 'completed';
export type FacebookTargetStatus = 'not_started' | 'published' | 'pending_moderation' | 'rejected' | 'skipped';

export interface FacebookPublicationStore {
  id: string;
  city: string;
  address: string;
  createdAt: string;
  updatedAt: string;
}

export type FacebookPublicationStoreInput = Pick<FacebookPublicationStore,
  'city' | 'address'>;

export interface FacebookPublicationGroup {
  id: string;
  name: string;
  url: string;
  advertisingPolicy: FacebookAdvertisingPolicy;
  moderationRequired: boolean;
  recommendedIntervalDays: number;
  status: FacebookGroupStatus;
  lastPublishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FacebookPublicationGroupInput {
  name: string;
  url: string;
  advertisingPolicy: FacebookAdvertisingPolicy;
  moderationRequired: boolean;
  status: FacebookGroupStatus;
}

export interface FacebookPublicationAsset {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
}

export interface FacebookPublicationTarget {
  id: string;
  campaignId: string;
  groupId: string;
  storeId: string;
  groupName: string;
  groupUrl: string;
  city: string;
  storeName: string;
  address: string;
  renderedText: string;
  textVariantIndex: number;
  assetId: string | null;
  imageUrl: string;
  status: FacebookTargetStatus;
  warnings: string[];
  retryOfTargetId: string | null;
  postUrl: string;
  note: string;
  openedAt: string | null;
  copiedAt: string | null;
  imageOpenedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: { id: string; name: string } | null;
}

export interface FacebookCampaignCounts extends Record<FacebookTargetStatus, number> {
  total: number;
}

export interface FacebookPublicationCampaign {
  id: string;
  title: string;
  promotion: string;
  plannedDate: string;
  textVariants: string[];
  asset: FacebookPublicationAsset | null;
  status: FacebookCampaignStatus;
  counts: FacebookCampaignCounts;
  targets?: FacebookPublicationTarget[];
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface FacebookPublicationCampaignInput {
  title: string;
  promotion: string;
  plannedDate: string;
  textVariants: string[];
  assetId: string;
  selections: Array<{ groupId: string; storeId: string }>;
}

export interface FacebookPublicationHistoryItem extends FacebookPublicationTarget {
  campaignTitle: string;
  plannedDate: string;
}

export interface FacebookImportRowBase {
  rowNumber: number;
  action: 'create' | 'update' | 'error' | 'conflict';
  reason: string;
}

export interface FacebookStoreImportRow extends FacebookImportRowBase {
  city: string;
  address: string;
}

export interface FacebookGroupImportRow extends FacebookImportRowBase {
  name: string;
  url: string;
  advertisingPolicy: FacebookAdvertisingPolicy;
  moderationRequired: boolean;
  status: FacebookGroupStatus;
}

export interface FacebookImportSection<T> {
  rows: T[];
  summary: { total: number; create: number; update: number; error: number; conflict: number };
}

export interface FacebookPublicationImportPreview {
  stores: FacebookImportSection<FacebookStoreImportRow>;
  groups: FacebookImportSection<FacebookGroupImportRow>;
}

export interface FacebookPublicationImportCommit {
  stores: { created: number; updated: number; errors: number };
  groups: { created: number; updated: number; errors: number };
  preview: FacebookPublicationImportPreview;
}

export interface FacebookPublicationRiskSummary {
  lastFiveMinutes: number;
  lastFifteenMinutes: number;
  latestActivityAt: string | null;
  showBreakRecommendation: boolean;
  showUrgentWarning: boolean;
  recommendedBreakMinutes: number;
}

export interface FacebookPublicationWorkbookRows {
  stores: Array<Record<string, unknown>>;
  groups: Array<Record<string, unknown>>;
}
