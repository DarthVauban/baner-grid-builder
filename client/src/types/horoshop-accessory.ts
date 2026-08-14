import type { HoroshopLocalizedText } from './horoshop-catalog';

export interface HoroshopAccessoryProduct {
  type: 'product';
  id: string;
  sku: string;
  titles: HoroshopLocalizedText;
  brand: string | null;
  categoryExternalId?: string | null;
  price: string | null;
  currency: string | null;
  availability: string | null;
  visible: boolean;
  active: boolean;
  imageUrl?: string | null;
  primaryImageUrl?: string | null;
  canonicalUrl?: string | null;
}

export interface HoroshopAccessoryCategory {
  type: 'category';
  id: string;
  externalId: string;
  titles: HoroshopLocalizedText;
}

export type HoroshopAccessoryTarget = HoroshopAccessoryProduct | HoroshopAccessoryCategory;

export interface HoroshopAccessoryScores {
  compatibility: number | null;
  utility: number | null;
  availability: number | null;
  popularity: number | null;
  total: number | null;
}

export interface HoroshopAccessoryLink {
  id: string;
  key: string;
  source: 'codex' | 'manual' | 'imported';
  selected: boolean;
  published: boolean;
  position: number;
  scores: HoroshopAccessoryScores;
  reason: string | null;
  target: HoroshopAccessoryTarget;
}

export interface HoroshopAccessoryPublication {
  id: string;
  status: 'running' | 'succeeded' | 'failed';
  productAccessoryCount: number;
  categoryAccessoryCount: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface HoroshopAccessoryDetail {
  product: Omit<HoroshopAccessoryProduct, 'type'>;
  draft: {
    catalogStateKnown: boolean;
    initializedAt: string;
    publishedAt: string | null;
    isDirty: boolean;
    selected: HoroshopAccessoryLink[];
    suggestions: HoroshopAccessoryLink[];
  };
  latestPublication: HoroshopAccessoryPublication | null;
}

export interface HoroshopAccessoryCandidates {
  products: Array<Omit<HoroshopAccessoryProduct, 'type'>>;
  categories: Array<Omit<HoroshopAccessoryCategory, 'type'>>;
}

export interface HoroshopCodexReviewModification {
  id: string;
  sku: string;
  titles: HoroshopLocalizedText;
  price: string | null;
  oldPrice: string | null;
  currency: string | null;
  availability: string | null;
  visible: boolean;
  active: boolean;
  attributes: Record<string, unknown>;
}

export interface HoroshopCodexReviewProduct {
  id: string;
  sku: string;
  titles: HoroshopLocalizedText;
  descriptions: HoroshopLocalizedText;
  brand: string | null;
  categoryExternalId: string | null;
  categoryTitles: HoroshopLocalizedText;
  characteristics: Record<string, unknown>;
  popularity: string | null;
  price: string | null;
  oldPrice: string | null;
  currency: string | null;
  availability: string | null;
  visible: boolean;
  active: boolean;
  canonicalUrl: string | null;
  modifications: HoroshopCodexReviewModification[];
}

export interface HoroshopCodexReviewCatalog {
  format: 'horoshop-codex-accessory-review/v1';
  connectionGeneration: string;
  catalogRevision: string;
  storeDomain: string;
  exportedAt: string;
  products: HoroshopCodexReviewProduct[];
}

export interface HoroshopCodexReviewProposal {
  format: 'horoshop-codex-accessory-review/v1';
  connectionGeneration: string;
  catalogRevision: string;
  products: Array<{
    productId: string;
    recommendations: Array<{
      productId: string;
      reason: string;
      scores: {
        compatibility: number;
        utility: number;
        availability: number;
        popularity: number;
        total: number;
      };
    }>;
  }>;
}

export interface HoroshopCodexReviewResult {
  reviewedProducts: number;
  productsWithRecommendations: number;
  productsWithoutRecommendations: number;
  recommendationsSaved: number;
}

export interface HoroshopCodexAcceptResult {
  productsUpdated: number;
  recommendationsAdded: number;
  recommendationsSkipped: number;
  detail: HoroshopAccessoryDetail | null;
}

export interface HoroshopAccessoryBulkPublishSummary {
  pendingProducts: number;
  productAccessories: number;
  categoryAccessories: number;
}

export interface HoroshopAccessoryBulkPublishResult {
  publishedProducts: number;
  productAccessories: number;
  categoryAccessories: number;
}

export type HoroshopAccessoryDraftItem = Pick<HoroshopAccessoryTarget, 'type' | 'id'>;
