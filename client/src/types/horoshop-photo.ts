export type HoroshopPhotoParseStatus = 'idle' | 'queued' | 'running' | 'ready' | 'partial' | 'failed';
export type HoroshopPhotoPublishStatus = 'draft' | 'publishing' | 'published' | 'failed';
export type HoroshopPhotoPublicationMode = 'append' | 'replace';

export interface HoroshopPhotoSelectionSummary {
  id: string;
  name: string;
  matchedCount: number;
  ambiguousCount: number;
  unmatchedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface HoroshopPhotoCandidate {
  targetType: 'product' | 'modification';
  productId: string;
  modificationId: string | null;
  sku: string;
  title: string;
  productTitle: string;
  imageUrl: string;
}

export interface HoroshopPhotoAsset {
  id: string;
  mediaAssetId: string;
  sourceUrl: string;
  url: string;
  width: number;
  height: number;
  size: number;
  selected: boolean;
  sortOrder: number;
}

export interface HoroshopPhotoDraft {
  id: string | null;
  productId: string;
  modificationId: string | null;
  targetType: 'gallery_common' | 'images';
  sourceUrl: string;
  parseStatus: HoroshopPhotoParseStatus;
  publishStatus: HoroshopPhotoPublishStatus;
  foundCount: number;
  errorMessage: string;
  errors: Array<{ stage?: string; sourceUrl?: string; message?: string }>;
  publishedAt: string | null;
  currentImages: string[];
  assets: HoroshopPhotoAsset[];
}

export interface HoroshopPhotoModification {
  id: string;
  sku: string;
  title: string;
  imageUrl: string;
  draft: HoroshopPhotoDraft;
}

export interface HoroshopPhotoSelectionProduct {
  itemIds: string[];
  inputs: string[];
  includeAllModifications: boolean;
  id: string;
  sku: string;
  title: string;
  imageUrl: string;
  canonicalUrl: string;
  commonDraft: HoroshopPhotoDraft | null;
  modifications: HoroshopPhotoModification[];
}

export interface HoroshopPhotoSelection {
  id: string;
  name: string;
  inputLines: string[];
  resolution: {
    ambiguous: Array<{ input: string; candidates: HoroshopPhotoCandidate[] }>;
    unmatched: string[];
  };
  products: HoroshopPhotoSelectionProduct[];
  createdAt: string;
  updatedAt: string;
}

export interface HoroshopPhotoRun {
  id: string;
  draftId: string;
  status: 'queued' | 'running' | 'success' | 'partial' | 'failed';
  sku: string;
  title: string;
  sourceUrl: string;
  adapterId: string;
  foundCount: number;
  savedCount: number;
  skippedCount: number;
  errorMessage: string;
  errors: Array<{ stage?: string; sourceUrl?: string; message?: string }>;
  startedAt: string | null;
  completedAt: string | null;
}

export interface HoroshopPhotoBatch {
  id: string;
  selectionId: string | null;
  status: 'queued' | 'running' | 'completed';
  requestedCount: number;
  counts: { queued: number; running: number; success: number; partial: number; failed: number };
  items: HoroshopPhotoRun[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface HoroshopPhotoPublishProgress {
  stage: 'authenticating' | 'publishing' | 'completed';
  totalDrafts: number;
  processedDrafts: number;
  currentArticle: string;
  percentage: number;
}

export interface HoroshopPhotoPublishResult {
  publishedDrafts: number;
  publishedArticles: number;
  failedDrafts: number;
  failedArticles: number;
  failures: Array<{
    article: string;
    message: string;
    code?: string;
  }>;
  selectionCleared?: boolean;
  remainingTargets?: number;
}

export interface HoroshopPhotoDesktopDevice {
  id: string;
  name: string;
  appVersion: string;
  capabilities: Record<string, string | number | boolean>;
  pairedAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

export interface HoroshopPhotoDesktopPairing {
  id: string;
  status: 'pending' | 'claimed' | 'expired' | 'cancelled';
  manualCode?: string;
  expiresAt: string;
  createdAt?: string;
  device?: HoroshopPhotoDesktopDevice | null;
}
