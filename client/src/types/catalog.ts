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
  logoUrl: string;
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
  brand: { id: string; label: string; directoryId?: string; directoryLabel?: string; logoUrl?: string } | null;
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

export interface CatalogStorefrontFilterOption {
  value: string;
  label: string;
  count: number;
  colorHex?: string;
}

export interface CatalogStorefrontCharacteristicFilter {
  key: string;
  label: string;
  type: CatalogCharacteristicFieldType;
  unit: string;
  options: CatalogStorefrontFilterOption[];
}

export interface CatalogStorefrontFilters {
  brands: CatalogStorefrontFilterOption[];
  price: {
    min: number;
    max: number;
  };
  characteristics: CatalogStorefrontCharacteristicFilter[];
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
  filters?: CatalogStorefrontFilters;
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
  identityKey?: string;
  brandId?: string | null;
  brandLabel?: string;
  templateId?: string | null;
  templateLabel?: string;
  characteristicCount?: number;
  matchReason?: string;
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

export interface CatalogImportTemplateColumn {
  key: string;
  label: string;
  width: number;
  example: string | number;
  required?: boolean;
  description: string;
}

export interface CatalogImportTemplateField {
  id: string;
  templateId: string;
  key: string;
  label: string;
  type: CatalogCharacteristicFieldType;
  unit: string;
  options: string[];
  required: boolean;
  filterable: boolean;
  isModifier: boolean;
  sortOrder: number;
  header: string;
}

export interface CatalogImportTemplateDefinition {
  id: string;
  label: string;
  description: string;
  updatedAt: string;
  fields: CatalogImportTemplateField[];
}

export interface CatalogImportTemplateSchema {
  version: number;
  source: string;
  clearToken: string;
  columns: CatalogImportTemplateColumn[];
  templates: CatalogImportTemplateDefinition[];
  brands: Array<{
    id: string;
    label: string;
    directoryId: string;
    directoryLabel: string;
  }>;
}

export interface CatalogStorefrontSettings {
  selectedFormPublicId: string | null;
  publicOrigin: string;
  storefrontTheme: CatalogStorefrontTheme;
  productCardTheme: CatalogProductCardTheme;
  productPageTheme: CatalogProductPageTheme;
  updatedAt: string | null;
}

export type CatalogStorefrontFontFamily = 'Inter' | 'Unbounded' | 'Montserrat' | 'Roboto';
export type CatalogThemeShadow = 'none' | 'soft' | 'strong';

export interface CatalogStorefrontTheme {
  version: 1;
  typography: {
    bodyFontFamily: CatalogStorefrontFontFamily;
    headingFontFamily: CatalogStorefrontFontFamily;
    bodyWeight: number;
    headingWeight: number;
    baseSize: number;
  };
  colors: {
    pageBackground: string;
    surface: string;
    text: string;
    muted: string;
    accent: string;
    action: string;
    border: string;
  };
  layout: {
    maxWidth: number;
    pagePaddingDesktop: number;
    pagePaddingTablet: number;
    pagePaddingMobile: number;
    sectionGap: number;
    catalogGap: number;
    gridGap: number;
    filterWidth: number;
    columnsDesktop: number;
    columnsTablet: number;
    columnsMobile: number;
  };
  header: {
    visible: boolean;
    sticky: boolean;
    height: number;
    paddingX: number;
    paddingY: number;
    background: string;
    borderColor: string;
    borderWidth: number;
    radius: number;
    shadow: CatalogThemeShadow;
    brandText: string;
    brandMark: string;
    logoUrl: string;
    logoLink: string;
    logoHeight: number;
    brandSize: number;
    actionVisible: boolean;
  };
  hero: {
    visible: boolean;
    eyebrowVisible: boolean;
    eyebrowText: string;
    title: string;
    subtitle: string;
    alignment: 'left' | 'center' | 'right';
    titleSizeDesktop: number;
    titleSizeMobile: number;
    paddingX: number;
    paddingY: number;
    backgroundStart: string;
    backgroundEnd: string;
    gradientAngle: number;
    radius: number;
  };
  controls: {
    searchPlaceholder: string;
    sortVisible: boolean;
    height: number;
    radius: number;
    background: string;
    borderColor: string;
  };
  filters: {
    visible: boolean;
    sticky: boolean;
    background: string;
    borderColor: string;
    titleColor: string;
    resetColor: string;
    groupTitleColor: string;
    optionTextColor: string;
    countColor: string;
    dividerColor: string;
    activeColor: string;
    activeMarkColor: string;
    inactiveControlBorderColor: string;
    inputBackground: string;
    inputBorderColor: string;
    inputTextColor: string;
    buttonBackground: string;
    buttonBorderColor: string;
    buttonTextColor: string;
    rangeTrackColor: string;
    rangeThumbBackground: string;
    rangeThumbBorderColor: string;
    mobileOverlayColor: string;
    mobileButtonBackground: string;
    mobileButtonTextColor: string;
    radius: number;
    padding: number;
    groupGap: number;
    shadow: CatalogThemeShadow;
    showCounts: boolean;
  };
}

export type CatalogProductCardContentKey = 'image' | 'badge' | 'brand' | 'title' | 'meta';

export interface CatalogProductCardTheme {
  version: 1;
  container: {
    background: string;
    borderColor: string;
    borderWidth: number;
    radius: number;
    padding: number;
    gap: number;
    shadow: CatalogThemeShadow;
    hoverShadow: CatalogThemeShadow;
    hoverLift: number;
  };
  image: {
    aspectRatio: '1 / 1' | '4 / 3' | '3 / 4' | '16 / 9';
    fit: 'contain' | 'cover';
    background: string;
    radius: number;
    padding: number;
    hoverZoom: number;
  };
  visibility: Record<'image' | 'badge' | 'brand' | 'title' | 'meta' | 'availability' | 'modifications' | 'price' | 'button', boolean>;
  contentOrder: CatalogProductCardContentKey[];
  badge: {
    textColor: string;
    background: string;
    radius: number;
    fontSize: number;
    fontWeight: number;
    paddingX: number;
    paddingY: number;
  };
  typography: {
    brandColor: string;
    brandSize: number;
    brandWeight: number;
    titleColor: string;
    titleSize: number;
    titleWeight: number;
    titleLines: number;
    metaColor: string;
    metaSize: number;
    priceColor: string;
    priceSize: number;
    priceWeight: number;
  };
  button: {
    label: string;
    unavailableLabel: string;
    background: string;
    hoverBackground: string;
    textColor: string;
    radius: number;
    height: number;
    fontSize: number;
    fontWeight: number;
    fullWidth: boolean;
  };
  modifications: {
    mode: 'hover' | 'always' | 'hidden';
    labelColor: string;
    optionBackground: string;
    optionTextColor: string;
    optionBorderColor: string;
    activeBackground: string;
    activeTextColor: string;
    activeBorderColor: string;
    radius: number;
    optionHeight: number;
    swatchSize: number;
  };
}

export interface CatalogProductPageTheme {
  version: 1;
  layout: {
    galleryWidth: number;
    gap: number;
    sectionGap: number;
  };
  gallery: {
    background: string;
    borderColor: string;
    borderWidth: number;
    radius: number;
    padding: number;
    imageFit: 'contain' | 'cover';
    imageScale: number;
    thumbnailHeight: number;
    thumbnailGap: number;
    showThumbnails: boolean;
    showArrows: boolean;
    showCounter: boolean;
  };
  details: {
    background: string;
    borderColor: string;
    borderWidth: number;
    radius: number;
    padding: number;
    gap: number;
    shadow: CatalogThemeShadow;
  };
  visibility: {
    backLink: boolean;
    meta: boolean;
    shortDescription: boolean;
    quickSpecs: boolean;
    modifications: boolean;
    tabs: boolean;
  };
  typography: {
    titleColor: string;
    titleSizeDesktop: number;
    titleSizeMobile: number;
    titleWeight: number;
    priceColor: string;
    priceSize: number;
    priceWeight: number;
    leadColor: string;
    leadSize: number;
  };
  button: {
    label: string;
    unavailableLabel: string;
    previewLabel: string;
    background: string;
    hoverBackground: string;
    textColor: string;
    radius: number;
    height: number;
    fontSize: number;
    fontWeight: number;
  };
  tabs: {
    descriptionLabel: string;
    characteristicsLabel: string;
    background: string;
    borderColor: string;
    textColor: string;
    activeColor: string;
    radius: number;
    padding: number;
  };
}
