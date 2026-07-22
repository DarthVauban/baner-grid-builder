import type {
  CatalogCondition,
  CatalogProduct,
  CatalogProductInput,
  CatalogPublicationStatus
} from '../types/catalog';

export const catalogConditionLabels: Record<CatalogCondition, string> = {
  USED: 'Вживаний',
  REFURBISHED: 'Відновлений'
};

export const catalogPublicationStatusLabels: Record<CatalogPublicationStatus, string> = {
  DRAFT: 'Чернетка',
  PUBLISHED: 'Опубліковано',
  HIDDEN: 'Приховано',
  ARCHIVED: 'Архів'
};

export const catalogConditionOptions = Object.entries(catalogConditionLabels)
  .map(([value, label]) => ({ value: value as CatalogCondition, label }));

export const catalogPublicationStatusOptions = Object.entries(catalogPublicationStatusLabels)
  .map(([value, label]) => ({ value: value as CatalogPublicationStatus, label }));

export const emptyCatalogProductInput: CatalogProductInput = {
  name: '',
  condition: 'USED',
  stockCount: 0,
  incomingCount: 0,
  priceUah: 0,
  popularityPosition: 0,
  publicationStatus: 'DRAFT',
  slug: '',
  brandId: null,
  mainImageUrl: '',
  gallery: [],
  shortDescription: '',
  description: '',
  seoTitle: '',
  seoDescription: '',
  socialDescription: '',
  bodyCondition: '',
  displayCondition: '',
  batteryHealth: '',
  warranty: '',
  includedAccessories: '',
  diagnostics: {},
  internalNotes: ''
};

export function productToInput(product: CatalogProduct): CatalogProductInput {
  return {
    name: product.name,
    condition: product.condition,
    stockCount: product.stockCount,
    incomingCount: product.incomingCount,
    priceUah: product.priceUah,
    popularityPosition: product.popularityPosition,
    publicationStatus: product.publicationStatus,
    slug: product.slug,
    brandId: product.brand?.id || null,
    mainImageUrl: product.mainImageUrl,
    gallery: product.gallery,
    shortDescription: product.shortDescription,
    description: product.description,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    socialDescription: product.socialDescription,
    bodyCondition: product.bodyCondition,
    displayCondition: product.displayCondition,
    batteryHealth: product.batteryHealth,
    warranty: product.warranty,
    includedAccessories: product.includedAccessories,
    diagnostics: product.diagnostics,
    internalNotes: product.internalNotes || ''
  };
}

export function formatCatalogDate(value: string): string {
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}
