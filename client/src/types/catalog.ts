export type CatalogCondition = 'USED' | 'REFURBISHED';
export type CatalogPublicationStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN' | 'ARCHIVED';
export type CatalogAvailabilityStatus = 'in_stock' | 'incoming' | 'unavailable';

export interface CatalogAvailability {
  status: CatalogAvailabilityStatus;
  label: string;
}

export interface CatalogBrand {
  id: string;
  directoryId: string;
  directoryLabel: string;
  label: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogBrandDirectory {
  id: string;
  label: string;
  description: string;
  active: boolean;
  sortOrder: number;
  brandCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogGalleryItem {
  url: string;
  alt: string;
}

export interface CatalogMediaAsset {
  id: string;
  productId: string | null;
  url: string;
  originalUrl: string;
  mimeType: string;
  originalMimeType: string;
  size: number;
  originalSize: number;
  width: number | null;
  height: number | null;
  alt: string;
  role: 'main' | 'gallery';
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type CatalogCharacteristicFieldType = 'text' | 'number' | 'select' | 'multiselect' | 'boolean' | 'color';

export interface CatalogCharacteristicField {
  id?: string;
  templateId?: string;
  key: string;
  label: string;
  type: CatalogCharacteristicFieldType;
  unit: string;
  options: string[];
  required: boolean;
  filterable: boolean;
  isModifier: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CatalogCharacteristicTemplate {
  id: string;
  label: string;
  description: string;
  active: boolean;
  sortOrder: number;
  fields: CatalogCharacteristicField[];
  createdAt: string;
  updatedAt: string;
}

export interface CatalogCharacteristicTemplateInput {
  label: string;
  description: string;
  active: boolean;
  sortOrder: number;
  fields: CatalogCharacteristicField[];
}

export interface CatalogProductCharacteristics {
  templateId: string | null;
  values: Record<string, unknown>;
}

export interface CatalogProductCharacteristicItem {
  key: string;
  label: string;
  type: CatalogCharacteristicFieldType;
  value: unknown;
  displayValue: string;
  unit: string;
  filterable: boolean;
  isModifier: boolean;
  sortOrder: number;
}

export interface CatalogProductCharacteristicSet {
  templateId: string | null;
  templateLabel: string;
  items: CatalogProductCharacteristicItem[];
}

export interface CatalogProductGroup {
  id: string;
  label: string;
  slug: string;
  active: boolean;
  mainProductId: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogProductGroupItem {
  id: string;
  productCode: string;
  name: string;
  slug: string;
  publicPath: string;
  conditionLabel: string;
  priceUah: number;
  priceLabel: string;
  stockCount?: number;
  incomingCount?: number;
  availability: CatalogAvailability;
  mainImageUrl: string;
}

export interface CatalogProductModificationOption {
  id: string;
  value: string;
  label: string;
  selected: boolean;
  compatible: boolean;
  product: Pick<CatalogProduct, 'id' | 'productCode' | 'name' | 'slug' | 'publicPath' | 'priceLabel' | 'availability' | 'mainImageUrl'> | null;
}

export interface CatalogProductModificationParameter {
  id: string;
  key: string;
  label: string;
  currentValueId: string | null;
  currentValueLabel: string;
  options: CatalogProductModificationOption[];
}

export interface CatalogProductModificationSet {
  groupId: string | null;
  groupLabel: string;
  groupSlug: string;
  mainProductId: string | null;
  isMain: boolean;
  items: CatalogProductGroupItem[];
  parameters: CatalogProductModificationParameter[];
}

export interface CatalogProductGroupSummary {
  groupId: string;
  groupLabel: string;
  mainProductId: string | null;
  isMain: boolean;
  childCount: number;
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
  brand: { id: string; label: string; directoryId?: string; directoryLabel?: string } | null;
  mainImageUrl: string;
  gallery: CatalogGalleryItem[];
  shortDescription: string;
  description: string;
  descriptionHtml?: string;
  descriptionCss?: string;
  descriptionJs?: string;
  descriptionHasJs?: boolean;
  characteristics?: CatalogProductCharacteristicSet;
  modifications?: CatalogProductModificationSet;
  modificationGroup?: CatalogProductGroupSummary | null;
  modificationChildren?: CatalogProduct[];
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
