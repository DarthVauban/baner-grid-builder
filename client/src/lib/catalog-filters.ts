import type {
  CatalogAvailabilityStatus,
  CatalogCondition,
  CatalogModificationFilter,
  CatalogPresenceFilter,
  CatalogProductListParams,
  CatalogPublicationStatus,
  CatalogReadinessFilter
} from '../types/catalog';

export interface CatalogAdminFilterState {
  search: string;
  conditions: CatalogCondition[];
  statuses: CatalogPublicationStatus[];
  availabilities: CatalogAvailabilityStatus[];
  brandIds: string[];
  brandDirectoryIds: string[];
  templateIds: string[];
  priceMin: string;
  priceMax: string;
  stockMin: string;
  stockMax: string;
  incomingMin: string;
  incomingMax: string;
  photoStatus: CatalogPresenceFilter;
  descriptionStatus: CatalogPresenceFilter;
  characteristicsStatus: CatalogPresenceFilter;
  serialStatus: CatalogPresenceFilter;
  readiness: CatalogReadinessFilter;
  modification: CatalogModificationFilter;
  createdFrom: string;
  createdTo: string;
  updatedFrom: string;
  updatedTo: string;
  productList: string;
  characteristics: Record<string, string[]>;
  sort: string;
  page: number;
}

export const defaultCatalogAdminFilters: CatalogAdminFilterState = {
  search: '',
  conditions: [],
  statuses: [],
  availabilities: [],
  brandIds: [],
  brandDirectoryIds: [],
  templateIds: [],
  priceMin: '',
  priceMax: '',
  stockMin: '',
  stockMax: '',
  incomingMin: '',
  incomingMax: '',
  photoStatus: 'all',
  descriptionStatus: 'all',
  characteristicsStatus: 'all',
  serialStatus: 'all',
  readiness: 'all',
  modification: 'all',
  createdFrom: '',
  createdTo: '',
  updatedFrom: '',
  updatedTo: '',
  productList: '',
  characteristics: {},
  sort: 'updated_desc',
  page: 1
};

const filterQueryKeys: Array<keyof CatalogAdminFilterState | 'characteristics'> = [
  'search', 'conditions', 'statuses', 'availabilities', 'brandIds', 'brandDirectoryIds', 'templateIds',
  'priceMin', 'priceMax', 'stockMin', 'stockMax', 'incomingMin', 'incomingMax',
  'photoStatus', 'descriptionStatus', 'characteristicsStatus', 'serialStatus', 'readiness', 'modification',
  'createdFrom', 'createdTo', 'updatedFrom', 'updatedTo', 'productList', 'characteristics', 'sort', 'page'
];

function enumList<T extends string>(value: string | null, allowed: readonly T[]) {
  const allowedSet = new Set<string>(allowed);
  return [...new Set(String(value || '').split(',').map((item) => item.trim()).filter((item): item is T => allowedSet.has(item)))];
}

function stringList(value: string | null) {
  return [...new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean))].slice(0, 100);
}

function enumValue<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function characteristicFilters(value: string | null) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).map(([key, values]) => [
      key,
      [...new Set((Array.isArray(values) ? values : [values]).map(String).map((item) => item.trim()).filter(Boolean))]
    ]).filter(([key, values]) => key && values.length)) as Record<string, string[]>;
  } catch {
    return {};
  }
}

export function parseCatalogAdminFilters(params: URLSearchParams): CatalogAdminFilterState {
  const parsedPage = Number(params.get('page') || 1);
  return {
    search: params.get('search') || '',
    conditions: enumList(params.get('conditions'), ['USED', 'REFURBISHED'] as const),
    statuses: enumList(params.get('statuses'), ['DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED'] as const),
    availabilities: enumList(params.get('availabilities'), ['in_stock', 'incoming', 'unavailable'] as const),
    brandIds: stringList(params.get('brandIds')),
    brandDirectoryIds: stringList(params.get('brandDirectoryIds')),
    templateIds: stringList(params.get('templateIds')),
    priceMin: params.get('priceMin') || '',
    priceMax: params.get('priceMax') || '',
    stockMin: params.get('stockMin') || '',
    stockMax: params.get('stockMax') || '',
    incomingMin: params.get('incomingMin') || '',
    incomingMax: params.get('incomingMax') || '',
    photoStatus: enumValue(params.get('photoStatus'), ['all', 'present', 'missing'] as const, 'all'),
    descriptionStatus: enumValue(params.get('descriptionStatus'), ['all', 'present', 'missing'] as const, 'all'),
    characteristicsStatus: enumValue(params.get('characteristicsStatus'), ['all', 'present', 'missing'] as const, 'all'),
    serialStatus: enumValue(params.get('serialStatus'), ['all', 'present', 'missing'] as const, 'all'),
    readiness: enumValue(params.get('readiness'), ['all', 'ready', 'not_ready'] as const, 'all'),
    modification: enumValue(params.get('modification'), ['all', 'ungrouped', 'main', 'child'] as const, 'all'),
    createdFrom: params.get('createdFrom') || '',
    createdTo: params.get('createdTo') || '',
    updatedFrom: params.get('updatedFrom') || '',
    updatedTo: params.get('updatedTo') || '',
    productList: params.get('productList') || '',
    characteristics: characteristicFilters(params.get('characteristics')),
    sort: enumValue(params.get('sort'), ['updated_desc', 'name_asc', 'price_asc', 'price_desc', 'stock_asc', 'stock_desc'] as const, 'updated_desc'),
    page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
  };
}

function setQueryValue(params: URLSearchParams, key: string, value: string | number | undefined, defaultValue: string | number = '') {
  if (value === undefined || value === '' || value === defaultValue) params.delete(key);
  else params.set(key, String(value));
}

export function serializeCatalogAdminFilters(state: CatalogAdminFilterState, current?: URLSearchParams) {
  const params = new URLSearchParams(current || undefined);
  filterQueryKeys.forEach((key) => params.delete(key));
  setQueryValue(params, 'search', state.search);
  setQueryValue(params, 'conditions', state.conditions.join(','));
  setQueryValue(params, 'statuses', state.statuses.join(','));
  setQueryValue(params, 'availabilities', state.availabilities.join(','));
  setQueryValue(params, 'brandIds', state.brandIds.join(','));
  setQueryValue(params, 'brandDirectoryIds', state.brandDirectoryIds.join(','));
  setQueryValue(params, 'templateIds', state.templateIds.join(','));
  setQueryValue(params, 'priceMin', state.priceMin);
  setQueryValue(params, 'priceMax', state.priceMax);
  setQueryValue(params, 'stockMin', state.stockMin);
  setQueryValue(params, 'stockMax', state.stockMax);
  setQueryValue(params, 'incomingMin', state.incomingMin);
  setQueryValue(params, 'incomingMax', state.incomingMax);
  setQueryValue(params, 'photoStatus', state.photoStatus, 'all');
  setQueryValue(params, 'descriptionStatus', state.descriptionStatus, 'all');
  setQueryValue(params, 'characteristicsStatus', state.characteristicsStatus, 'all');
  setQueryValue(params, 'serialStatus', state.serialStatus, 'all');
  setQueryValue(params, 'readiness', state.readiness, 'all');
  setQueryValue(params, 'modification', state.modification, 'all');
  setQueryValue(params, 'createdFrom', state.createdFrom);
  setQueryValue(params, 'createdTo', state.createdTo);
  setQueryValue(params, 'updatedFrom', state.updatedFrom);
  setQueryValue(params, 'updatedTo', state.updatedTo);
  setQueryValue(params, 'productList', state.productList);
  setQueryValue(params, 'characteristics', Object.keys(state.characteristics).length ? JSON.stringify(state.characteristics) : '');
  setQueryValue(params, 'sort', state.sort, 'updated_desc');
  setQueryValue(params, 'page', state.page, 1);
  return params;
}

export function catalogAdminFiltersToApi(state: CatalogAdminFilterState, pageSize = 25): CatalogProductListParams {
  return {
    search: state.search,
    conditions: state.conditions.join(','),
    statuses: state.statuses.join(','),
    availabilities: state.availabilities.join(','),
    brandIds: state.brandIds.join(','),
    brandDirectoryIds: state.brandDirectoryIds.join(','),
    templateIds: state.templateIds.join(','),
    priceMin: state.priceMin,
    priceMax: state.priceMax,
    stockMin: state.stockMin,
    stockMax: state.stockMax,
    incomingMin: state.incomingMin,
    incomingMax: state.incomingMax,
    photoStatus: state.photoStatus,
    descriptionStatus: state.descriptionStatus,
    characteristicsStatus: state.characteristicsStatus,
    serialStatus: state.serialStatus,
    readiness: state.readiness,
    modification: state.modification,
    createdFrom: state.createdFrom,
    createdTo: state.createdTo,
    updatedFrom: state.updatedFrom,
    updatedTo: state.updatedTo,
    productList: state.productList,
    characteristics: Object.keys(state.characteristics).length ? JSON.stringify(state.characteristics) : '',
    sort: state.sort,
    page: state.page,
    pageSize
  };
}

export function countPastedCatalogProducts(value: string) {
  return normalizePastedCatalogProductList(value).split('\n').filter(Boolean).length;
}

export function normalizePastedCatalogProductList(value: string) {
  const seen = new Set<string>();
  return String(value || '').split(/\r?\n/).map((item) => item.trim()).filter((item) => {
    const key = item.toLocaleLowerCase('uk-UA');
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 200).join('\n');
}

export function catalogAdvancedFilterCount(state: CatalogAdminFilterState) {
  return [
    state.conditions.length, state.statuses.length, state.availabilities.length, state.brandIds.length,
    state.brandDirectoryIds.length, state.templateIds.length, state.priceMin || state.priceMax,
    state.stockMin || state.stockMax, state.incomingMin || state.incomingMax,
    state.photoStatus !== 'all', state.descriptionStatus !== 'all', state.characteristicsStatus !== 'all',
    state.serialStatus !== 'all', state.readiness !== 'all', state.modification !== 'all',
    state.createdFrom || state.createdTo, state.updatedFrom || state.updatedTo,
    countPastedCatalogProducts(state.productList), Object.keys(state.characteristics).length
  ].filter(Boolean).length;
}
