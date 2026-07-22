import { describe, expect, it } from 'vitest';
import {
  catalogAdminFiltersToApi,
  countPastedCatalogProducts,
  defaultCatalogAdminFilters,
  parseCatalogAdminFilters,
  serializeCatalogAdminFilters
} from './catalog-filters';

describe('catalog admin filters', () => {
  it('round-trips advanced filters and preserves the opened product', () => {
    const current = new URLSearchParams({ product: 'product-id' });
    const serialized = serializeCatalogAdminFilters({
      ...defaultCatalogAdminFilters,
      conditions: ['USED', 'REFURBISHED'],
      brandIds: ['brand-1', 'brand-2'],
      priceMin: '10000',
      productList: 'US-0001\niPhone 15',
      characteristics: { storage: ['128', '256'] },
      page: 3
    }, current);

    expect(serialized.get('product')).toBe('product-id');
    expect(parseCatalogAdminFilters(serialized)).toMatchObject({
      conditions: ['USED', 'REFURBISHED'],
      brandIds: ['brand-1', 'brand-2'],
      priceMin: '10000',
      productList: 'US-0001\niPhone 15',
      characteristics: { storage: ['128', '256'] },
      page: 3
    });
  });

  it('normalizes a pasted column and sends it unchanged to the API', () => {
    const productList = 'US-0001\r\niPhone 15\nUS-0001\n\n';
    expect(countPastedCatalogProducts(productList)).toBe(2);
    expect(catalogAdminFiltersToApi({ ...defaultCatalogAdminFilters, productList }).productList).toBe(productList);
  });
});
