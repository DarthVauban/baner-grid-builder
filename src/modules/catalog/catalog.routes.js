import { Router, raw } from 'express';
import { z } from 'zod';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import { cleanText, cleanUrl } from '../applications/application.service.js';
import { createPublicApplication } from '../applications/public.routes.js';
import { publishChatUpdates } from '../chat/chat.events.js';
import { canSaveCatalogSourceJs, prepareCatalogDescription } from './catalog.content.js';
import {
  publishCatalogUpdates,
  publishPublicCatalogUpdate,
  subscribeToCatalogUpdates
} from './catalog.events.js';
import { saveCatalogMediaAsset } from './catalog.media.js';
import { cacheSavedStorefrontOrigin, normalizeStorefrontOrigin } from './storefront.domain.js';
import {
  normalizeProductCardTheme,
  normalizeProductPageTheme,
  normalizeStorefrontTheme,
  storefrontFontFamilies
} from './storefront.theme.js';
import {
  analyzeImportRows,
  attachCatalogProductCharacteristics,
  appendStorefrontProductFilters,
  attachPublicCatalogProductListDetails,
  attachCatalogProductGroups,
  catalogAuditChanges,
  catalogAuditProductState,
  catalogProductSnapshot,
  catalogToolId,
  commitImportRows,
  conditionLabels,
  generateProductCode,
  getCatalogRecipientIds,
  loadCatalogImportSchema,
  loadCatalogProduct,
  loadProductCharacteristicSet,
  loadProductModificationSet,
  loadPreviewProduct,
  loadStorefrontProductFilters,
  logCatalogAudit,
  makeUniqueSlug,
  normalizeCatalogSerial,
  normalizeProductName,
  normalizeStorefrontCharacteristicFilters,
  productConditions,
  productSelect,
  publicationStatuses,
  publicationStatusLabels,
  serializeBrand,
  serializeBrandDirectory,
  serializeCatalogProduct,
  serializePublicCatalogProduct,
  validatePublicationReady
} from './catalog.service.js';

const router = Router();
router.use(requireAuth, requireToolAccess(catalogToolId));

const idSchema = z.string().uuid();
const listSchema = z.object({
  search: z.string().trim().max(120).default(''),
  condition: z.enum(['all', ...productConditions]).default('all'),
  status: z.enum(['all', ...publicationStatuses]).default('all'),
  availability: z.enum(['all', 'in_stock', 'incoming', 'unavailable']).default('all'),
  conditions: z.string().trim().max(200).default(''),
  statuses: z.string().trim().max(300).default(''),
  availabilities: z.string().trim().max(200).default(''),
  brandId: z.string().uuid().optional(),
  brandIds: z.string().trim().max(4000).default(''),
  brandDirectoryIds: z.string().trim().max(4000).default(''),
  templateIds: z.string().trim().max(4000).default(''),
  priceMin: z.coerce.number().min(0).optional(),
  priceMax: z.coerce.number().min(0).optional(),
  stockMin: z.coerce.number().int().min(0).optional(),
  stockMax: z.coerce.number().int().min(0).optional(),
  incomingMin: z.coerce.number().int().min(0).optional(),
  incomingMax: z.coerce.number().int().min(0).optional(),
  photoStatus: z.enum(['all', 'present', 'missing']).default('all'),
  descriptionStatus: z.enum(['all', 'present', 'missing']).default('all'),
  characteristicsStatus: z.enum(['all', 'present', 'missing']).default('all'),
  serialStatus: z.enum(['all', 'present', 'missing']).default('all'),
  readiness: z.enum(['all', 'ready', 'not_ready']).default('all'),
  modification: z.enum(['all', 'ungrouped', 'main', 'child']).default('all'),
  createdFrom: z.string().trim().pipe(z.iso.date()).optional(),
  createdTo: z.string().trim().pipe(z.iso.date()).optional(),
  updatedFrom: z.string().trim().pipe(z.iso.date()).optional(),
  updatedTo: z.string().trim().pipe(z.iso.date()).optional(),
  productList: z.string().max(40000).default(''),
  characteristics: z.string().trim().max(12000).default(''),
  sort: z.enum(['popularity', 'updated_desc', 'name_asc', 'price_asc', 'price_desc', 'stock_asc', 'stock_desc']).default('updated_desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25)
});
const galleryItemSchema = z.object({
  url: z.string().trim().max(4000),
  alt: z.string().trim().max(240).default('')
});
const productInputSchema = z.object({
  name: z.string().trim().min(1).max(240),
  condition: z.enum(productConditions),
  stockCount: z.coerce.number().int().min(0).default(0),
  incomingCount: z.coerce.number().int().min(0).default(0),
  priceUah: z.coerce.number().min(0).max(99999999).default(0),
  popularityPosition: z.coerce.number().int().min(0).max(1000000).default(0),
  publicationStatus: z.enum(publicationStatuses).default('DRAFT'),
  slug: z.string().trim().max(260).default(''),
  brandId: z.string().uuid().nullable().optional(),
  mainImageUrl: z.string().trim().max(4000).default(''),
  gallery: z.array(galleryItemSchema).max(20).default([]),
  shortDescription: z.string().trim().max(1200).default(''),
  description: z.string().trim().max(120000).default(''),
  seoTitle: z.string().trim().max(240).default(''),
  seoDescription: z.string().trim().max(500).default(''),
  socialDescription: z.string().trim().max(500).default(''),
  bodyCondition: z.string().trim().max(120).default(''),
  displayCondition: z.string().trim().max(120).default(''),
  batteryHealth: z.string().trim().max(120).default(''),
  warranty: z.string().trim().max(160).default(''),
  includedAccessories: z.string().trim().max(3000).default(''),
  diagnostics: z.record(z.string(), z.unknown()).default({}),
  internalNotes: z.string().trim().max(6000).default('')
});
const updateProductSchema = productInputSchema.extend({
  expectedVersion: z.coerce.number().int().min(1)
});
const statusSchema = z.object({
  status: z.enum(publicationStatuses),
  expectedVersion: z.coerce.number().int().min(1)
});
const deleteProductSchema = z.object({
  expectedVersion: z.coerce.number().int().min(1),
  groupAction: z.enum(['disband', 'promote']).optional(),
  newMainProductId: z.string().uuid().nullable().optional()
});
const brandDirectoryInputSchema = z.object({
  label: z.string().trim().min(1).max(180),
  description: z.string().trim().max(2000).default(''),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(-9999).max(9999).default(0)
});
const brandListSchema = z.object({
  directoryId: z.string().uuid().optional(),
  active: z.enum(['all', 'active']).default('all')
});
const brandInputSchema = z.object({
  directoryId: z.string().uuid(),
  label: z.string().trim().min(1).max(160),
  logoUrl: z.string().trim().max(4000).default(''),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(-9999).max(9999).default(0)
});
const brandBulkSchema = z.object({
  directoryId: z.string().uuid(),
  labels: z.array(z.string().trim().min(1).max(160)).min(1).max(1000)
});
const characteristicFieldSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().trim().max(120).default(''),
  label: z.string().trim().min(1).max(180),
  type: z.enum(['text', 'number', 'select', 'multiselect', 'boolean', 'color']).default('text'),
  unit: z.string().trim().max(40).default(''),
  options: z.array(z.string().trim().min(1).max(160)).max(80).default([]),
  required: z.boolean().default(false),
  filterable: z.boolean().default(false),
  isModifier: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(-9999).max(9999).default(0)
});
const characteristicTemplateSchema = z.object({
  label: z.string().trim().min(1).max(180),
  description: z.string().trim().max(2000).default(''),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(-9999).max(9999).default(0),
  fields: z.array(characteristicFieldSchema).max(100).default([])
});
const productCharacteristicsSchema = z.object({
  templateId: z.string().uuid(),
  values: z.record(z.string(), z.unknown()).default({}),
  expectedVersion: z.coerce.number().int().min(1)
});
const modificationValueSchema = z.object({
  id: z.string().uuid().optional(),
  value: z.string().trim().max(160).default(''),
  label: z.string().trim().min(1).max(180),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(-9999).max(9999).default(0)
});
const modificationParameterSchema = z.object({
  key: z.string().trim().max(120).default(''),
  label: z.string().trim().min(1).max(180),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(-9999).max(9999).default(0),
  values: z.array(modificationValueSchema).max(120).default([])
});
const productModificationsSchema = z.object({
  groupId: z.string().uuid().nullable().optional(),
  groupLabel: z.string().trim().max(240).default(''),
  mainProductId: z.string().uuid().nullable().optional(),
  productIds: z.array(z.string().uuid()).max(80).default([]),
  expectedVersion: z.coerce.number().int().min(1)
});
const importPreviewSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).max(5000).default([])
});
const importCommitSchema = importPreviewSchema.extend({
  importNew: z.boolean().default(true),
  updateExisting: z.boolean().default(true)
});
const auditHistorySchema = z.object({
  search: z.string().trim().max(240).default(''),
  source: z.enum(['all', 'manual', 'xlsx']).default('all'),
  category: z.enum(['all', 'products', 'publication', 'media', 'characteristics', 'modifications', 'settings', 'import']).default('all'),
  actorId: z.string().uuid().optional(),
  dateFrom: z.string().trim().pipe(z.iso.date()).optional(),
  dateTo: z.string().trim().pipe(z.iso.date()).optional(),
  page: z.coerce.number().int().min(1).max(200).default(1),
  pageSize: z.coerce.number().int().min(10).max(50).default(25)
});
const importHistoryDetailSchema = z.object({
  page: z.coerce.number().int().min(1).max(200).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(50)
});
const themeColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
const themeShadowSchema = z.enum(['none', 'soft', 'strong']);
const themeFontWeightSchema = z.coerce.number().int().min(200).max(900).refine((value) => value % 100 === 0);
const storefrontThemeSchema = z.object({
  version: z.literal(1).default(1),
  typography: z.object({
    bodyFontFamily: z.enum(storefrontFontFamilies),
    headingFontFamily: z.enum(storefrontFontFamilies),
    bodyWeight: themeFontWeightSchema,
    headingWeight: themeFontWeightSchema,
    baseSize: z.coerce.number().int().min(12).max(22)
  }),
  colors: z.object({
    pageBackground: themeColorSchema,
    surface: themeColorSchema,
    text: themeColorSchema,
    muted: themeColorSchema,
    accent: themeColorSchema,
    action: themeColorSchema,
    border: themeColorSchema
  }),
  layout: z.object({
    maxWidth: z.coerce.number().int().min(960).max(1920),
    pagePaddingDesktop: z.coerce.number().int().min(0).max(120),
    pagePaddingTablet: z.coerce.number().int().min(0).max(80),
    pagePaddingMobile: z.coerce.number().int().min(0).max(40),
    sectionGap: z.coerce.number().int().min(0).max(80),
    catalogGap: z.coerce.number().int().min(0).max(60),
    gridGap: z.coerce.number().int().min(0).max(48),
    filterWidth: z.coerce.number().int().min(200).max(420),
    columnsDesktop: z.coerce.number().int().min(2).max(6),
    columnsTablet: z.coerce.number().int().min(1).max(4),
    columnsMobile: z.coerce.number().int().min(1).max(2)
  }),
  header: z.object({
    visible: z.boolean(),
    sticky: z.boolean(),
    height: z.coerce.number().int().min(44).max(140),
    paddingX: z.coerce.number().int().min(0).max(80),
    paddingY: z.coerce.number().int().min(0).max(50),
    background: themeColorSchema,
    borderColor: themeColorSchema,
    borderWidth: z.coerce.number().int().min(0).max(6),
    radius: z.coerce.number().int().min(0).max(40),
    shadow: themeShadowSchema,
    brandText: z.string().trim().max(80),
    brandMark: z.string().trim().max(8),
    logoUrl: z.string().trim().max(4000),
    logoLink: z.string().trim().max(2000),
    logoHeight: z.coerce.number().int().min(20).max(120),
    brandSize: z.coerce.number().int().min(10).max(34),
    actionVisible: z.boolean()
  }),
  hero: z.object({
    visible: z.boolean(),
    eyebrowVisible: z.boolean(),
    eyebrowText: z.string().trim().max(100),
    title: z.string().trim().max(180),
    subtitle: z.string().trim().max(500),
    alignment: z.enum(['left', 'center', 'right']),
    titleSizeDesktop: z.coerce.number().int().min(22).max(80),
    titleSizeMobile: z.coerce.number().int().min(20).max(56),
    paddingX: z.coerce.number().int().min(0).max(120),
    paddingY: z.coerce.number().int().min(0).max(120),
    backgroundStart: themeColorSchema,
    backgroundEnd: themeColorSchema,
    gradientAngle: z.coerce.number().int().min(0).max(360),
    radius: z.coerce.number().int().min(0).max(60)
  }),
  controls: z.object({
    searchPlaceholder: z.string().trim().max(160),
    sortVisible: z.boolean(),
    height: z.coerce.number().int().min(34).max(72),
    radius: z.coerce.number().int().min(0).max(36),
    background: themeColorSchema,
    borderColor: themeColorSchema
  }),
  filters: z.object({
    visible: z.boolean(),
    sticky: z.boolean(),
    background: themeColorSchema,
    borderColor: themeColorSchema,
    titleColor: themeColorSchema,
    resetColor: themeColorSchema,
    groupTitleColor: themeColorSchema,
    optionTextColor: themeColorSchema,
    countColor: themeColorSchema,
    dividerColor: themeColorSchema,
    activeColor: themeColorSchema,
    activeMarkColor: themeColorSchema,
    inactiveControlBorderColor: themeColorSchema,
    inputBackground: themeColorSchema,
    inputBorderColor: themeColorSchema,
    inputTextColor: themeColorSchema,
    buttonBackground: themeColorSchema,
    buttonBorderColor: themeColorSchema,
    buttonTextColor: themeColorSchema,
    rangeTrackColor: themeColorSchema,
    rangeThumbBackground: themeColorSchema,
    rangeThumbBorderColor: themeColorSchema,
    mobileOverlayColor: themeColorSchema,
    mobileButtonBackground: themeColorSchema,
    mobileButtonTextColor: themeColorSchema,
    radius: z.coerce.number().int().min(0).max(40),
    padding: z.coerce.number().int().min(0).max(48),
    groupGap: z.coerce.number().int().min(0).max(40),
    shadow: themeShadowSchema,
    showCounts: z.boolean()
  })
});
const productCardOrderItemSchema = z.enum(['image', 'badge', 'brand', 'title', 'meta']);
const productCardThemeSchema = z.object({
  version: z.literal(1).default(1),
  container: z.object({
    background: themeColorSchema,
    borderColor: themeColorSchema,
    borderWidth: z.coerce.number().int().min(0).max(6),
    radius: z.coerce.number().int().min(0).max(48),
    padding: z.coerce.number().int().min(0).max(48),
    gap: z.coerce.number().int().min(0).max(40),
    shadow: themeShadowSchema,
    hoverShadow: themeShadowSchema,
    hoverLift: z.coerce.number().int().min(0).max(16)
  }),
  image: z.object({
    aspectRatio: z.enum(['1 / 1', '4 / 3', '3 / 4', '16 / 9']),
    fit: z.enum(['contain', 'cover']),
    background: themeColorSchema,
    radius: z.coerce.number().int().min(0).max(48),
    padding: z.coerce.number().int().min(0).max(48),
    hoverZoom: z.coerce.number().min(1).max(1.2)
  }),
  visibility: z.object({
    image: z.boolean(),
    badge: z.boolean(),
    brand: z.boolean(),
    title: z.boolean(),
    meta: z.boolean(),
    availability: z.boolean(),
    modifications: z.boolean(),
    price: z.boolean(),
    button: z.boolean()
  }),
  contentOrder: z.array(productCardOrderItemSchema).length(5).refine((items) => new Set(items).size === 5),
  badge: z.object({
    textColor: themeColorSchema,
    background: themeColorSchema,
    radius: z.coerce.number().int().min(0).max(999),
    fontSize: z.coerce.number().int().min(8).max(22),
    fontWeight: themeFontWeightSchema,
    paddingX: z.coerce.number().int().min(0).max(30),
    paddingY: z.coerce.number().int().min(0).max(20)
  }),
  typography: z.object({
    brandColor: themeColorSchema,
    brandSize: z.coerce.number().int().min(9).max(28),
    brandWeight: themeFontWeightSchema,
    titleColor: themeColorSchema,
    titleSize: z.coerce.number().int().min(10).max(34),
    titleWeight: themeFontWeightSchema,
    titleLines: z.coerce.number().int().min(1).max(5),
    metaColor: themeColorSchema,
    metaSize: z.coerce.number().int().min(8).max(22),
    priceColor: themeColorSchema,
    priceSize: z.coerce.number().int().min(12).max(42),
    priceWeight: themeFontWeightSchema
  }),
  button: z.object({
    label: z.string().trim().min(1).max(60),
    unavailableLabel: z.string().trim().min(1).max(80),
    background: themeColorSchema,
    hoverBackground: themeColorSchema,
    textColor: themeColorSchema,
    radius: z.coerce.number().int().min(0).max(40),
    height: z.coerce.number().int().min(30).max(72),
    fontSize: z.coerce.number().int().min(9).max(24),
    fontWeight: themeFontWeightSchema,
    fullWidth: z.boolean()
  }),
  modifications: z.object({
    mode: z.enum(['hover', 'always', 'hidden']),
    labelColor: themeColorSchema,
    optionBackground: themeColorSchema,
    optionTextColor: themeColorSchema,
    optionBorderColor: themeColorSchema,
    activeBackground: themeColorSchema,
    activeTextColor: themeColorSchema,
    activeBorderColor: themeColorSchema,
    radius: z.coerce.number().int().min(0).max(32),
    optionHeight: z.coerce.number().int().min(24).max(60),
    swatchSize: z.coerce.number().int().min(24).max(60)
  })
});
const productPageThemeSchema = z.object({
  version: z.literal(1).default(1),
  layout: z.object({
    galleryWidth: z.coerce.number().int().min(35).max(65),
    gap: z.coerce.number().int().min(0).max(60),
    sectionGap: z.coerce.number().int().min(0).max(80)
  }),
  gallery: z.object({
    background: themeColorSchema,
    borderColor: themeColorSchema,
    borderWidth: z.coerce.number().int().min(0).max(6),
    radius: z.coerce.number().int().min(0).max(48),
    padding: z.coerce.number().int().min(0).max(48),
    imageFit: z.enum(['contain', 'cover']),
    imageScale: z.coerce.number().int().min(35).max(100),
    thumbnailHeight: z.coerce.number().int().min(54).max(160),
    thumbnailGap: z.coerce.number().int().min(0).max(32),
    showThumbnails: z.boolean(),
    showArrows: z.boolean(),
    showCounter: z.boolean()
  }),
  details: z.object({
    background: themeColorSchema,
    borderColor: themeColorSchema,
    borderWidth: z.coerce.number().int().min(0).max(6),
    radius: z.coerce.number().int().min(0).max(48),
    padding: z.coerce.number().int().min(0).max(72),
    gap: z.coerce.number().int().min(0).max(48),
    shadow: themeShadowSchema
  }),
  visibility: z.object({
    backLink: z.boolean(),
    meta: z.boolean(),
    shortDescription: z.boolean(),
    quickSpecs: z.boolean(),
    modifications: z.boolean(),
    tabs: z.boolean()
  }),
  typography: z.object({
    titleColor: themeColorSchema,
    titleSizeDesktop: z.coerce.number().int().min(24).max(80),
    titleSizeMobile: z.coerce.number().int().min(22).max(56),
    titleWeight: themeFontWeightSchema,
    priceColor: themeColorSchema,
    priceSize: z.coerce.number().int().min(20).max(64),
    priceWeight: themeFontWeightSchema,
    leadColor: themeColorSchema,
    leadSize: z.coerce.number().int().min(11).max(24)
  }),
  button: z.object({
    label: z.string().trim().min(1).max(80),
    unavailableLabel: z.string().trim().min(1).max(100),
    previewLabel: z.string().trim().min(1).max(100),
    background: themeColorSchema,
    hoverBackground: themeColorSchema,
    textColor: themeColorSchema,
    radius: z.coerce.number().int().min(0).max(40),
    height: z.coerce.number().int().min(36).max(80),
    fontSize: z.coerce.number().int().min(11).max(26),
    fontWeight: themeFontWeightSchema
  }),
  tabs: z.object({
    descriptionLabel: z.string().trim().min(1).max(80),
    characteristicsLabel: z.string().trim().min(1).max(80),
    background: themeColorSchema,
    borderColor: themeColorSchema,
    textColor: themeColorSchema,
    activeColor: themeColorSchema,
    radius: z.coerce.number().int().min(0).max(40),
    padding: z.coerce.number().int().min(12).max(72)
  })
});
const settingsSchema = z.object({
  selectedFormPublicId: z.string().uuid().nullable().optional(),
  publicOrigin: z.string().trim().max(500).refine(
    (value) => !value || Boolean(normalizeStorefrontOrigin(value)),
    'Вкажіть повну HTTP(S)-адресу вітрини.'
  ).optional(),
  storefrontTheme: storefrontThemeSchema.optional(),
  productCardTheme: productCardThemeSchema.optional(),
  productPageTheme: productPageThemeSchema.optional()
});
const previewApplicationSchema = z.object({
  values: z.record(z.string(), z.unknown()).default({}),
  context: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().trim().max(160).optional().default(''),
  honeypot: z.string().trim().max(200).optional().default('')
});
const mediaUploadSchema = z.object({
  webpBase64: z.string().min(1),
  webpName: z.string().trim().max(240).default('catalog-photo.webp'),
  originalBase64: z.string().optional().default(''),
  originalName: z.string().trim().max(240).optional().default(''),
  originalMimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']).optional().default('image/webp')
});
const mediaPatchSchema = z.object({
  mainImageUrl: z.string().trim().max(4000).default(''),
  gallery: z.array(galleryItemSchema).max(20).default([]),
  expectedVersion: z.coerce.number().int().min(1)
});

const sortSql = {
  popularity: 'CASE WHEN product.popularity_position > 0 THEN 0 ELSE 1 END ASC, product.popularity_position ASC, product.updated_at DESC, lower(product.name) ASC',
  updated_desc: 'product.updated_at DESC',
  name_asc: 'lower(product.name) ASC, product.created_at DESC',
  price_asc: 'product.price_uah ASC, lower(product.name) ASC',
  price_desc: 'product.price_uah DESC, lower(product.name) ASC',
  stock_asc: 'product.stock_count ASC, lower(product.name) ASC',
  stock_desc: 'product.stock_count DESC, lower(product.name) ASC'
};

function uniqueViolation(error) {
  return error?.code === '23505' || /duplicate key/i.test(String(error?.message || ''));
}

function normalizeBrandLabel(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function uniqueBrandLabels(labels) {
  const seen = new Set();
  const result = [];
  for (const label of labels) {
    const normalized = normalizeBrandLabel(label);
    const key = normalized.toLocaleLowerCase('uk-UA');
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function uniqueCsvValues(value, { allowed = null, uuids = false, limit = 100 } = {}) {
  const seen = new Set();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return String(value || '').split(',').map((item) => item.trim()).filter((item) => {
    if (!item || seen.has(item)) return false;
    if (allowed && !allowed.includes(item)) return false;
    if (uuids && !uuidPattern.test(item)) return false;
    seen.add(item);
    return true;
  }).slice(0, limit);
}

function normalizeProductList(value) {
  const seen = new Set();
  return String(value || '').split(/\r?\n/).map((item) => item.trim()).filter((item) => {
    const key = item.toLocaleLowerCase('uk-UA');
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 200).map((raw) => ({
    raw: raw.slice(0, 240),
    code: raw.toLocaleLowerCase('uk-UA').slice(0, 240),
    normalizedName: normalizeProductName(raw).slice(0, 240)
  }));
}

function normalizeCatalogListInput(input) {
  return {
    ...input,
    conditions: uniqueCsvValues(input.conditions, { allowed: productConditions }),
    statuses: uniqueCsvValues(input.statuses, { allowed: publicationStatuses }),
    availabilities: uniqueCsvValues(input.availabilities, { allowed: ['in_stock', 'incoming', 'unavailable'] }),
    brandIds: uniqueCsvValues(input.brandIds, { uuids: true }),
    brandDirectoryIds: uniqueCsvValues(input.brandDirectoryIds, { uuids: true }),
    templateIds: uniqueCsvValues(input.templateIds, { uuids: true }),
    productList: normalizeProductList(input.productList)
  };
}

function catalogListRequestInput(req, { defaultSort = 'updated_desc', defaultPageSize = 25 } = {}) {
  return normalizeCatalogListInput(parseInput(listSchema, {
    search: String(req.query.search || ''),
    condition: req.query.condition || 'all',
    status: req.query.status || 'all',
    availability: req.query.availability || 'all',
    conditions: String(req.query.conditions || ''),
    statuses: String(req.query.statuses || ''),
    availabilities: String(req.query.availabilities || ''),
    brandId: req.query.brandId || undefined,
    brandIds: String(req.query.brandIds || ''),
    brandDirectoryIds: String(req.query.brandDirectoryIds || ''),
    templateIds: String(req.query.templateIds || ''),
    priceMin: req.query.priceMin || undefined,
    priceMax: req.query.priceMax || undefined,
    stockMin: req.query.stockMin || undefined,
    stockMax: req.query.stockMax || undefined,
    incomingMin: req.query.incomingMin || undefined,
    incomingMax: req.query.incomingMax || undefined,
    photoStatus: req.query.photoStatus || 'all',
    descriptionStatus: req.query.descriptionStatus || 'all',
    characteristicsStatus: req.query.characteristicsStatus || 'all',
    serialStatus: req.query.serialStatus || 'all',
    readiness: req.query.readiness || 'all',
    modification: req.query.modification || 'all',
    createdFrom: req.query.createdFrom || undefined,
    createdTo: req.query.createdTo || undefined,
    updatedFrom: req.query.updatedFrom || undefined,
    updatedTo: req.query.updatedTo || undefined,
    productList: String(req.query.productList || ''),
    characteristics: String(req.query.characteristics || ''),
    sort: req.query.sort || defaultSort,
    page: req.query.page || 1,
    pageSize: req.query.pageSize || defaultPageSize
  }));
}

function auditCategory(action) {
  if (action === 'publication_status') return 'publication';
  if (action.startsWith('media_')) return 'media';
  if (action.startsWith('characteristic')) return 'characteristics';
  if (action.startsWith('modification')) return 'modifications';
  if (action.startsWith('storefront_') || action.startsWith('product_card_') || action.startsWith('product_page_')) return 'settings';
  if (action.startsWith('import_')) return 'import';
  return 'products';
}

function auditCategorySql(category) {
  if (category === 'publication') return "audit.action = 'publication_status'";
  if (category === 'media') return "audit.action LIKE 'media_%'";
  if (category === 'characteristics') return "audit.action LIKE 'characteristic%'";
  if (category === 'modifications') return "audit.action LIKE 'modification%'";
  if (category === 'settings') return "(audit.action LIKE 'storefront_%' OR audit.action LIKE 'product_card_%' OR audit.action LIKE 'product_page_%')";
  if (category === 'products') {
    return "audit.action NOT LIKE 'media_%' AND audit.action NOT LIKE 'characteristic%' AND audit.action NOT LIKE 'modification%' AND audit.action NOT LIKE 'storefront_%' AND audit.action NOT LIKE 'product_card_%' AND audit.action NOT LIKE 'product_page_%' AND audit.action <> 'publication_status'";
  }
  return '';
}

function historyDateBoundary(value, endOfDay = false) {
  return `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`;
}

async function loadManualAuditHistory(input, requestedLimit) {
  if (input.source === 'xlsx' || input.category === 'import') return { rows: [], total: 0 };
  const params = [];
  const where = ["audit.action NOT LIKE 'import_%'"];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  const categorySql = auditCategorySql(input.category);
  if (categorySql) where.push(categorySql);
  if (input.actorId) add('audit.actor_id = ?', input.actorId);
  if (input.dateFrom) add('audit.created_at >= ?', historyDateBoundary(input.dateFrom));
  if (input.dateTo) add('audit.created_at <= ?', historyDateBoundary(input.dateTo, true));
  if (input.search) {
    add(`(
      products.name ILIKE ? OR products.product_code ILIKE $${params.length + 1}
      OR users.name ILIKE $${params.length + 1} OR audit.changes::TEXT ILIKE $${params.length + 1}
    )`, `%${input.search}%`);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const [countResult, rowsResult] = await Promise.all([
    query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM used_smartphone_audit_log AS audit
       LEFT JOIN used_smartphone_products AS products ON products.id = audit.product_id
       LEFT JOIN users ON users.id = audit.actor_id
       ${whereSql}`,
      params
    ),
    query(
      `SELECT audit.*, users.name AS actor_name, products.product_code, products.name AS product_name
       FROM used_smartphone_audit_log AS audit
       LEFT JOIN used_smartphone_products AS products ON products.id = audit.product_id
       LEFT JOIN users ON users.id = audit.actor_id
       ${whereSql}
       ORDER BY audit.created_at DESC, audit.id DESC
       LIMIT $${params.length + 1}`,
      [...params, requestedLimit]
    )
  ]);
  return { rows: rowsResult.rows, total: Number(countResult.rows[0]?.total || 0) };
}

async function loadImportAuditHistory(input, requestedLimit) {
  if (input.source === 'manual' || !['all', 'import'].includes(input.category)) return { rows: [], total: 0 };
  const params = [];
  const where = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (input.actorId) add('imports.created_by = ?', input.actorId);
  if (input.dateFrom) add('imports.created_at >= ?', historyDateBoundary(input.dateFrom));
  if (input.dateTo) add('imports.created_at <= ?', historyDateBoundary(input.dateTo, true));
  if (input.search) {
    const searchValue = `%${input.search}%`;
    const matchingImports = await query(
      `SELECT DISTINCT search_rows.import_id
       FROM used_smartphone_import_rows AS search_rows
       LEFT JOIN used_smartphone_products AS search_products ON search_products.id = search_rows.product_id
       WHERE search_rows.name ILIKE $1 OR search_products.product_code ILIKE $1`,
      [searchValue]
    );
    params.push(searchValue);
    const searchParts = [`users.name ILIKE $${params.length}`];
    if (matchingImports.rows.length) {
      const placeholders = matchingImports.rows.map((row) => {
        params.push(row.import_id);
        return `$${params.length}`;
      });
      searchParts.push(`imports.id IN (${placeholders.join(', ')})`);
    }
    where.push(`(${searchParts.join(' OR ')})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [countResult, rowsResult] = await Promise.all([
    query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM used_smartphone_imports AS imports
       LEFT JOIN users ON users.id = imports.created_by
       ${whereSql}`,
      params
    ),
    query(
      `SELECT imports.*, users.name AS actor_name
       FROM used_smartphone_imports AS imports
       LEFT JOIN users ON users.id = imports.created_by
       ${whereSql}
       ORDER BY imports.created_at DESC, imports.id DESC
       LIMIT $${params.length + 1}`,
      [...params, requestedLimit]
    )
  ]);
  return { rows: rowsResult.rows, total: Number(countResult.rows[0]?.total || 0) };
}

function serializeAuditHistoryItem(row) {
  const productCode = row.product_code || String(row.changes?.subject?.productCode || row.changes?.after?.productCode || row.changes?.productCode || '');
  const productName = row.product_name || String(row.changes?.subject?.name || row.changes?.after?.name || row.changes?.name || '');
  return {
    id: row.id,
    kind: 'audit',
    source: 'manual',
    category: auditCategory(row.action),
    action: row.action,
    actor: row.actor_id ? { id: row.actor_id, name: row.actor_name || '' } : null,
    product: row.product_id || productCode || productName ? {
      id: row.product_id || '',
      productCode,
      name: productName
    } : null,
    changes: row.changes || {},
    summary: null,
    options: null,
    importId: null,
    createdAt: row.created_at
  };
}

function serializeImportHistoryItem(row) {
  return {
    id: row.id,
    kind: 'import',
    source: 'xlsx',
    category: 'import',
    action: 'import_commit',
    actor: row.created_by ? { id: row.created_by, name: row.actor_name || '' } : null,
    product: null,
    changes: {},
    summary: row.summary || {},
    options: row.options || {},
    importId: row.id,
    createdAt: row.created_at
  };
}

async function assertBrandDirectoryExists(directoryId, db = { query }) {
  const result = await db.query('SELECT * FROM used_smartphone_brand_directories WHERE id = $1', [directoryId]);
  if (!result.rows[0]) throw new AppError(404, 'CATALOG_BRAND_DIRECTORY_NOT_FOUND', 'Довідник брендів не знайдено.');
  return result.rows[0];
}

function productParams(input, normalizedName, slug, userId, descriptionContent) {
  return [
    input.name,
    normalizedName,
    input.condition,
    input.stockCount,
    input.incomingCount,
    input.priceUah,
    input.publicationStatus,
    slug,
    input.brandId || null,
    input.mainImageUrl,
    JSON.stringify(input.gallery),
    input.shortDescription,
    input.description,
    descriptionContent.safeHtml,
    descriptionContent.css,
    descriptionContent.js,
    descriptionContent.hasJs,
    input.seoTitle,
    input.seoDescription,
    input.socialDescription,
    input.bodyCondition,
    input.displayCondition,
    input.batteryHealth,
    input.warranty,
    input.includedAccessories,
    JSON.stringify(input.diagnostics),
    input.internalNotes,
    userId
  ];
}

function assertPublishable(input) {
  if (input.publicationStatus === 'PUBLISHED') validatePublicationReady(input);
}

function prepareProductDescription(input, user, previousDescription = '') {
  const descriptionContent = prepareCatalogDescription(input.description || '');
  const sourceChanged = String(input.description || '') !== String(previousDescription || '');
  if (sourceChanged && descriptionContent.hasJs && !canSaveCatalogSourceJs(user)) {
    throw new AppError(403, 'CATALOG_SOURCE_JS_FORBIDDEN', 'Збереження JavaScript у джерелі опису доступне лише адміністратору каталогу.');
  }
  return { ...descriptionContent, sourceChanged };
}

function bufferFromBase64(value) {
  const source = String(value || '');
  const base64 = source.includes(',') ? source.split(',').pop() : source;
  return Buffer.from(base64 || '', 'base64');
}

function decodeHeaderFileName(value, fallback = 'catalog-photo.webp') {
  try {
    return decodeURIComponent(String(value || fallback));
  } catch {
    return fallback;
  }
}

function serializeMedia(row) {
  return {
    id: row.id,
    productId: row.product_id || null,
    url: row.url,
    originalUrl: row.original_url || '',
    mimeType: row.mime_type || 'image/webp',
    originalMimeType: row.original_mime_type || '',
    size: Number(row.size_bytes || 0),
    originalSize: Number(row.original_size_bytes || 0),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    alt: row.alt || '',
    role: row.role || 'gallery',
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeGalleryValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeJsonArrayValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeJsonObjectValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

const cyrillicTransliteration = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'h',
  ґ: 'g',
  д: 'd',
  е: 'e',
  є: 'ye',
  ж: 'zh',
  з: 'z',
  и: 'y',
  і: 'i',
  ї: 'yi',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ь: '',
  ю: 'yu',
  я: 'ya',
  ы: 'y',
  э: 'e',
  ё: 'yo',
  ъ: ''
};

function transliterateToLatin(value) {
  return Array.from(String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, ''))
    .map((char) => cyrillicTransliteration[char.toLocaleLowerCase('uk-UA')] ?? char)
    .join('');
}

function normalizeTemplateFieldKey(value, fallback) {
  return transliterateToLatin(value || fallback || 'field')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 120) || `field_${Date.now()}`;
}

function uniqueTemplateFieldKey(base, seen) {
  let key = base || 'field';
  let counter = 2;
  while (seen.has(key)) {
    const suffix = `_${counter}`;
    key = `${base.slice(0, 120 - suffix.length)}${suffix}`;
    counter += 1;
  }
  seen.add(key);
  return key;
}

function normalizeTemplateFields(fields) {
  const seen = new Set();
  return fields.map((field, index) => {
    const base = normalizeTemplateFieldKey(field.label || field.key, `field_${index + 1}`);
    return {
      ...field,
      key: uniqueTemplateFieldKey(base, seen),
      sortOrder: field.sortOrder ?? index
    };
  });
}

function serializeCharacteristicField(row) {
  return {
    id: row.id,
    templateId: row.template_id,
    key: row.key,
    label: row.label,
    type: row.type,
    unit: row.unit || '',
    options: normalizeJsonArrayValue(row.options),
    required: row.required === true,
    filterable: row.filterable === true,
    isModifier: row.is_modifier === true,
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializeCharacteristicTemplate(row, fields = []) {
  return {
    id: row.id,
    label: row.label,
    description: row.description || '',
    active: row.active === true,
    sortOrder: Number(row.sort_order || 0),
    fields,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function assertUniqueFieldKeys(fields) {
  const seen = new Set();
  for (const field of fields) {
    const key = normalizeTemplateFieldKey(field.key, field.label);
    if (seen.has(key)) {
      throw new AppError(422, 'CATALOG_TEMPLATE_FIELD_DUPLICATE', `Дубль ключа поля "${key}" у шаблоні.`);
    }
    seen.add(key);
  }
}

async function loadCharacteristicTemplate(templateId, db = { query }) {
  const template = await db.query(
    'SELECT * FROM used_smartphone_characteristic_templates WHERE id = $1',
    [templateId]
  );
  if (!template.rows[0]) return null;
  const fields = await db.query(
    `SELECT *
     FROM used_smartphone_characteristic_template_fields
     WHERE template_id = $1
     ORDER BY sort_order, created_at`,
    [templateId]
  );
  return serializeCharacteristicTemplate(template.rows[0], fields.rows.map(serializeCharacteristicField));
}

async function replaceCharacteristicFields(db, templateId, fields) {
  const normalizedFields = normalizeTemplateFields(fields);
  assertUniqueFieldKeys(normalizedFields);
  const existing = await db.query('SELECT * FROM used_smartphone_characteristic_template_fields WHERE template_id = $1', [templateId]);
  const existingById = new Map(existing.rows.map((row) => [row.id, row]));
  const existingByKey = new Map(existing.rows.map((row) => [row.key, row]));
  const activeKeys = new Set();
  const activeIds = new Set();
  const plannedFields = normalizedFields.map((field, index) => ({
    field,
    sortOrder: field.sortOrder ?? index,
    existingField: (field.id && existingById.get(field.id)) || existingByKey.get(field.key)
  }));
  for (const row of existing.rows) {
    await db.query(
      'UPDATE used_smartphone_characteristic_template_fields SET key = $1 WHERE id = $2',
      [`tmp_${String(row.id).replace(/-/g, '')}`, row.id]
    );
  }
  for (const { field, sortOrder, existingField } of plannedFields) {
    activeKeys.add(field.key);
    if (existingField) {
      activeIds.add(existingField.id);
      await db.query(
        `UPDATE used_smartphone_characteristic_template_fields
         SET key = $1,
             label = $2,
             type = $3,
             unit = $4,
             options = $5::JSONB,
             required = $6,
             filterable = $7,
             is_modifier = $8,
             sort_order = $9,
             updated_at = NOW()
         WHERE id = $10`,
        [
          field.key,
          field.label,
          field.type,
          field.unit,
          JSON.stringify(field.options),
          field.required,
          field.filterable,
          field.isModifier,
          sortOrder,
          existingField.id
        ]
      );
      await db.query(
        `UPDATE used_smartphone_product_characteristics
         SET field_id = $1,
             key = $2,
             label = $3,
             sort_order = $4,
             updated_at = NOW()
         WHERE field_id = $1 OR (template_id = $5 AND key = $6)`,
        [existingField.id, field.key, field.label, sortOrder, templateId, existingField.key]
      );
    } else {
      await db.query(
        `INSERT INTO used_smartphone_characteristic_template_fields (
           template_id, key, label, type, unit, options, required, filterable, is_modifier, sort_order
         ) VALUES ($1, $2, $3, $4, $5, $6::JSONB, $7, $8, $9, $10)`,
        [
          templateId,
          field.key,
          field.label,
          field.type,
          field.unit,
          JSON.stringify(field.options),
          field.required,
          field.filterable,
          field.isModifier,
          sortOrder
        ]
      );
    }
  }
  for (const row of existing.rows) {
    if (!activeIds.has(row.id) && !activeKeys.has(row.key)) {
      await db.query('DELETE FROM used_smartphone_characteristic_template_fields WHERE id = $1', [row.id]);
    }
  }
  const refreshed = await db.query(
    `SELECT id, key, label, sort_order
     FROM used_smartphone_characteristic_template_fields
     WHERE template_id = $1`,
    [templateId]
  );
  for (const field of refreshed.rows) {
    await db.query(
      `UPDATE used_smartphone_product_characteristics
       SET field_id = $1,
           label = $2,
           sort_order = $3,
           updated_at = NOW()
       WHERE template_id = $4 AND key = $5`,
      [field.id, field.label, field.sort_order, templateId, field.key]
    );
  }
}

function normalizeColorHex(value) {
  const text = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : '';
}

function characteristicTextValue(value) {
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (value && typeof value === 'object') {
    return String(value.name || value.label || value.hex || '').trim();
  }
  return value == null ? '' : String(value);
}

function characteristicValueForField(field, values) {
  const raw = values[field.key];
  if (field.type === 'boolean') return raw === true || raw === 'true';
  if (field.type === 'number') {
    const number = Number(raw);
    return Number.isFinite(number) ? number : null;
  }
  if (field.type === 'color') {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return {
        name: String(raw.name || raw.label || '').trim().slice(0, 160),
        hex: normalizeColorHex(raw.hex)
      };
    }
    const text = String(raw || '').trim();
    return normalizeColorHex(text) ? { name: '', hex: normalizeColorHex(text) } : { name: text.slice(0, 160), hex: '' };
  }
  if (field.type === 'multiselect') return Array.isArray(raw) ? raw.map(String) : [];
  return raw == null ? '' : String(raw);
}

function normalizeModificationKey(value, fallback) {
  return String(value || fallback || 'parameter')
    .normalize('NFKC')
    .toLocaleLowerCase('uk-UA')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || `parameter_${Date.now()}`;
}

function normalizeModificationValue(value, fallback) {
  return String(value || fallback || 'value')
    .normalize('NFKC')
    .toLocaleLowerCase('uk-UA')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 160) || `value_${Date.now()}`;
}

function normalizeGroupSlug(value, fallback = 'group') {
  return String(value || fallback)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 180) || 'group';
}

async function makeUniqueGroupSlug(value, excludeId, db) {
  const base = normalizeGroupSlug(value, 'product-group');
  let candidate = base;
  for (let index = 2; index < 1000; index += 1) {
    const result = excludeId
      ? await db.query('SELECT id FROM used_smartphone_product_groups WHERE slug = $1 AND id <> $2', [candidate, excludeId])
      : await db.query('SELECT id FROM used_smartphone_product_groups WHERE slug = $1', [candidate]);
    if (!result.rows[0]) return candidate;
    candidate = `${base}-${index}`;
  }
  throw new AppError(409, 'CATALOG_GROUP_SLUG_UNAVAILABLE', 'Не вдалося підібрати унікальний slug групи модифікацій.');
}

function serializeModificationValue(row) {
  return {
    id: row.id,
    parameterId: row.parameter_id,
    value: row.value,
    label: row.label,
    active: row.active === true,
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializeModificationParameter(row, values = []) {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    active: row.active === true,
    sortOrder: Number(row.sort_order || 0),
    values,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializeProductGroup(row, parameterIds = []) {
  return {
    id: row.id,
    label: row.label,
    slug: row.slug,
    active: row.active === true,
    mainProductId: row.main_product_id || null,
    parameterIds,
    itemCount: Number(row.item_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function loadModificationParameter(parameterId, db = { query }) {
  const parameter = await db.query('SELECT * FROM used_smartphone_modification_parameters WHERE id = $1', [parameterId]);
  if (!parameter.rows[0]) return null;
  const values = await db.query(
    `SELECT *
     FROM used_smartphone_modification_values
     WHERE parameter_id = $1
     ORDER BY sort_order, lower(label)`,
    [parameterId]
  );
  return serializeModificationParameter(parameter.rows[0], values.rows.map(serializeModificationValue));
}

async function replaceModificationValues(db, parameterId, values) {
  const keptIds = [];
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    const normalized = normalizeModificationValue(value.value, value.label);
    if (seen.has(normalized)) {
      throw new AppError(422, 'CATALOG_MODIFICATION_VALUE_DUPLICATE', `Дубль значення "${normalized}" у параметрі.`);
    }
    seen.add(normalized);
    if (value.id) {
      const updated = await db.query(
        `UPDATE used_smartphone_modification_values
         SET value = $1,
             label = $2,
             active = $3,
             sort_order = $4,
             updated_at = NOW()
         WHERE id = $5 AND parameter_id = $6
         RETURNING id`,
        [normalized, value.label, value.active, value.sortOrder || index, value.id, parameterId]
      );
      if (!updated.rows[0]) throw new AppError(404, 'CATALOG_MODIFICATION_VALUE_NOT_FOUND', 'Значення модифікації не знайдено.');
      keptIds.push(value.id);
    } else {
      const inserted = await db.query(
        `INSERT INTO used_smartphone_modification_values (parameter_id, value, label, active, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [parameterId, normalized, value.label, value.active, value.sortOrder || index]
      );
      keptIds.push(inserted.rows[0].id);
    }
  }
  if (keptIds.length) {
    const placeholders = keptIds.map((_, index) => `$${index + 2}`).join(', ');
    await db.query(
      `DELETE FROM used_smartphone_modification_values
       WHERE parameter_id = $1 AND id NOT IN (${placeholders})`,
      [parameterId, ...keptIds]
    );
  } else {
    await db.query('DELETE FROM used_smartphone_modification_values WHERE parameter_id = $1', [parameterId]);
  }
}

async function syncProductModifications(db, productId, groupId, parameterIds, values, actorId) {
  await db.query('DELETE FROM used_smartphone_product_modification_values WHERE product_id = $1', [productId]);
  await db.query('DELETE FROM used_smartphone_product_group_items WHERE product_id = $1', [productId]);
  if (!groupId) return;
  await db.query(
    `INSERT INTO used_smartphone_product_group_items (group_id, product_id)
     VALUES ($1, $2)
     ON CONFLICT (group_id, product_id) DO NOTHING`,
    [groupId, productId]
  );
  await db.query('DELETE FROM used_smartphone_product_group_parameters WHERE group_id = $1', [groupId]);
  for (const [index, parameterId] of parameterIds.entries()) {
    await db.query(
      `INSERT INTO used_smartphone_product_group_parameters (group_id, parameter_id, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (group_id, parameter_id) DO UPDATE SET sort_order = EXCLUDED.sort_order`,
      [groupId, parameterId, index]
    );
    const valueId = values[parameterId];
    if (!valueId) continue;
    const valid = await db.query(
      'SELECT id FROM used_smartphone_modification_values WHERE id = $1 AND parameter_id = $2',
      [valueId, parameterId]
    );
    if (!valid.rows[0]) throw new AppError(422, 'CATALOG_MODIFICATION_VALUE_INVALID', 'Значення модифікації не належить вибраному параметру.');
    await db.query(
      `INSERT INTO used_smartphone_product_modification_values (product_id, parameter_id, value_id, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (product_id, parameter_id)
       DO UPDATE SET value_id = EXCLUDED.value_id, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [productId, parameterId, valueId, actorId]
    );
  }
}

async function syncProductGroupModifications(db, groupId, mainProductId, productIds) {
  const uniqueProductIds = [...new Set(productIds)].filter(Boolean);
  if (!groupId) {
    if (!uniqueProductIds.length) return;
    const placeholders = uniqueProductIds.map((_, index) => `$${index + 1}`).join(', ');
    await db.query(`DELETE FROM used_smartphone_product_group_items WHERE product_id IN (${placeholders})`, uniqueProductIds);
    await db.query(`UPDATE used_smartphone_product_groups SET main_product_id = NULL WHERE main_product_id IN (${placeholders})`, uniqueProductIds);
    return;
  }
  if (!uniqueProductIds.length) return;
  const placeholders = uniqueProductIds.map((_, index) => `$${index + 1}`).join(', ');
  await db.query(
    `DELETE FROM used_smartphone_product_group_items
     WHERE product_id IN (${placeholders}) AND group_id <> $${uniqueProductIds.length + 1}`,
    [...uniqueProductIds, groupId]
  );
  await db.query(
    `UPDATE used_smartphone_product_groups
     SET main_product_id = NULL
     WHERE main_product_id IN (${placeholders}) AND id <> $${uniqueProductIds.length + 1}`,
    [...uniqueProductIds, groupId]
  );
  await db.query('DELETE FROM used_smartphone_product_group_items WHERE group_id = $1', [groupId]);
  for (const [index, itemId] of uniqueProductIds.entries()) {
    await db.query(
      `INSERT INTO used_smartphone_product_group_items (group_id, product_id, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (group_id, product_id) DO UPDATE SET sort_order = EXCLUDED.sort_order`,
      [groupId, itemId, itemId === mainProductId ? 0 : index + 1]
    );
  }
}

async function detachProductFromModificationGroups(db, productId, options = {}) {
  const groups = await db.query(
    `SELECT DISTINCT groups.id, groups.main_product_id
     FROM used_smartphone_product_groups AS groups
     LEFT JOIN used_smartphone_product_group_items AS items ON items.group_id = groups.id
     WHERE groups.main_product_id = $1 OR items.product_id = $1`,
    [productId]
  );
  if (!groups.rows.length) return [];

  await db.query('DELETE FROM used_smartphone_product_group_items WHERE product_id = $1', [productId]);

  for (const group of groups.rows) {
    if (group.main_product_id !== productId) continue;
    if (options.groupAction === 'disband') {
      await db.query('DELETE FROM used_smartphone_product_group_items WHERE group_id = $1', [group.id]);
      await db.query(
        `UPDATE used_smartphone_product_groups
         SET main_product_id = NULL, active = FALSE, updated_at = NOW()
         WHERE id = $1`,
        [group.id]
      );
      continue;
    }
    if (options.groupAction === 'promote' && options.newMainProductId) {
      const promoted = await db.query(
        `SELECT product.id
         FROM used_smartphone_product_group_items AS items
         INNER JOIN used_smartphone_products AS product ON product.id = items.product_id
         WHERE items.group_id = $1
           AND product.id = $2
           AND product.publication_status <> 'ARCHIVED'
         LIMIT 1`,
        [group.id, options.newMainProductId]
      );
      if (!promoted.rows[0]) {
        throw new AppError(422, 'CATALOG_GROUP_MAIN_INVALID', 'Новий основний товар не знайдено у цій групі або він архівований.');
      }
      await db.query(
        `UPDATE used_smartphone_product_groups
         SET main_product_id = $1, active = TRUE, updated_at = NOW()
         WHERE id = $2`,
        [options.newMainProductId, group.id]
      );
      await db.query(
        `UPDATE used_smartphone_product_group_items
         SET sort_order = 0
         WHERE group_id = $1 AND product_id = $2`,
        [group.id, options.newMainProductId]
      );
      continue;
    }
    const nextMain = await db.query(
      `SELECT product.id
       FROM used_smartphone_product_group_items AS items
       INNER JOIN used_smartphone_products AS product ON product.id = items.product_id
       WHERE items.group_id = $1 AND product.publication_status <> 'ARCHIVED'
       ORDER BY items.sort_order, lower(product.name)
       LIMIT 1`,
      [group.id]
    );
    if (nextMain.rows[0]) {
      await db.query(
        `UPDATE used_smartphone_product_groups
         SET main_product_id = $1, updated_at = NOW()
         WHERE id = $2`,
        [nextMain.rows[0].id, group.id]
      );
    } else {
      await db.query(
        `UPDATE used_smartphone_product_groups
         SET main_product_id = NULL, active = FALSE, updated_at = NOW()
         WHERE id = $1`,
        [group.id]
      );
    }
  }

  return groups.rows.map((group) => group.id);
}

async function syncProductMedia(db, productId, input, actorId) {
  const items = [];
  if (input.mainImageUrl) items.push({ url: input.mainImageUrl, alt: input.name || '', role: 'main', sortOrder: 0 });
  input.gallery.forEach((item, index) => {
    if (item.url) items.push({ url: item.url, alt: item.alt || '', role: 'gallery', sortOrder: index + 1 });
  });
  await db.query('DELETE FROM used_smartphone_product_media WHERE product_id = $1', [productId]);
  for (const item of items) {
    const updated = await db.query(
      `UPDATE used_smartphone_product_media
       SET product_id = $2,
           alt = $3,
           role = $4,
           sort_order = $5,
           updated_at = NOW()
       WHERE url = $1 AND product_id IS NULL
       RETURNING *`,
      [item.url, productId, item.alt, item.role, item.sortOrder]
    );
    if (updated.rows[0]) continue;
    await db.query(
      `INSERT INTO used_smartphone_product_media (
         product_id, url, alt, role, sort_order, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [productId, item.url, item.alt, item.role, item.sortOrder, actorId]
    );
  }
}

function buildProductFilters(input) {
  const params = [];
  const where = [];
  const terms = input.search.toLocaleLowerCase('uk-UA').split(/\s+/).filter(Boolean);
  for (const term of terms) {
    params.push(`%${term}%`);
    const index = params.length;
    where.push(`(lower(product.name) LIKE $${index} OR lower(product.product_code) LIKE $${index} OR lower(product.slug) LIKE $${index})`);
  }
  if (input.conditions?.length) {
    params.push(input.conditions);
    where.push(`product.condition = ANY($${params.length}::TEXT[])`);
  } else if (input.condition !== 'all') {
    params.push(input.condition);
    where.push(`product.condition = $${params.length}`);
  }
  if (input.statuses?.length) {
    params.push(input.statuses);
    where.push(`product.publication_status = ANY($${params.length}::TEXT[])`);
  } else if (input.status !== 'all') {
    params.push(input.status);
    where.push(`product.publication_status = $${params.length}`);
  } else {
    where.push("product.publication_status <> 'ARCHIVED'");
  }
  const availabilities = input.availabilities?.length ? input.availabilities : input.availability === 'all' ? [] : [input.availability];
  if (availabilities.length) {
    const availabilityClauses = [];
    if (availabilities.includes('in_stock')) availabilityClauses.push('product.stock_count > 0');
    if (availabilities.includes('incoming')) availabilityClauses.push('(product.stock_count = 0 AND product.incoming_count > 0)');
    if (availabilities.includes('unavailable')) availabilityClauses.push('(product.stock_count = 0 AND product.incoming_count = 0)');
    if (availabilityClauses.length) where.push(`(${availabilityClauses.join(' OR ')})`);
  }
  if (input.brandDirectoryIds?.length) {
    params.push(input.brandDirectoryIds);
    where.push(`product.brand_id IN (
      SELECT filter_brand.id
      FROM used_smartphone_brands AS filter_brand
      WHERE filter_brand.directory_id::TEXT = ANY($${params.length}::TEXT[])
    )`);
  }
  if (input.templateIds?.length) {
    params.push(input.templateIds);
    where.push(`product.id IN (
      SELECT template_characteristic.product_id
      FROM used_smartphone_product_characteristics AS template_characteristic
      WHERE template_characteristic.template_id::TEXT = ANY($${params.length}::TEXT[])
    )`);
  }
  const numericRanges = [
    ['stockMin', 'product.stock_count', '>='],
    ['stockMax', 'product.stock_count', '<='],
    ['incomingMin', 'product.incoming_count', '>='],
    ['incomingMax', 'product.incoming_count', '<=']
  ];
  numericRanges.forEach(([key, column, operator]) => {
    if (input[key] === undefined) return;
    params.push(input[key]);
    where.push(`${column} ${operator} $${params.length}`);
  });
  const contentStatus = (value, presentSql) => {
    if (value === 'present') where.push(presentSql);
    if (value === 'missing') where.push(`NOT (${presentSql})`);
  };
  contentStatus(input.photoStatus, "product.main_image_url <> ''");
  contentStatus(input.descriptionStatus, "(product.short_description <> '' OR product.description <> '')");
  const hasCharacteristicsSql = `product.id IN (
    SELECT content_characteristic.product_id
    FROM used_smartphone_product_characteristics AS content_characteristic
    WHERE (
        content_characteristic.value_text <> ''
        OR content_characteristic.value_number IS NOT NULL
        OR content_characteristic.value_boolean IS NOT NULL
        OR COALESCE(content_characteristic.value_json->'value', 'null'::JSONB) NOT IN ('null'::JSONB, '""'::JSONB, '[]'::JSONB, '{}'::JSONB)
      )
  )`;
  contentStatus(input.characteristicsStatus, hasCharacteristicsSql);
  contentStatus(input.serialStatus, "product.imei_serial <> ''");
  const readySql = "(product.price_uah > 0 AND product.main_image_url <> '' AND product.slug <> '')";
  if (input.readiness === 'ready') where.push(readySql);
  if (input.readiness === 'not_ready') where.push(`NOT ${readySql}`);
  if (input.modification === 'ungrouped') {
    where.push('product.id NOT IN (SELECT filter_group_item.product_id FROM used_smartphone_product_group_items AS filter_group_item)');
  }
  if (input.modification === 'main') {
    where.push('product.id IN (SELECT filter_group.main_product_id FROM used_smartphone_product_groups AS filter_group WHERE filter_group.main_product_id IS NOT NULL)');
  }
  if (input.modification === 'child') {
    where.push(`product.id IN (
      SELECT filter_group_item.product_id
      FROM used_smartphone_product_group_items AS filter_group_item
      INNER JOIN used_smartphone_product_groups AS filter_group ON filter_group.id = filter_group_item.group_id
      WHERE filter_group.main_product_id <> filter_group_item.product_id
    )`);
  }
  const dateRanges = [
    ['createdFrom', 'product.created_at', '>=', ''],
    ['createdTo', 'product.created_at', '<', " + INTERVAL '1 day'"],
    ['updatedFrom', 'product.updated_at', '>=', ''],
    ['updatedTo', 'product.updated_at', '<', " + INTERVAL '1 day'"]
  ];
  dateRanges.forEach(([key, column, operator, suffix]) => {
    if (!input[key]) return;
    params.push(input[key]);
    where.push(`${column} ${operator} $${params.length}::DATE${suffix}`);
  });
  if (input.productList?.length) {
    params.push(input.productList.map((item) => item.code));
    const codeIndex = params.length;
    params.push(input.productList.map((item) => item.normalizedName));
    const nameIndex = params.length;
    where.push(`(
      lower(product.product_code) = ANY($${codeIndex}::TEXT[])
      OR product.normalized_name = ANY($${nameIndex}::TEXT[])
    )`);
  }
  if (input.includeStorefrontFilters) appendStorefrontProductFilters(input, params, where);
  return { params, whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '' };
}

async function loadProductListDiagnostics(productList) {
  if (!productList?.length) return null;
  const result = await query(
    `SELECT product_code, normalized_name
     FROM used_smartphone_products
     WHERE lower(product_code) = ANY($1::TEXT[])
        OR normalized_name = ANY($2::TEXT[])`,
    [productList.map((item) => item.code), productList.map((item) => item.normalizedName)]
  );
  const matchedCodes = new Set(result.rows.map((row) => String(row.product_code || '').toLocaleLowerCase('uk-UA')));
  const matchedNames = new Set(result.rows.map((row) => row.normalized_name));
  const unmatched = productList.filter((item) => !matchedCodes.has(item.code) && !matchedNames.has(item.normalizedName)).map((item) => item.raw);
  return {
    requestedCount: productList.length,
    matchedCount: productList.length - unmatched.length,
    unmatched
  };
}

async function loadSettings(db = { query }) {
  const result = await db.query(
    `SELECT selected_form_public_id, public_origin, storefront_theme, product_card_theme, product_page_theme, updated_at
     FROM used_smartphone_storefront_settings
     WHERE id = TRUE`
  );
  const row = result.rows[0] || {};
  return {
    selectedFormPublicId: row.selected_form_public_id || null,
    publicOrigin: row.public_origin || '',
    storefrontTheme: normalizeStorefrontTheme(row.storefront_theme),
    productCardTheme: normalizeProductCardTheme(row.product_card_theme),
    productPageTheme: normalizeProductPageTheme(row.product_page_theme),
    updatedAt: row.updated_at || null
  };
}

function publicWasTouched(previousStatus, nextStatus) {
  return previousStatus === 'PUBLISHED' || nextStatus === 'PUBLISHED';
}

router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const sendUpdate = (payload) => res.write(`event: catalog\ndata: ${JSON.stringify(payload)}\n\n`);
  const unsubscribe = subscribeToCatalogUpdates(req.user.id, sendUpdate);
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
  heartbeat.unref();
  res.write('event: connected\ndata: {}\n\n');
  req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
});

router.post('/media', raw({ type: 'image/webp', limit: '5mb' }), asyncHandler(async (req, res) => {
  const contentType = String(req.get('content-type') || '').toLowerCase();
  let asset;
  if (contentType.startsWith('image/webp')) {
    asset = await saveCatalogMediaAsset({
      webpBuffer: req.body,
      webpName: decodeHeaderFileName(req.get('x-file-name'))
    });
  } else if (contentType.startsWith('application/json')) {
    const input = parseInput(mediaUploadSchema, req.body);
    asset = await saveCatalogMediaAsset({
      webpBuffer: bufferFromBase64(input.webpBase64),
      webpName: input.webpName,
      originalBuffer: input.originalBase64 ? bufferFromBase64(input.originalBase64) : null,
      originalName: input.originalName,
      originalMimeType: input.originalMimeType
    });
  } else {
    throw new AppError(415, 'CATALOG_MEDIA_UNSUPPORTED_TYPE', 'Завантажуйте фото у форматі WebP.');
  }
  const inserted = await query(
    `INSERT INTO used_smartphone_product_media (
       url, original_url, storage_key, original_storage_key, mime_type,
       original_mime_type, size_bytes, original_size_bytes, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      asset.url,
      asset.originalUrl,
      asset.filename,
      asset.originalFilename,
      asset.mimeType,
      asset.originalMimeType,
      asset.size,
      asset.originalSize,
      req.user.id
    ]
  );
  res.status(201).json({ data: serializeMedia(inserted.rows[0]) });
}));

router.get('/summary', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT
       COUNT(*)::INTEGER AS total,
       COUNT(*) FILTER (WHERE publication_status = 'DRAFT')::INTEGER AS draft,
       COUNT(*) FILTER (WHERE publication_status = 'PUBLISHED')::INTEGER AS published,
       COUNT(*) FILTER (WHERE publication_status = 'HIDDEN')::INTEGER AS hidden,
       COUNT(*) FILTER (WHERE publication_status = 'ARCHIVED')::INTEGER AS archived,
       COUNT(*) FILTER (WHERE stock_count > 0)::INTEGER AS in_stock,
       COUNT(*) FILTER (WHERE stock_count = 0 AND incoming_count > 0)::INTEGER AS incoming,
       COUNT(*) FILTER (WHERE stock_count = 0 AND incoming_count = 0)::INTEGER AS unavailable
     FROM used_smartphone_products`
  );
  const row = result.rows[0] || {};
  res.json({ data: {
    total: Number(row.total || 0),
    byStatus: {
      draft: Number(row.draft || 0),
      published: Number(row.published || 0),
      hidden: Number(row.hidden || 0),
      archived: Number(row.archived || 0)
    },
    byAvailability: {
      inStock: Number(row.in_stock || 0),
      incoming: Number(row.incoming || 0),
      unavailable: Number(row.unavailable || 0)
    }
  } });
}));

router.get('/brand-directories', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT directories.*,
            COALESCE(brand_counts.brand_count, 0)::INTEGER AS brand_count
     FROM used_smartphone_brand_directories AS directories
     LEFT JOIN (
       SELECT directory_id, COUNT(*)::INTEGER AS brand_count
       FROM used_smartphone_brands
       GROUP BY directory_id
     ) AS brand_counts ON brand_counts.directory_id = directories.id
     ORDER BY directories.label`
  );
  res.json({ data: result.rows.map(serializeBrandDirectory) });
}));

router.post('/brand-directories', asyncHandler(async (req, res) => {
  const input = parseInput(brandDirectoryInputSchema, req.body);
  try {
    const result = await query(
      `INSERT INTO used_smartphone_brand_directories (
         label, description, active, sort_order, created_by, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $5)
       RETURNING *`,
      [input.label, input.description, input.active, input.sortOrder, req.user.id]
    );
    const recipients = await getCatalogRecipientIds();
    publishCatalogUpdates(recipients, { type: 'brand_directory_created', directoryId: result.rows[0].id });
    res.status(201).json({ data: serializeBrandDirectory(result.rows[0]) });
  } catch (error) {
    if (uniqueViolation(error)) throw new AppError(409, 'CATALOG_BRAND_DIRECTORY_EXISTS', 'Довідник з такою назвою вже існує.');
    throw error;
  }
}));

router.patch('/brand-directories/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(brandDirectoryInputSchema.partial(), req.body);
  const current = await query('SELECT * FROM used_smartphone_brand_directories WHERE id = $1', [id]);
  if (!current.rows[0]) throw new AppError(404, 'CATALOG_BRAND_DIRECTORY_NOT_FOUND', 'Довідник брендів не знайдено.');
  const next = { ...serializeBrandDirectory(current.rows[0]), ...input };
  try {
    const result = await query(
      `UPDATE used_smartphone_brand_directories
       SET label = $1,
           description = $2,
           active = $3,
           sort_order = $4,
           updated_by = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [next.label, next.description, next.active, next.sortOrder, req.user.id, id]
    );
    const recipients = await getCatalogRecipientIds();
    publishCatalogUpdates(recipients, { type: 'brand_directory_updated', directoryId: id });
    res.json({ data: serializeBrandDirectory(result.rows[0]) });
  } catch (error) {
    if (uniqueViolation(error)) throw new AppError(409, 'CATALOG_BRAND_DIRECTORY_EXISTS', 'Довідник з такою назвою вже існує.');
    throw error;
  }
}));

router.get('/brands', asyncHandler(async (req, res) => {
  const input = parseInput(brandListSchema, {
    directoryId: req.query.directoryId || undefined,
    active: req.query.active || 'all'
  });
  const conditions = [];
  const params = [];
  if (input.directoryId) {
    params.push(input.directoryId);
    conditions.push(`brands.directory_id = $${params.length}`);
  }
  if (input.active === 'active') conditions.push('brands.active = TRUE');
  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(
    `SELECT brands.*, directories.label AS directory_label
     FROM used_smartphone_brands AS brands
     INNER JOIN used_smartphone_brand_directories AS directories ON directories.id = brands.directory_id
     ${whereSql}
     ORDER BY lower(brands.label), brands.created_at`,
    params
  );
  res.json({ data: result.rows.map(serializeBrand) });
}));

router.post('/brands', asyncHandler(async (req, res) => {
  const input = parseInput(brandInputSchema, req.body);
  const directory = await assertBrandDirectoryExists(input.directoryId);
  try {
    const result = await query(
      `INSERT INTO used_smartphone_brands (directory_id, label, logo_url, active, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.directoryId, normalizeBrandLabel(input.label), input.logoUrl, input.active, input.sortOrder]
    );
    const recipients = await getCatalogRecipientIds();
    publishCatalogUpdates(recipients, { type: 'brand_created', brandId: result.rows[0].id, directoryId: input.directoryId });
    res.status(201).json({ data: serializeBrand({ ...result.rows[0], directory_label: directory.label }) });
  } catch (error) {
    if (uniqueViolation(error)) throw new AppError(409, 'CATALOG_BRAND_EXISTS', 'Бренд з такою назвою вже існує в цьому довіднику.');
    throw error;
  }
}));

router.post('/brands/bulk', asyncHandler(async (req, res) => {
  const input = parseInput(brandBulkSchema, req.body);
  const directory = await assertBrandDirectoryExists(input.directoryId);
  const labels = uniqueBrandLabels(input.labels);
  const created = [];
  const skipped = [];

  for (const label of labels) {
    try {
      const result = await query(
        `INSERT INTO used_smartphone_brands (directory_id, label, active, sort_order)
         VALUES ($1, $2, TRUE, 0)
         RETURNING *`,
        [input.directoryId, label]
      );
      created.push(serializeBrand({ ...result.rows[0], directory_label: directory.label }));
    } catch (error) {
      if (uniqueViolation(error)) {
        skipped.push(label);
      } else {
        throw error;
      }
    }
  }

  if (created.length) {
    const recipients = await getCatalogRecipientIds();
    publishCatalogUpdates(recipients, { type: 'brands_bulk_created', directoryId: input.directoryId, created: created.length });
  }

  res.status(201).json({ data: { created, skipped, total: labels.length } });
}));

router.patch('/brands/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(brandInputSchema.partial(), req.body);
  const current = await query(
    `SELECT brands.*, directories.label AS directory_label
     FROM used_smartphone_brands AS brands
     INNER JOIN used_smartphone_brand_directories AS directories ON directories.id = brands.directory_id
     WHERE brands.id = $1`,
    [id]
  );
  if (!current.rows[0]) throw new AppError(404, 'CATALOG_BRAND_NOT_FOUND', 'Бренд не знайдено.');
  const next = { ...serializeBrand(current.rows[0]), ...input };
  const directory = await assertBrandDirectoryExists(next.directoryId);
  try {
    const result = await query(
      `UPDATE used_smartphone_brands
       SET directory_id = $1,
           label = $2,
           logo_url = $3,
           active = $4,
           sort_order = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [next.directoryId, normalizeBrandLabel(next.label), next.logoUrl, next.active, next.sortOrder, id]
    );
    const recipients = await getCatalogRecipientIds();
    publishCatalogUpdates(recipients, { type: 'brand_updated', brandId: id, directoryId: next.directoryId });
    publishPublicCatalogUpdate({ type: 'brand_updated', brandId: id });
    res.json({ data: serializeBrand({ ...result.rows[0], directory_label: directory.label }) });
  } catch (error) {
    if (uniqueViolation(error)) throw new AppError(409, 'CATALOG_BRAND_EXISTS', 'Бренд з такою назвою вже існує в цьому довіднику.');
    throw error;
  }
}));

router.get('/characteristic-templates', asyncHandler(async (req, res) => {
  const templates = await query(
    `SELECT *
     FROM used_smartphone_characteristic_templates
     ORDER BY active DESC, sort_order, lower(label)`
  );
  const fields = await query(
    `SELECT *
     FROM used_smartphone_characteristic_template_fields
     ORDER BY sort_order, created_at`
  );
  const grouped = new Map();
  fields.rows.forEach((row) => {
    const list = grouped.get(row.template_id) || [];
    list.push(serializeCharacteristicField(row));
    grouped.set(row.template_id, list);
  });
  res.json({ data: templates.rows.map((row) => serializeCharacteristicTemplate(row, grouped.get(row.id) || [])) });
}));

router.post('/characteristic-templates', asyncHandler(async (req, res) => {
  const input = parseInput(characteristicTemplateSchema, req.body);
  const client = await pool.connect();
  let template;
  try {
    await client.query('BEGIN');
    const created = await client.query(
      `INSERT INTO used_smartphone_characteristic_templates (
         label, description, active, sort_order, created_by, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $5)
       RETURNING *`,
      [input.label, input.description, input.active, input.sortOrder, req.user.id]
    );
    await replaceCharacteristicFields(client, created.rows[0].id, input.fields);
    await logCatalogAudit(client, {
      actorId: req.user.id,
      action: 'characteristic_template_create',
      changes: { templateId: created.rows[0].id, label: input.label, fields: input.fields.length }
    });
    template = await loadCharacteristicTemplate(created.rows[0].id, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (uniqueViolation(error)) throw new AppError(409, 'CATALOG_TEMPLATE_EXISTS', 'Шаблон з такою назвою вже існує.');
    throw error;
  } finally {
    client.release();
  }
  res.status(201).json({ data: template });
}));

router.put('/characteristic-templates/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(characteristicTemplateSchema, req.body);
  const client = await pool.connect();
  let template;
  let recipients = [];
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE used_smartphone_characteristic_templates
       SET label = $1,
           description = $2,
           active = $3,
           sort_order = $4,
           updated_by = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [input.label, input.description, input.active, input.sortOrder, req.user.id, id]
    );
    if (!updated.rows[0]) throw new AppError(404, 'CATALOG_TEMPLATE_NOT_FOUND', 'Шаблон характеристик не знайдено.');
    await replaceCharacteristicFields(client, id, input.fields);
    await logCatalogAudit(client, {
      actorId: req.user.id,
      action: 'characteristic_template_update',
      changes: { templateId: id, label: input.label, fields: input.fields.length }
    });
    template = await loadCharacteristicTemplate(id, client);
    recipients = await getCatalogRecipientIds(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (uniqueViolation(error)) throw new AppError(409, 'CATALOG_TEMPLATE_EXISTS', 'Шаблон з такою назвою вже існує.');
    throw error;
  } finally {
    client.release();
  }
  publishCatalogUpdates(recipients, { type: 'characteristic_template_updated', templateId: id });
  publishPublicCatalogUpdate({ type: 'characteristic_template_updated', templateId: id });
  res.json({ data: template });
}));

router.get('/modification-parameters', asyncHandler(async (req, res) => {
  const parameters = await query(
    `SELECT *
     FROM used_smartphone_modification_parameters
     ORDER BY active DESC, sort_order, lower(label)`
  );
  const values = await query(
    `SELECT *
     FROM used_smartphone_modification_values
     ORDER BY sort_order, lower(label)`
  );
  const grouped = new Map();
  values.rows.forEach((row) => {
    const list = grouped.get(row.parameter_id) || [];
    list.push(serializeModificationValue(row));
    grouped.set(row.parameter_id, list);
  });
  res.json({ data: parameters.rows.map((row) => serializeModificationParameter(row, grouped.get(row.id) || [])) });
}));

router.post('/modification-parameters', asyncHandler(async (req, res) => {
  const input = parseInput(modificationParameterSchema, req.body);
  const client = await pool.connect();
  let parameter;
  try {
    await client.query('BEGIN');
    const created = await client.query(
      `INSERT INTO used_smartphone_modification_parameters (key, label, active, sort_order, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $5)
       RETURNING *`,
      [normalizeModificationKey(input.key, input.label), input.label, input.active, input.sortOrder, req.user.id]
    );
    await replaceModificationValues(client, created.rows[0].id, input.values);
    await logCatalogAudit(client, {
      actorId: req.user.id,
      action: 'modification_parameter_create',
      changes: { parameterId: created.rows[0].id, label: input.label, values: input.values.length }
    });
    parameter = await loadModificationParameter(created.rows[0].id, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (uniqueViolation(error)) throw new AppError(409, 'CATALOG_MODIFICATION_PARAMETER_EXISTS', 'Параметр модифікації з таким ключем уже існує.');
    throw error;
  } finally {
    client.release();
  }
  res.status(201).json({ data: parameter });
}));

router.put('/modification-parameters/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(modificationParameterSchema, req.body);
  const client = await pool.connect();
  let parameter;
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE used_smartphone_modification_parameters
       SET key = $1,
           label = $2,
           active = $3,
           sort_order = $4,
           updated_by = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [normalizeModificationKey(input.key, input.label), input.label, input.active, input.sortOrder, req.user.id, id]
    );
    if (!updated.rows[0]) throw new AppError(404, 'CATALOG_MODIFICATION_PARAMETER_NOT_FOUND', 'Параметр модифікації не знайдено.');
    await replaceModificationValues(client, id, input.values);
    await logCatalogAudit(client, {
      actorId: req.user.id,
      action: 'modification_parameter_update',
      changes: { parameterId: id, label: input.label, values: input.values.length }
    });
    parameter = await loadModificationParameter(id, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (uniqueViolation(error)) throw new AppError(409, 'CATALOG_MODIFICATION_PARAMETER_EXISTS', 'Параметр або значення модифікації вже існує.');
    throw error;
  } finally {
    client.release();
  }
  res.json({ data: parameter });
}));

router.get('/product-groups', asyncHandler(async (req, res) => {
  const groups = await query(
    `SELECT groups.*, COUNT(items.product_id)::INTEGER AS item_count
     FROM used_smartphone_product_groups AS groups
     LEFT JOIN used_smartphone_product_group_items AS items ON items.group_id = groups.id
     GROUP BY groups.id, groups.label, groups.slug, groups.active, groups.main_product_id, groups.created_by, groups.updated_by, groups.created_at, groups.updated_at
     ORDER BY groups.active DESC, lower(groups.label)`
  );
  const parameters = await query(
    `SELECT *
     FROM used_smartphone_product_group_parameters
     ORDER BY sort_order`
  );
  const grouped = new Map();
  parameters.rows.forEach((row) => {
    const list = grouped.get(row.group_id) || [];
    list.push(row.parameter_id);
    grouped.set(row.group_id, list);
  });
  res.json({ data: groups.rows.map((row) => serializeProductGroup(row, grouped.get(row.id) || [])) });
}));

router.get('/products', asyncHandler(async (req, res) => {
  const input = catalogListRequestInput(req);
  const characteristicFilters = normalizeStorefrontCharacteristicFilters(input.characteristics);
  const baseFilters = buildProductFilters({ ...input, includeStorefrontFilters: false });
  const filters = buildProductFilters({ ...input, characteristicFilters, includeStorefrontFilters: true });
  const { params, whereSql } = filters;
  const [totalResult, filterOptions, productListDiagnostics] = await Promise.all([
    query(`SELECT COUNT(*)::INTEGER AS count FROM used_smartphone_products AS product ${whereSql}`, params),
    loadStorefrontProductFilters(baseFilters.whereSql, baseFilters.params),
    loadProductListDiagnostics(input.productList)
  ]);
  const offset = (input.page - 1) * input.pageSize;
  const products = await query(
    `${productSelect}
     ${whereSql}
     ORDER BY ${sortSql[input.sort]}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, input.pageSize, offset]
  );
  const total = Number(totalResult.rows[0]?.count || 0);
  const pageIds = new Set(products.rows.map((row) => row.id));
  const items = await attachCatalogProductGroups(
    products.rows.map((row) => serializeCatalogProduct(row)),
    { query },
    { allowedProductIds: pageIds }
  );
  res.json({ data: {
    items,
    filters: filterOptions,
    diagnostics: productListDiagnostics ? { productList: productListDiagnostics } : undefined,
    total,
    page: input.page,
    pageSize: input.pageSize,
    pageCount: Math.max(1, Math.ceil(total / input.pageSize))
  } });
}));

router.get('/products/export', asyncHandler(async (req, res) => {
  const input = catalogListRequestInput(req);
  const characteristicFilters = normalizeStorefrontCharacteristicFilters(input.characteristics);
  const { params, whereSql } = buildProductFilters({ ...input, characteristicFilters, includeStorefrontFilters: true });
  const products = await query(
    `${productSelect}
     ${whereSql}
     ORDER BY ${sortSql[input.sort]}`,
    params
  );
  const items = products.rows.map((row) => serializeCatalogProduct(row));
  await attachCatalogProductCharacteristics(items);
  res.json({ data: {
    items,
    total: items.length,
    generatedAt: new Date().toISOString()
  } });
}));

router.get('/preview/settings', asyncHandler(async (req, res) => {
  res.json({ data: { ...await loadSettings(), preview: true } });
}));

router.get('/preview/products', asyncHandler(async (req, res) => {
  const input = parseInput(listSchema, {
    search: String(req.query.search || ''),
    condition: req.query.condition || 'all',
    status: req.query.status || 'all',
    availability: req.query.availability || 'all',
    brandId: req.query.brandId || undefined,
    priceMin: req.query.priceMin || undefined,
    priceMax: req.query.priceMax || undefined,
    characteristics: String(req.query.characteristics || ''),
    sort: req.query.sort || 'popularity',
    page: req.query.page || 1,
    pageSize: req.query.pageSize || 25
  });
  const characteristicFilters = normalizeStorefrontCharacteristicFilters(input.characteristics);
  const baseFilters = buildProductFilters({ ...input, includeStorefrontFilters: false });
  const filters = buildProductFilters({ ...input, characteristicFilters, includeStorefrontFilters: true });
  const whereSql = filters.whereSql
    ? `${filters.whereSql} AND product.publication_status <> 'ARCHIVED'`
    : "WHERE product.publication_status <> 'ARCHIVED'";
  const baseWhereSql = baseFilters.whereSql
    ? `${baseFilters.whereSql} AND product.publication_status <> 'ARCHIVED'`
    : "WHERE product.publication_status <> 'ARCHIVED'";
  const totalResult = await query(`SELECT COUNT(*)::INTEGER AS count FROM used_smartphone_products AS product ${whereSql}`, filters.params);
  const offset = (input.page - 1) * input.pageSize;
  const result = await query(
    `${productSelect}
     ${whereSql}
     ORDER BY ${sortSql[input.sort]}
     LIMIT $${filters.params.length + 1} OFFSET $${filters.params.length + 2}`,
    [...filters.params, input.pageSize, offset]
  );
  const items = result.rows.map((row) => serializePublicCatalogProduct(row));
  await attachPublicCatalogProductListDetails(items, { query }, { publicOnly: false });
  const filterOptions = await loadStorefrontProductFilters(baseWhereSql, baseFilters.params);
  const total = Number(totalResult.rows[0]?.count || 0);
  res.json({ data: {
    items,
    filters: filterOptions,
    total,
    page: input.page,
    pageSize: input.pageSize,
    pageCount: Math.max(1, Math.ceil(total / input.pageSize))
  } });
}));

router.get('/preview/products/:identifier', asyncHandler(async (req, res) => {
  const identifier = parseInput(z.string().trim().min(1).max(260), req.params.identifier);
  const product = await loadPreviewProduct(identifier);
  if (!product) throw new AppError(404, 'CATALOG_PREVIEW_PRODUCT_NOT_FOUND', 'Товар не знайдено або він архівований.');
  res.json({ data: product });
}));

router.post('/preview/products/:identifier/applications', asyncHandler(async (req, res) => {
  const identifier = parseInput(z.string().trim().min(1).max(260), req.params.identifier);
  const input = parseInput(previewApplicationSchema, req.body);
  const [settings, product] = await Promise.all([
    loadSettings(),
    loadPreviewProduct(identifier)
  ]);
  if (!product) throw new AppError(404, 'CATALOG_PREVIEW_PRODUCT_NOT_FOUND', 'Товар не знайдено або він архівований.');
  if (product.availability.status === 'unavailable') {
    throw new AppError(409, 'STOREFRONT_PRODUCT_UNAVAILABLE', 'Товар зараз недоступний для заявки.');
  }
  if (!settings.selectedFormPublicId) {
    throw new AppError(422, 'STOREFRONT_FORM_NOT_CONFIGURED', 'Для вітрини ще не обрано форму заявок.');
  }

  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const fallbackOrigin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : `${req.protocol}://${req.get('host')}`;
  const origin = settings.publicOrigin || fallbackOrigin;
  const sourceUrl = cleanUrl(new URL(`/catalog/preview/storefront/smartphones/${encodeURIComponent(product.slug)}`, `${fallbackOrigin}/`).toString());
  const context = {
    ...input.context,
    sourceUrl,
    canonicalUrl: sourceUrl,
    pageTitle: cleanText(product.name, 500),
    referrer: cleanUrl(input.context.referrer || '')
  };
  let domain = '';
  try { domain = sourceUrl ? new URL(sourceUrl).hostname : ''; } catch { domain = ''; }

  const result = await createPublicApplication({
    publicId: settings.selectedFormPublicId,
    input: {
      values: input.values,
      product: {},
      context,
      idempotencyKey: input.idempotencyKey,
      honeypot: input.honeypot
    },
    req,
    productOverride: catalogProductSnapshot(product, { origin, sourceUrl, domain, preview: true }),
    contextOverride: context,
    source: 'storefront_catalog_preview',
    historyComment: 'Заявку створено з тестової вітрини каталогу'
  });
  if (result.status === 204) return res.status(204).end();
  res.status(result.status).json({ data: result.data });
}));

router.get('/products/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const product = await loadCatalogProduct(id);
  if (!product) throw new AppError(404, 'CATALOG_PRODUCT_NOT_FOUND', 'Товар не знайдено.');
  res.json({ data: product });
}));

router.get('/products/:id/characteristics', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const product = await query('SELECT id FROM used_smartphone_products WHERE id = $1', [id]);
  if (!product.rows[0]) throw new AppError(404, 'CATALOG_PRODUCT_NOT_FOUND', 'Товар не знайдено.');
  const result = await query(
    `SELECT characteristics.*, fields.type, fields.options, fields.unit, fields.required, fields.filterable, fields.is_modifier
     FROM used_smartphone_product_characteristics AS characteristics
     LEFT JOIN used_smartphone_characteristic_template_fields AS fields ON fields.id = characteristics.field_id
     WHERE characteristics.product_id = $1
     ORDER BY characteristics.sort_order, characteristics.updated_at`,
    [id]
  );
  const values = {};
  let templateId = null;
  result.rows.forEach((row) => {
    templateId ||= row.template_id || null;
    const json = normalizeJsonObjectValue(row.value_json);
    values[row.key] = Object.hasOwn(json, 'value') ? json.value : row.value_text;
  });
  res.json({ data: { templateId, values } });
}));

router.put('/products/:id/characteristics', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(productCharacteristicsSchema, req.body);
  const client = await pool.connect();
  let product;
  let recipients = [];
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM used_smartphone_products WHERE id = $1 FOR UPDATE', [id]);
    if (!current.rows[0]) throw new AppError(404, 'CATALOG_PRODUCT_NOT_FOUND', 'Товар не знайдено.');
    if (Number(current.rows[0].version) !== input.expectedVersion) {
      throw new AppError(409, 'CATALOG_PRODUCT_VERSION_CONFLICT', 'Товар уже оновлено іншим користувачем. Відкрийте актуальну версію.');
    }
    const previousCharacteristics = await loadProductCharacteristicSet(id, client);
    const template = await loadCharacteristicTemplate(input.templateId, client);
    if (!template) throw new AppError(404, 'CATALOG_TEMPLATE_NOT_FOUND', 'Шаблон характеристик не знайдено.');
    await client.query('DELETE FROM used_smartphone_product_characteristics WHERE product_id = $1', [id]);
    for (const [index, field] of template.fields.entries()) {
      const value = characteristicValueForField(field, input.values);
      await client.query(
        `INSERT INTO used_smartphone_product_characteristics (
           product_id, template_id, field_id, key, label, value_text,
           value_number, value_boolean, value_json, sort_order, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::JSONB, $10, $11)`,
        [
          id,
          template.id,
          field.id,
          field.key,
          field.label,
          characteristicTextValue(value),
          typeof value === 'number' ? value : null,
          typeof value === 'boolean' ? value : null,
          JSON.stringify({ value }),
          field.sortOrder || index,
          req.user.id
        ]
      );
    }
    await client.query(
      `UPDATE used_smartphone_products
       SET updated_by = $1,
           updated_at = NOW(),
           version = version + 1
       WHERE id = $2`,
      [req.user.id, id]
    );
    await logCatalogAudit(client, {
      productId: id,
      actorId: req.user.id,
      action: 'characteristics_update',
      changes: {
        subject: { productCode: current.rows[0].product_code, name: current.rows[0].name },
        ...catalogAuditChanges(
          {
            characteristicTemplate: previousCharacteristics.templateLabel || '',
            characteristicValues: Object.fromEntries(previousCharacteristics.items.map((item) => [item.label, item.value]))
          },
          {
            characteristicTemplate: template.label,
            characteristicValues: Object.fromEntries(template.fields.map((field) => [field.label, characteristicValueForField(field, input.values)]))
          }
        )
      }
    });
    recipients = await getCatalogRecipientIds(client);
    product = await loadCatalogProduct(id, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  publishCatalogUpdates(recipients, { type: 'characteristics_updated', productId: id });
  if (product.publicationStatus === 'PUBLISHED') publishPublicCatalogUpdate({ type: 'characteristics_updated', productId: id });
  res.json({ data: product });
}));

router.get('/products/:id/modifications', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const product = await query('SELECT id FROM used_smartphone_products WHERE id = $1', [id]);
  if (!product.rows[0]) throw new AppError(404, 'CATALOG_PRODUCT_NOT_FOUND', 'Товар не знайдено.');
  res.json({ data: await loadProductModificationSet(id) });
}));

router.put('/products/:id/modifications', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(productModificationsSchema, req.body);
  const client = await pool.connect();
  let product;
  let recipients = [];
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM used_smartphone_products WHERE id = $1 FOR UPDATE', [id]);
    if (!current.rows[0]) throw new AppError(404, 'CATALOG_PRODUCT_NOT_FOUND', 'Товар не знайдено.');
    if (Number(current.rows[0].version) !== input.expectedVersion) {
      throw new AppError(409, 'CATALOG_PRODUCT_VERSION_CONFLICT', 'Товар уже оновлено іншим користувачем. Відкрийте актуальну версію.');
    }
    const previousModifications = await loadProductModificationSet(id, client);

    const uniqueProductIds = [...new Set([id, ...input.productIds])];
    const mainProductId = input.mainProductId && uniqueProductIds.includes(input.mainProductId) ? input.mainProductId : id;
    if (uniqueProductIds.length) {
      const productPlaceholders = uniqueProductIds.map((_, index) => `$${index + 1}`).join(', ');
      const products = await client.query(
        `SELECT id FROM used_smartphone_products WHERE id IN (${productPlaceholders}) AND publication_status <> 'ARCHIVED'`,
        uniqueProductIds
      );
      if (products.rows.length !== uniqueProductIds.length) {
        throw new AppError(422, 'CATALOG_GROUP_PRODUCT_INVALID', 'Один або кілька товарів групи не знайдено або вони архівовані.');
      }
    }

    let groupId = input.groupId || null;
    if (!groupId && (input.groupLabel || uniqueProductIds.length > 1)) {
      const label = input.groupLabel || current.rows[0].name;
      const slug = await makeUniqueGroupSlug(label, null, client);
      const created = await client.query(
        `INSERT INTO used_smartphone_product_groups (label, slug, active, main_product_id, created_by, updated_by)
         VALUES ($1, $2, TRUE, $3, $4, $4)
         RETURNING id`,
        [label, slug, mainProductId, req.user.id]
      );
      groupId = created.rows[0].id;
    } else if (groupId) {
      const existing = await client.query('SELECT * FROM used_smartphone_product_groups WHERE id = $1 FOR UPDATE', [groupId]);
      if (!existing.rows[0]) throw new AppError(404, 'CATALOG_PRODUCT_GROUP_NOT_FOUND', 'Групу модифікацій не знайдено.');
      if (input.groupLabel && input.groupLabel !== existing.rows[0].label) {
        const slug = await makeUniqueGroupSlug(input.groupLabel, groupId, client);
        await client.query(
          `UPDATE used_smartphone_product_groups
           SET label = $1, slug = $2, main_product_id = $3, updated_by = $4, updated_at = NOW()
           WHERE id = $5`,
          [input.groupLabel, slug, mainProductId, req.user.id, groupId]
        );
      } else {
        await client.query(
          `UPDATE used_smartphone_product_groups
           SET main_product_id = $1, updated_by = $2, updated_at = NOW()
           WHERE id = $3`,
          [mainProductId, req.user.id, groupId]
        );
      }
    }

    if (false && groupId && input.parameterIds?.length) {
      const uniqueParameterIds = [...new Set(input.parameterIds)];
      const placeholders = uniqueParameterIds.map((_, index) => `$${index + 1}`).join(', ');
      const parameters = await client.query(
        `SELECT id FROM used_smartphone_modification_parameters WHERE id IN (${placeholders})`,
        uniqueParameterIds
      );
      if (parameters.rows.length !== uniqueParameterIds.length) {
        throw new AppError(422, 'CATALOG_MODIFICATION_PARAMETER_INVALID', 'Один або кілька параметрів модифікацій не знайдено.');
      }
    }

    await syncProductGroupModifications(client, groupId, mainProductId, uniqueProductIds);
    const nextModifications = await loadProductModificationSet(id, client);
    await client.query(
      `UPDATE used_smartphone_products
       SET updated_by = $1,
           updated_at = NOW(),
           version = version + 1
       WHERE id = $2`,
      [req.user.id, id]
    );
    await logCatalogAudit(client, {
      productId: id,
      actorId: req.user.id,
      action: 'modifications_update',
      changes: {
        subject: { productCode: current.rows[0].product_code, name: current.rows[0].name },
        ...catalogAuditChanges(
          {
            modificationGroup: previousModifications.groupLabel || '',
            modificationProducts: previousModifications.items?.map((item) => item.productCode) || []
          },
          {
            modificationGroup: nextModifications.groupLabel || '',
            modificationProducts: nextModifications.items?.map((item) => item.productCode) || []
          }
        )
      }
    });
    recipients = await getCatalogRecipientIds(client);
    product = await loadCatalogProduct(id, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (uniqueViolation(error)) throw new AppError(409, 'CATALOG_MODIFICATION_CONFLICT', 'Таку модифікацію вже налаштовано.');
    throw error;
  } finally {
    client.release();
  }
  publishCatalogUpdates(recipients, { type: 'modifications_updated', productId: id });
  if (product.publicationStatus === 'PUBLISHED') publishPublicCatalogUpdate({ type: 'modifications_updated', productId: id });
  res.json({ data: product });
}));

router.get('/products/:id/media', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const product = await query('SELECT id FROM used_smartphone_products WHERE id = $1', [id]);
  if (!product.rows[0]) throw new AppError(404, 'CATALOG_PRODUCT_NOT_FOUND', 'Товар не знайдено.');
  const result = await query(
    `SELECT *
     FROM used_smartphone_product_media
     WHERE product_id = $1
     ORDER BY role = 'main' DESC, sort_order, created_at`,
    [id]
  );
  res.json({ data: result.rows.map(serializeMedia) });
}));

router.patch('/products/:id/media', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(mediaPatchSchema, req.body);
  const client = await pool.connect();
  let product;
  let recipients = [];
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM used_smartphone_products WHERE id = $1 FOR UPDATE', [id]);
    if (!current.rows[0]) throw new AppError(404, 'CATALOG_PRODUCT_NOT_FOUND', 'Товар не знайдено.');
    if (Number(current.rows[0].version) !== input.expectedVersion) {
      throw new AppError(409, 'CATALOG_PRODUCT_VERSION_CONFLICT', 'Товар уже оновлено іншим користувачем. Відкрийте актуальну версію.');
    }
    await client.query(
      `UPDATE used_smartphone_products
       SET main_image_url = $1,
           gallery = $2::JSONB,
           updated_by = $3,
           updated_at = NOW(),
           version = version + 1
       WHERE id = $4`,
      [input.mainImageUrl, JSON.stringify(input.gallery), req.user.id, id]
    );
    await syncProductMedia(client, id, {
      name: current.rows[0].name,
      mainImageUrl: input.mainImageUrl,
      gallery: input.gallery
    }, req.user.id);
    await logCatalogAudit(client, {
      productId: id,
      actorId: req.user.id,
      action: 'media_update',
      changes: {
        subject: { productCode: current.rows[0].product_code, name: current.rows[0].name },
        ...catalogAuditChanges(
          { mainImageUrl: current.rows[0].main_image_url || '', gallery: normalizeGalleryValue(current.rows[0].gallery) },
          { mainImageUrl: input.mainImageUrl, gallery: input.gallery }
        )
      }
    });
    recipients = await getCatalogRecipientIds(client);
    product = await loadCatalogProduct(id, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  publishCatalogUpdates(recipients, { type: 'media_updated', productId: id });
  if (product.publicationStatus === 'PUBLISHED') publishPublicCatalogUpdate({ type: 'media_updated', productId: id });
  res.json({ data: product });
}));

router.delete('/products/:id/media/:mediaId', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const mediaId = parseInput(idSchema, req.params.mediaId);
  const client = await pool.connect();
  let product;
  let recipients = [];
  try {
    await client.query('BEGIN');
    const media = await client.query(
      'SELECT * FROM used_smartphone_product_media WHERE id = $1 AND product_id = $2 FOR UPDATE',
      [mediaId, id]
    );
    if (!media.rows[0]) throw new AppError(404, 'CATALOG_MEDIA_NOT_FOUND', 'Медіа не знайдено.');
    const current = await client.query('SELECT * FROM used_smartphone_products WHERE id = $1 FOR UPDATE', [id]);
    if (!current.rows[0]) throw new AppError(404, 'CATALOG_PRODUCT_NOT_FOUND', 'Товар не знайдено.');
    const gallery = normalizeGalleryValue(current.rows[0].gallery);
    const nextGallery = gallery.filter((item) => item?.url !== media.rows[0].url);
    const nextMainImageUrl = current.rows[0].main_image_url === media.rows[0].url ? '' : current.rows[0].main_image_url;
    await client.query(
      `UPDATE used_smartphone_products
       SET main_image_url = $1,
           gallery = $2::JSONB,
           updated_by = $3,
           updated_at = NOW(),
           version = version + 1
       WHERE id = $4`,
      [nextMainImageUrl, JSON.stringify(nextGallery), req.user.id, id]
    );
    await client.query('DELETE FROM used_smartphone_product_media WHERE id = $1', [mediaId]);
    await logCatalogAudit(client, {
      productId: id,
      actorId: req.user.id,
      action: 'media_delete',
      changes: {
        subject: { productCode: current.rows[0].product_code, name: current.rows[0].name },
        removedMediaUrl: media.rows[0].url,
        ...catalogAuditChanges(
          { mainImageUrl: current.rows[0].main_image_url || '', gallery },
          { mainImageUrl: nextMainImageUrl, gallery: nextGallery }
        )
      }
    });
    recipients = await getCatalogRecipientIds(client);
    product = await loadCatalogProduct(id, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  publishCatalogUpdates(recipients, { type: 'media_deleted', productId: id });
  if (product.publicationStatus === 'PUBLISHED') publishPublicCatalogUpdate({ type: 'media_deleted', productId: id });
  res.status(204).end();
}));

router.delete('/products/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(deleteProductSchema, req.body || {});
  const client = await pool.connect();
  let previousStatus = '';
  let recipients = [];
  let touchedGroups = [];
  try {
    await client.query('BEGIN');
    const currentResult = await client.query('SELECT * FROM used_smartphone_products WHERE id = $1 FOR UPDATE', [id]);
    const current = currentResult.rows[0];
    if (!current) throw new AppError(404, 'CATALOG_PRODUCT_NOT_FOUND', 'Товар не знайдено.');
    if (Number(current.version) !== input.expectedVersion) {
      throw new AppError(409, 'CATALOG_PRODUCT_VERSION_CONFLICT', 'Товар уже оновлено іншим користувачем. Відкрийте актуальну версію.');
    }
    previousStatus = current.publication_status;
    touchedGroups = await detachProductFromModificationGroups(client, id, {
      groupAction: input.groupAction,
      newMainProductId: input.newMainProductId || null
    });
    await client.query(
      `UPDATE used_smartphone_products
       SET publication_status = 'ARCHIVED',
           updated_by = $1,
           updated_at = NOW(),
           version = version + 1
       WHERE id = $2`,
      [req.user.id, id]
    );
    await logCatalogAudit(client, {
      productId: id,
      actorId: req.user.id,
      action: 'archive',
      changes: {
        subject: { productCode: current.product_code, name: current.name },
        ...catalogAuditChanges(
          { publicationStatus: previousStatus },
          { publicationStatus: 'ARCHIVED' }
        ),
        affectedModificationGroups: touchedGroups
      }
    });
    recipients = await getCatalogRecipientIds(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  publishCatalogUpdates(recipients, { type: 'product_archived', productId: id, groupIds: touchedGroups });
  publishChatUpdates(recipients, { type: 'entity', entityType: 'catalog_product', entityId: id, senderId: req.user.id });
  if (previousStatus === 'PUBLISHED') publishPublicCatalogUpdate({ type: 'product_archived', productId: id });
  res.status(204).end();
}));

router.post('/products', asyncHandler(async (req, res) => {
  const input = parseInput(productInputSchema, req.body);
  const normalizedName = normalizeProductName(input.name);
  if (!normalizedName) throw new AppError(422, 'CATALOG_NAME_INVALID', 'Вкажіть коректну назву товару.');
  const client = await pool.connect();
  let product;
  let recipients = [];
  try {
    await client.query('BEGIN');
    const productCode = await generateProductCode(client);
    const slug = await makeUniqueSlug(input.slug || input.name, null, client, productCode.toLowerCase());
    const descriptionContent = prepareProductDescription(input, req.user);
    assertPublishable({ ...input, slug });
    const created = await client.query(
      `INSERT INTO used_smartphone_products (
         product_code, name, normalized_name, condition, stock_count, incoming_count,
         price_uah, publication_status, slug, brand_id, main_image_url, gallery,
         short_description, description, description_safe_html, description_css, description_js,
         description_has_js, description_source_updated_at, description_source_updated_by,
         seo_title, seo_description, social_description,
         body_condition, display_condition, battery_health, warranty, included_accessories,
         diagnostics, internal_notes, imei_serial, popularity_position, created_by, updated_by
       ) VALUES (
         $29, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::JSONB,
         $12, $13, $14, $15, $16, $17, NOW(), $28,
         $18, $19, $20, $21, $22, $23, $24, $25,
         $26::JSONB, $27, $30, $31, $28, $28
       )
       RETURNING id`,
      [
        ...productParams(input, normalizedName, slug, req.user.id, descriptionContent),
        productCode,
        normalizeCatalogSerial(input.diagnostics.privateSerial),
        input.popularityPosition
      ]
    );
    await syncProductMedia(client, created.rows[0].id, input, req.user.id);
    await logCatalogAudit(client, {
      productId: created.rows[0].id,
      actorId: req.user.id,
      action: 'create',
      changes: {
        subject: { productCode, name: input.name },
        ...catalogAuditChanges({}, catalogAuditProductState({
          ...input,
          productCode,
          slug,
          imeiSerial: normalizeCatalogSerial(input.diagnostics.privateSerial)
        }))
      }
    });
    if (input.description) {
      await logCatalogAudit(client, {
        productId: created.rows[0].id,
        actorId: req.user.id,
        action: 'description_source_create',
        changes: { subject: { productCode, name: input.name }, hasJs: descriptionContent.hasJs, hasCss: Boolean(descriptionContent.css) }
      });
    }
    recipients = await getCatalogRecipientIds(client);
    product = await loadCatalogProduct(created.rows[0].id, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (uniqueViolation(error)) throw new AppError(409, 'CATALOG_PRODUCT_EXISTS', 'Товар з такою назвою і станом або публічним шляхом уже існує.');
    throw error;
  } finally {
    client.release();
  }
  publishCatalogUpdates(recipients, { type: 'product_created', productId: product.id });
  if (product.publicationStatus === 'PUBLISHED') publishPublicCatalogUpdate({ type: 'product_published', productId: product.id });
  res.status(201).json({ data: product });
}));

router.put('/products/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(updateProductSchema, req.body);
  const normalizedName = normalizeProductName(input.name);
  if (!normalizedName) throw new AppError(422, 'CATALOG_NAME_INVALID', 'Вкажіть коректну назву товару.');
  const client = await pool.connect();
  let product;
  let recipients = [];
  let previousStatus = '';
  try {
    await client.query('BEGIN');
    const currentResult = await client.query('SELECT * FROM used_smartphone_products WHERE id = $1 FOR UPDATE', [id]);
    const current = currentResult.rows[0];
    if (!current) throw new AppError(404, 'CATALOG_PRODUCT_NOT_FOUND', 'Товар не знайдено.');
    previousStatus = current.publication_status;
    if (Number(current.version) !== input.expectedVersion) {
      throw new AppError(409, 'CATALOG_PRODUCT_VERSION_CONFLICT', 'Товар уже оновлено іншим користувачем. Відкрийте актуальну версію.');
    }
    const slug = await makeUniqueSlug(input.slug || input.name, id, client, current.product_code.toLowerCase());
    const descriptionContent = prepareProductDescription(input, req.user, current.description);
    assertPublishable({ ...input, slug });
    await client.query(
      `UPDATE used_smartphone_products
       SET name = $1,
           normalized_name = $2,
           condition = $3,
           stock_count = $4,
           incoming_count = $5,
           price_uah = $6,
           publication_status = $7,
           slug = $8,
           brand_id = $9,
           main_image_url = $10,
           gallery = $11::JSONB,
           short_description = $12,
           description = $13,
           description_safe_html = $14,
           description_css = $15,
           description_js = $16,
           description_has_js = $17,
           description_source_updated_at = CASE WHEN $29 THEN NOW() ELSE description_source_updated_at END,
           description_source_updated_by = CASE WHEN $29 THEN $28 ELSE description_source_updated_by END,
           seo_title = $18,
           seo_description = $19,
           social_description = $20,
           body_condition = $21,
           display_condition = $22,
           battery_health = $23,
           warranty = $24,
           included_accessories = $25,
           diagnostics = $26::JSONB,
           internal_notes = $27,
           imei_serial = $31,
           popularity_position = $32,
           updated_by = $28,
           updated_at = NOW(),
           version = version + 1
       WHERE id = $30`,
      [
        ...productParams(input, normalizedName, slug, req.user.id, descriptionContent),
        descriptionContent.sourceChanged,
        id,
        normalizeCatalogSerial(input.diagnostics.privateSerial),
        input.popularityPosition
      ]
    );
    await syncProductMedia(client, id, input, req.user.id);
    await logCatalogAudit(client, {
      productId: id,
      actorId: req.user.id,
      action: 'update',
      changes: {
        subject: { productCode: current.product_code, name: input.name },
        ...catalogAuditChanges(
          catalogAuditProductState(current),
          catalogAuditProductState({
            ...input,
            productCode: current.product_code,
            slug,
            imeiSerial: normalizeCatalogSerial(input.diagnostics.privateSerial)
          })
        )
      }
    });
    if (descriptionContent.sourceChanged) {
      await logCatalogAudit(client, {
        productId: id,
        actorId: req.user.id,
        action: 'description_source_update',
        changes: { subject: { productCode: current.product_code, name: input.name }, hasJs: descriptionContent.hasJs, hasCss: Boolean(descriptionContent.css) }
      });
    }
    recipients = await getCatalogRecipientIds(client);
    product = await loadCatalogProduct(id, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (uniqueViolation(error)) throw new AppError(409, 'CATALOG_PRODUCT_EXISTS', 'Товар з такою назвою і станом або публічним шляхом уже існує.');
    throw error;
  } finally {
    client.release();
  }
  publishCatalogUpdates(recipients, { type: 'product_updated', productId: id });
  publishChatUpdates(recipients, { type: 'entity', entityType: 'catalog_product', entityId: id, senderId: req.user.id });
  if (publicWasTouched(previousStatus, product.publicationStatus)) {
    publishPublicCatalogUpdate({ type: 'product_updated', productId: id });
  }
  res.json({ data: product });
}));

router.patch('/products/:id/publication-status', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(statusSchema, req.body);
  const client = await pool.connect();
  let product;
  let recipients = [];
  let previousStatus = '';
  try {
    await client.query('BEGIN');
    const currentResult = await client.query('SELECT * FROM used_smartphone_products WHERE id = $1 FOR UPDATE', [id]);
    const current = currentResult.rows[0];
    if (!current) throw new AppError(404, 'CATALOG_PRODUCT_NOT_FOUND', 'Товар не знайдено.');
    previousStatus = current.publication_status;
    if (Number(current.version) !== input.expectedVersion) {
      throw new AppError(409, 'CATALOG_PRODUCT_VERSION_CONFLICT', 'Товар уже оновлено іншим користувачем. Відкрийте актуальну версію.');
    }
    if (input.status === 'PUBLISHED') {
      validatePublicationReady({
        name: current.name,
        condition: current.condition,
        priceUah: current.price_uah,
        mainImageUrl: current.main_image_url,
        slug: current.slug
      });
    }
    await client.query(
      `UPDATE used_smartphone_products
       SET publication_status = $1,
           updated_by = $2,
           updated_at = NOW(),
           version = version + 1
       WHERE id = $3`,
      [input.status, req.user.id, id]
    );
    await logCatalogAudit(client, {
      productId: id,
      actorId: req.user.id,
      action: 'publication_status',
      changes: {
        subject: { productCode: current.product_code, name: current.name },
        ...catalogAuditChanges(
          { publicationStatus: previousStatus },
          { publicationStatus: input.status }
        )
      }
    });
    recipients = await getCatalogRecipientIds(client);
    product = await loadCatalogProduct(id, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  publishCatalogUpdates(recipients, { type: 'publication_status', productId: id, status: input.status });
  publishChatUpdates(recipients, { type: 'entity', entityType: 'catalog_product', entityId: id, senderId: req.user.id });
  if (publicWasTouched(previousStatus, input.status)) {
    publishPublicCatalogUpdate({ type: 'publication_status', productId: id, status: input.status });
  }
  res.json({ data: product });
}));

router.get('/audit', asyncHandler(async (req, res) => {
  const input = parseInput(auditHistorySchema, {
    search: String(req.query.search || ''),
    source: req.query.source || 'all',
    category: req.query.category || 'all',
    actorId: req.query.actorId || undefined,
    dateFrom: req.query.dateFrom || undefined,
    dateTo: req.query.dateTo || undefined,
    page: req.query.page || 1,
    pageSize: req.query.pageSize || 25
  });
  const requestedLimit = input.page * input.pageSize;
  const [manual, imports, manualActors, importActors] = await Promise.all([
    loadManualAuditHistory(input, requestedLimit),
    loadImportAuditHistory(input, requestedLimit),
    query(
      `SELECT DISTINCT users.id, users.name
       FROM used_smartphone_audit_log AS audit
       INNER JOIN users ON users.id = audit.actor_id
       ORDER BY users.name`
    ),
    query(
      `SELECT DISTINCT users.id, users.name
       FROM used_smartphone_imports AS imports
       INNER JOIN users ON users.id = imports.created_by
       ORDER BY users.name`
    )
  ]);
  const offset = (input.page - 1) * input.pageSize;
  const items = [
    ...manual.rows.map(serializeAuditHistoryItem),
    ...imports.rows.map(serializeImportHistoryItem)
  ]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() || right.id.localeCompare(left.id))
    .slice(offset, offset + input.pageSize);
  const actorMap = new Map();
  [...manualActors.rows, ...importActors.rows].forEach((row) => actorMap.set(row.id, { id: row.id, name: row.name || '' }));
  const total = manual.total + imports.total;
  res.json({ data: {
    items,
    actors: [...actorMap.values()].sort((left, right) => left.name.localeCompare(right.name, 'uk')),
    total,
    page: input.page,
    pageSize: input.pageSize,
    pageCount: Math.max(1, Math.ceil(total / input.pageSize))
  } });
}));

router.post('/imports/preview', asyncHandler(async (req, res) => {
  const input = parseInput(importPreviewSchema, req.body);
  const preview = await analyzeImportRows(input.rows);
  res.json({ data: preview });
}));

router.get('/imports/template', asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: await loadCatalogImportSchema() });
}));

router.post('/imports/commit', asyncHandler(async (req, res) => {
  const input = parseInput(importCommitSchema, req.body);
  const client = await pool.connect();
  let result;
  let recipients = [];
  try {
    await client.query('BEGIN');
    result = await commitImportRows(input.rows, input, req.user.id, client);
    recipients = await getCatalogRecipientIds(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  publishCatalogUpdates(recipients, { type: 'import_committed', importId: result.importId });
  const publicRows = result.rows.filter((row) => row.currentPublicationStatus === 'PUBLISHED');
  if (publicRows.length) publishPublicCatalogUpdate({ type: 'import_committed', importId: result.importId });
  res.status(201).json({ data: result });
}));

router.get('/imports', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT imports.*, users.name AS created_by_name
     FROM used_smartphone_imports AS imports
     LEFT JOIN users ON users.id = imports.created_by
     ORDER BY imports.created_at DESC
     LIMIT 50`
  );
  res.json({ data: result.rows.map((row) => ({
    id: row.id,
    createdBy: row.created_by ? { id: row.created_by, name: row.created_by_name || '' } : null,
    options: row.options || {},
    summary: row.summary || {},
    createdAt: row.created_at
  })) });
}));

router.get('/imports/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(importHistoryDetailSchema, {
    page: req.query.page || 1,
    pageSize: req.query.pageSize || 50
  });
  const importResult = await query(
    `SELECT imports.*, users.name AS created_by_name
     FROM used_smartphone_imports AS imports
     LEFT JOIN users ON users.id = imports.created_by
     WHERE imports.id = $1`,
    [id]
  );
  const importRow = importResult.rows[0];
  if (!importRow) throw new AppError(404, 'CATALOG_IMPORT_NOT_FOUND', 'Імпорт не знайдено.');
  const countResult = await query(
    'SELECT COUNT(*)::INTEGER AS total FROM used_smartphone_import_rows WHERE import_id = $1',
    [id]
  );
  const rowsResult = await query(
    `SELECT import_rows.*, products.product_code
     FROM used_smartphone_import_rows AS import_rows
     LEFT JOIN used_smartphone_products AS products ON products.id = import_rows.product_id
     WHERE import_rows.import_id = $1
     ORDER BY import_rows.row_number
     LIMIT $2 OFFSET $3`,
    [id, input.pageSize, (input.page - 1) * input.pageSize]
  );
  const total = Number(countResult.rows[0]?.total || 0);
  res.json({ data: {
    id: importRow.id,
    createdBy: importRow.created_by ? { id: importRow.created_by, name: importRow.created_by_name || '' } : null,
    options: importRow.options || {},
    summary: importRow.summary || {},
    createdAt: importRow.created_at,
    rows: rowsResult.rows.map((row) => ({
      id: row.id,
      rowNumber: row.row_number,
      action: row.action,
      result: row.result,
      reason: row.reason || '',
      productId: row.product_id || null,
      productCode: row.product_code || '',
      name: row.name || '',
      condition: row.condition || '',
      conditionLabel: conditionLabels[row.condition] || row.condition || '',
      stockCount: row.stock_count === null ? null : Number(row.stock_count),
      incomingCount: row.incoming_count === null ? null : Number(row.incoming_count),
      priceUah: row.price_uah === null ? null : Number(row.price_uah),
      identityKey: row.identity_key || '',
      brandId: row.brand_id || null,
      templateId: row.template_id || null,
      payload: row.payload || {},
      createdAt: row.created_at
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
    pageCount: Math.max(1, Math.ceil(total / input.pageSize))
  } });
}));

router.get('/storefront-settings', asyncHandler(async (req, res) => {
  res.json({ data: await loadSettings() });
}));

router.patch('/storefront-settings', asyncHandler(async (req, res) => {
  const input = parseInput(settingsSchema, req.body);
  const client = await pool.connect();
  let saved;
  try {
    await client.query('BEGIN');
    const current = await loadSettings(client);
    const next = {
      selectedFormPublicId: Object.hasOwn(req.body || {}, 'selectedFormPublicId') ? input.selectedFormPublicId || null : current.selectedFormPublicId,
      publicOrigin: Object.hasOwn(req.body || {}, 'publicOrigin') ? normalizeStorefrontOrigin(input.publicOrigin) : current.publicOrigin,
      storefrontTheme: input.storefrontTheme || current.storefrontTheme,
      productCardTheme: input.productCardTheme || current.productCardTheme,
      productPageTheme: input.productPageTheme || current.productPageTheme
    };
    if (next.selectedFormPublicId) {
      const form = await client.query(
        'SELECT public_id FROM application_forms WHERE public_id = $1 AND status = $2',
        [next.selectedFormPublicId, 'published']
      );
      if (!form.rows[0]) throw new AppError(422, 'CATALOG_FORM_NOT_PUBLISHED', 'Оберіть опубліковану форму заявок.');
    }
    const result = await client.query(
      `UPDATE used_smartphone_storefront_settings
       SET selected_form_public_id = $1,
           public_origin = $2,
           storefront_theme = $3::JSONB,
           product_card_theme = $4::JSONB,
           product_page_theme = $5::JSONB,
           updated_by = $6,
           updated_at = NOW()
       WHERE id = TRUE
       RETURNING selected_form_public_id, public_origin, storefront_theme, product_card_theme, product_page_theme, updated_at`,
      [next.selectedFormPublicId, next.publicOrigin, JSON.stringify(next.storefrontTheme), JSON.stringify(next.productCardTheme), JSON.stringify(next.productPageTheme), req.user.id]
    );
    saved = {
      selectedFormPublicId: result.rows[0].selected_form_public_id || null,
      publicOrigin: result.rows[0].public_origin || '',
      storefrontTheme: normalizeStorefrontTheme(result.rows[0].storefront_theme),
      productCardTheme: normalizeProductCardTheme(result.rows[0].product_card_theme),
      productPageTheme: normalizeProductPageTheme(result.rows[0].product_page_theme),
      updatedAt: result.rows[0].updated_at
    };
    await logCatalogAudit(client, {
      actorId: req.user.id,
      action: 'storefront_settings_update',
      changes: catalogAuditChanges(
        { ...current, updatedAt: undefined },
        { ...saved, updatedAt: undefined }
      )
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  cacheSavedStorefrontOrigin(saved.publicOrigin);
  publishPublicCatalogUpdate({ type: 'settings_updated' });
  res.json({ data: saved });
}));

router.get('/meta', (req, res) => {
  res.json({ data: {
    conditions: productConditions.map((value) => ({ value, label: conditionLabels[value] })),
    publicationStatuses: publicationStatuses.map((value) => ({ value, label: publicationStatusLabels[value] }))
  } });
});

export default router;
