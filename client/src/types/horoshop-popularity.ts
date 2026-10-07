import type { HoroshopIntegration } from './integration';

export type PopularityAction = 'set' | 'add' | 'reset';
export type PopularityFilter = 'all' | 'zero' | 'positive' | 'range';
export type PopularityOperationStatus = 'draft' | 'queued' | 'running' | 'completed' | 'partial' | 'conflict' | 'failed';
export type PopularityItemStatus = 'pending' | 'writing' | 'succeeded' | 'unchanged' | 'failed' | 'conflict' | 'cancelled';

export interface PopularityFilters {
  search: string;
  category: string;
  brands: string[];
  availability: string;
  popularity: PopularityFilter;
  popularityMin: number;
  popularityMax: number;
}

export interface PopularityProduct {
  id: string;
  externalId: string;
  sku: string;
  titles: Record<string, string>;
  title: string;
  brand: string | null;
  categoryExternalId: string | null;
  availability: string | null;
  popularity: string | null;
  imageUrl: string | null;
  pageUrl: string | null;
  modifications: Array<{ id: string; sku: string; titles: Record<string, string> }>;
}

export interface PopularityCatalog {
  integration: HoroshopIntegration;
  items: PopularityProduct[];
  categories: Array<{ externalId: string; title: string }>;
  brands: string[];
  availabilityOptions: string[];
  maximumPopularity: number;
  matchingProductIds?: string[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface PopularityResolution {
  matched: Array<{ input: string; productId: string; sku: string; title: string }>;
  ambiguous: Array<{ input: string; candidates: Array<{ productId: string; sku: string; title: string }> }>;
  unmatched: string[];
}

export interface PopularityOperationItem {
  id: string;
  productId: string;
  externalId: string;
  article: string;
  title: string;
  articles: string[];
  before: number;
  target: number;
  observed: number | null;
  status: PopularityItemStatus;
  message: string;
}

export interface PopularityOperation {
  id: string;
  action: PopularityAction;
  value: number;
  status: PopularityOperationStatus;
  errorMessage: string;
  actorUserId: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  counts: Partial<Record<PopularityItemStatus, number>>;
  total: number;
  items: PopularityOperationItem[];
}

export interface PopularityHistoryItem {
  id: string;
  action: PopularityAction;
  value: number;
  status: PopularityOperationStatus;
  actorUserId: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  total: number;
  confirmed: number;
  problems: number;
}
