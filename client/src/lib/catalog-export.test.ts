import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { CatalogExportFeed, CatalogProduct } from '../types/catalog';
import { buildCatalogExportWorkbook, catalogExportFileName } from './catalog-export';

const templateId = '11111111-1111-4111-8111-111111111111';

const product: CatalogProduct = {
  id: '22222222-2222-4222-8222-222222222222',
  productCode: 'SM-000123',
  name: 'iPhone 13 128GB Midnight',
  normalizedName: 'iphone 13 128gb midnight',
  condition: 'USED',
  conditionLabel: 'Вживаний',
  stockCount: 3,
  incomingCount: 1,
  availability: { status: 'in_stock', label: 'В наявності' },
  priceUah: 18999,
  popularityPosition: 7,
  priceLabel: '18 999 ₴',
  publicationStatus: 'PUBLISHED',
  publicationStatusLabel: 'Опубліковано',
  slug: 'iphone-13-128gb-midnight',
  publicPath: '/storefront/smartphones/iphone-13-128gb-midnight',
  brand: { id: 'brand-1', label: 'Apple', directoryId: 'directory-1', directoryLabel: 'Смартфони' },
  mainImageUrl: '',
  gallery: [],
  shortDescription: '=HYPERLINK("https://example.com")',
  description: '<p>Повний опис</p>',
  characteristics: {
    templateId,
    templateLabel: 'Смартфони',
    items: [{
      key: 'battery_health',
      label: 'Стан акумулятора',
      type: 'number',
      value: 91,
      displayValue: '91 %',
      unit: '%',
      filterable: true,
      isModifier: false,
      sortOrder: 2
    }]
  },
  seoTitle: '',
  seoDescription: '',
  socialDescription: '',
  bodyCondition: 'Незначні сліди',
  displayCondition: 'Без подряпин',
  batteryHealth: '91%',
  warranty: '3 місяці',
  includedAccessories: 'Кабель',
  diagnostics: { defectsText: 'Без дефектів', privateSerial: 'IMEI-123' },
  internalNotes: '',
  version: 1,
  createdAt: '2026-07-20T10:15:00.000Z',
  updatedAt: '2026-07-22T12:30:00.000Z'
};

describe('catalog XLSX export', () => {
  it('creates a filtered, import-compatible workbook with raw characteristic values', () => {
    const feed: CatalogExportFeed = {
      items: [product],
      total: 1,
      generatedAt: '2026-07-22T13:00:00.000Z'
    };
    const binary = XLSX.write(buildCatalogExportWorkbook(feed, { filtered: true }), {
      type: 'array',
      bookType: 'xlsx',
      compression: true
    });
    const reopened = XLSX.read(binary, { type: 'array', cellDates: true });
    const sheet = reopened.Sheets['Товари'];
    const rows = XLSX.utils.sheet_to_json<Array<string | number | Date>>(sheet, { header: 1, raw: true });
    const headers = rows[0];
    const values = rows[1];
    const characteristicHeader = `Смартфони · Стан акумулятора [${templateId}:battery_health]`;

    expect(reopened.SheetNames).toEqual(['Товари', '_meta']);
    expect(headers).toContain('Код товару');
    expect(headers).toContain('Позиція популярності');
    expect(headers).toContain('Стан корпусу');
    expect(headers).toContain(characteristicHeader);
    expect(headers).toContain('Серійний номер / IMEI');
    expect(values[headers.indexOf('Код товару')]).toBe('SM-000123');
    expect(values[headers.indexOf('Позиція популярності')]).toBe(7);
    expect(values[headers.indexOf(characteristicHeader)]).toBe(91);
    expect(values[headers.indexOf('Серійний номер / IMEI')]).toBe('IMEI-123');
    expect(values[headers.indexOf('Створено')]).toBeInstanceOf(Date);
    const shortDescriptionCell = sheet[XLSX.utils.encode_cell({ r: 1, c: headers.indexOf('Короткий опис') })];
    expect(shortDescriptionCell.t).toBe('s');
    expect(shortDescriptionCell.f).toBeUndefined();
    const filterRange = XLSX.utils.decode_range(sheet['!autofilter']!.ref);
    expect(filterRange.s.r).toBe(0);
    expect(filterRange.e.r).toBe(1);
    expect(reopened.Workbook?.Sheets?.find((item) => item.name === '_meta')?.Hidden).toBe(1);
    const metaRows = XLSX.utils.sheet_to_json<Array<string | number>>(reopened.Sheets._meta, { header: 1 });
    expect(metaRows[0]).toEqual(['Тип вибірки', 'Поточні фільтри каталогу']);
    expect(metaRows[1]).toEqual(['Кількість товарів', 1]);
  });

  it('uses a stable date-based file name', () => {
    expect(catalogExportFileName(new Date('2026-07-22T23:59:00.000Z'))).toBe('used-smartphones-export-2026-07-22.xlsx');
  });
});
