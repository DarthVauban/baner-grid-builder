import type { HoroshopIntegration } from './integration';

export type HoroshopLocalizedText = Record<string, string>;
export type HoroshopCatalogVisibility = 'all' | 'visible' | 'hidden';
export type HoroshopCatalogState = 'active' | 'inactive' | 'all';

export interface HoroshopCatalogModification {
  id: string;
  externalId: string;
  sku: string;
  titles: HoroshopLocalizedText;
  price: string | null;
  oldPrice: string | null;
  currency: string | null;
  availability: string | null;
  visible: boolean;
  active: boolean;
  imageUrl: string | null;
  pageUrl: string | null;
  stickers?: Array<{ id: string; title: string }>;
  conditionLabel?: string | null;
  attributes: Record<string, unknown>;
  updatedAt: string;
}

export interface HoroshopCatalogProduct {
  id: string;
  externalId: string;
  parentExternalId: string | null;
  sku: string;
  titles: HoroshopLocalizedText;
  brand: string | null;
  categoryExternalId: string | null;
  price: string | null;
  oldPrice: string | null;
  currency: string | null;
  availability: string | null;
  visible: boolean;
  active: boolean;
  primaryImageUrl: string | null;
  canonicalUrl: string | null;
  popularity: string | null;
  stickers?: Array<{ id: string; title: string }>;
  conditionLabel?: string | null;
  updatedAt: string;
  modifications: HoroshopCatalogModification[];
}

export interface HoroshopCatalogCategory {
  externalId: string;
  parentExternalId: string | null;
  titles: HoroshopLocalizedText;
  productCount: number;
}

export interface HoroshopCatalogFeed {
  integration: HoroshopIntegration;
  items: HoroshopCatalogProduct[];
  categories: HoroshopCatalogCategory[];
  availabilityOptions: string[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface HoroshopCatalogParams {
  search?: string;
  category?: string;
  availability?: string;
  visibility?: HoroshopCatalogVisibility;
  state?: HoroshopCatalogState;
  page?: number;
  pageSize?: number;
}
