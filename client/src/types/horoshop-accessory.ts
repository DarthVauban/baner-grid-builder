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
  source: 'algorithm' | 'manual' | 'imported';
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
  generatedCount?: number;
}

export interface HoroshopAccessoryCandidates {
  products: Array<Omit<HoroshopAccessoryProduct, 'type'>>;
  categories: Array<Omit<HoroshopAccessoryCategory, 'type'>>;
}

export type HoroshopAccessoryDraftItem = Pick<HoroshopAccessoryTarget, 'type' | 'id'>;
