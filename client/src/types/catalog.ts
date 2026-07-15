export type CatalogCondition = 'USED' | 'REFURBISHED';
export type CatalogPublicationStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN' | 'ARCHIVED';
export type CatalogAvailabilityStatus = 'in_stock' | 'incoming' | 'unavailable';

export interface CatalogAvailability {
  status: CatalogAvailabilityStatus;
  label: string;
}

export interface CatalogBrand {
  id: string;
  label: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogGalleryItem {
  url: string;
  alt: string;
}

export interface CatalogProduct {
  id: string;
  productCode: string;
  name: string;
  normalizedName?: string;
  condition: CatalogCondition;
  conditionLabel: string;
  stockCount: number;
  incomingCount: number;
  availability: CatalogAvailability;
  priceUah: number;
  priceLabel: string;
  publicationStatus: CatalogPublicationStatus;
  publicationStatusLabel: string;
  slug: string;
  publicPath: string;
  brand: { id: string; label: string } | null;
  mainImageUrl: string;
  gallery: CatalogGalleryItem[];
  shortDescription: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  socialDescription: string;
  bodyCondition: string;
  displayCondition: string;
  batteryHealth: string;
  warranty: string;
  includedAccessories: string;
  diagnostics: Record<string, unknown>;
  internalNotes?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogProductInput {
  name: string;
  condition: CatalogCondition;
  stockCount: number;
  incomingCount: number;
  priceUah: number;
  publicationStatus: CatalogPublicationStatus;
  slug: string;
  brandId: string | null;
  mainImageUrl: string;
  gallery: CatalogGalleryItem[];
  shortDescription: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  socialDescription: string;
  bodyCondition: string;
  displayCondition: string;
  batteryHealth: string;
  warranty: string;
  includedAccessories: string;
  diagnostics: Record<string, unknown>;
  internalNotes: string;
}

export interface CatalogFeed {
  items: CatalogProduct[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface CatalogSummary {
  total: number;
  byStatus: {
    draft: number;
    published: number;
    hidden: number;
    archived: number;
  };
  byAvailability: {
    inStock: number;
    incoming: number;
    unavailable: number;
  };
}

export interface CatalogImportRow {
  rowNumber: number;
  name: string;
  condition: CatalogCondition | '';
  conditionLabel: string;
  stockCount: number | null;
  incomingCount: number | null;
  priceUah: number | null;
  action: 'create' | 'update' | 'conflict' | 'error' | 'skipped' | 'pending';
  result: 'ready' | 'created' | 'updated' | 'conflict' | 'error' | 'skipped' | 'pending';
  reason: string;
  productId?: string | null;
  productCode?: string;
}

export interface CatalogImportSummary {
  total: number;
  create: number;
  update: number;
  conflict: number;
  error: number;
  skipped: number;
  pending: number;
}

export interface CatalogImportPreview {
  rows: CatalogImportRow[];
  summary: CatalogImportSummary;
  importId?: string;
}

export interface CatalogStorefrontSettings {
  selectedFormPublicId: string | null;
  publicOrigin: string;
  updatedAt: string | null;
}
