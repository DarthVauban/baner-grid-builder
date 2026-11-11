import type { HoroshopIntegration } from './integration';

export type FeedChoice = 'keep' | 'enable' | 'disable';
export type FeedAction = Record<'google' | 'facebook', FeedChoice>;
export type FeedState = 'enabled' | 'disabled' | 'mixed' | 'unknown';
export type FeedOperationStatus = 'draft' | 'queued' | 'running' | 'completed' | 'partial' | 'conflict' | 'failed';
export type FeedItemStatus = 'pending' | 'writing' | 'succeeded' | 'unchanged' | 'failed' | 'conflict' | 'cancelled';
export interface FeedFilters {
  search: string; category: string; brands: string[]; availability: string;
  google: FeedState | ''; facebook: FeedState | '';
}
export interface FeedOffer { article: string; marketplaces: string[] | null }
export interface FeedProduct {
  id: string; externalId: string; sku: string; title: string; titles: Record<string, string>;
  brand: string | null; categoryExternalId: string | null; availability: string | null;
  imageUrl: string | null; pageUrl: string | null; marketplaces: string[] | null;
  google: FeedState; facebook: FeedState;
  modifications: Array<{ id: string; sku: string; titles: Record<string, string>; marketplaces: string[] | null }>;
}
export interface FeedCatalog {
  integration: HoroshopIntegration; items: FeedProduct[];
  categories: Array<{ externalId: string; title: string }>; brands: string[]; availabilityOptions: string[];
  matchingProductIds?: string[]; total: number; page: number; pageSize: number; pageCount: number;
}
export interface FeedResolution {
  matched: Array<{ input: string; productId: string; sku: string; title: string }>;
  ambiguous: Array<{ input: string; candidates: Array<{ productId: string; sku: string; title: string }> }>;
  unmatched: string[];
}
export interface FeedOperationItem {
  id: string; productId: string; externalId: string; article: string; title: string; articles: string[];
  before: FeedOffer[]; target: FeedOffer[]; observed: Array<{ article: string; marketplaces: string[] | null }> | null;
  resolvedBefore: FeedOffer[] | null; resolvedTarget: FeedOffer[] | null;
  status: FeedItemStatus; message: string;
}
export interface FeedHistoryItem {
  id: string; action: FeedAction; status: FeedOperationStatus; actorUserId: string | null;
  createdAt: string; startedAt: string | null; completedAt: string | null;
  total: number; confirmed: number; problems: number;
}
export interface FeedOperation extends Omit<FeedHistoryItem, 'confirmed' | 'problems'> {
  errorMessage: string; counts: Partial<Record<FeedItemStatus, number>>; items: FeedOperationItem[];
}
