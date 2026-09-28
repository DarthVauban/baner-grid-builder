export interface Sticker { id: string; title: string }
export interface StickerDirectoryEntry { externalId: string; title: string; enabled: boolean; manual: boolean }
export interface StickerProduct {
  id: string; externalId: string; sku: string; titles: Record<string, string>; brand: string | null;
  categoryExternalId: string | null; price: string | null; availability: string | null; visible: boolean;
  imageUrl: string | null; canonicalUrl: string | null; stickers: Sticker[]; horoshopCreatedAt: string;
  modifications: Array<{ id: string; sku: string; titles: Record<string, string>; price: string | null; availability: string | null; visible: boolean; stickers: Sticker[] }>;
}
export interface StickerFilters {
  search?: string; category?: string; includeChildren?: boolean; brand?: string; availability?: string;
  visibility?: 'all' | 'visible' | 'hidden'; priceMin?: number; priceMax?: number; createdFrom?: string; createdTo?: string;
  stickerMode?: 'all' | 'present' | 'missing' | 'none'; stickerId?: string; page?: number; pageSize?: number;
}
export interface StickerCatalog {
  items: StickerProduct[]; total: number; page: number; pageSize: number; pageCount: number;
  storeDomain: string; lastSyncAt: string | null; canConfigure: boolean; directoryWarning?: string | null;
  directory: StickerDirectoryEntry[]; categories: Array<{ externalId: string; parentExternalId: string | null; title: string }>;
  brands: string[]; availabilityOptions: string[];
}
export type StickerItemStatus = 'pending' | 'writing' | 'succeeded' | 'unchanged' | 'failed' | 'conflict' | 'cancelled';
export type StickerOperationStatus = 'draft' | 'queued' | 'running' | 'completed' | 'partial' | 'stopped';
export interface StickerOperationSummary { id: string; name: string; kind: 'change' | 'rollback' | 'retry'; status: StickerOperationStatus; actorName: string; createdAt: string }
export interface StickerOperationItem {
  id: string; productId: string; externalId: string; article: string; title: string; membership: string[];
  before: Sticker[]; after: Sticker[]; addIds: string[]; removeIds: string[]; status: StickerItemStatus; message: string;
}
export interface StickerOperation extends StickerOperationSummary {
  parentId: string | null; startedAt: string | null; completedAt: string | null; stopRequested: boolean;
  counts: Partial<Record<StickerItemStatus, number>>; total: number; items: StickerOperationItem[]; page: number; pageCount: number;
}
export interface StickerResolution { productIds: string[]; duplicates: number; unmatched: string[]; ambiguous: Array<{ input: string; candidates: Array<{ id: string; sku: string; title: string }> }> }
export interface StickerSelection { id: string; name: string; productIds: string[] }
export interface StickerPreviewInput { productIds: string[]; addIds: string[]; removeIds: string[]; name?: string }
