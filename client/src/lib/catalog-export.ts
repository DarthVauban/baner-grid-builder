import * as XLSX from 'xlsx';
import type { CatalogExportFeed, CatalogProduct, CatalogProductCharacteristicItem } from '../types/catalog';

type ExportCell = string | number | boolean | Date | null;

type CharacteristicColumn = {
  id: string;
  header: string;
  width: number;
  templateId: string | null;
  templateLabel: string;
  key: string;
  sortOrder: number;
};

const coreColumns = [
  { header: 'Код товару', width: 16, value: (product: CatalogProduct) => product.productCode },
  { header: 'Назва', width: 38, value: (product: CatalogProduct) => product.name },
  { header: 'Стан', width: 16, value: (product: CatalogProduct) => product.conditionLabel },
  { header: 'Статус публікації', width: 20, value: (product: CatalogProduct) => product.publicationStatusLabel },
  { header: 'Позиція популярності', width: 22, value: (product: CatalogProduct) => product.popularityPosition },
  { header: 'Довідник брендів', width: 26, value: (product: CatalogProduct) => product.brand?.directoryLabel || '' },
  { header: 'Бренд', width: 20, value: (product: CatalogProduct) => product.brand?.label || '' },
  { header: 'Slug', width: 30, value: (product: CatalogProduct) => product.slug },
  { header: 'Ціна', width: 14, value: (product: CatalogProduct) => product.priceUah },
  { header: 'Залишок', width: 12, value: (product: CatalogProduct) => product.stockCount },
  { header: 'В дорозі', width: 12, value: (product: CatalogProduct) => product.incomingCount },
  { header: 'Наявність', width: 18, value: (product: CatalogProduct) => product.availability.label },
  { header: 'Короткий опис', width: 38, value: (product: CatalogProduct) => product.shortDescription },
  { header: 'Повний опис', width: 52, value: (product: CatalogProduct) => product.description },
  { header: 'Стан корпусу', width: 24, value: (product: CatalogProduct) => product.bodyCondition },
  { header: 'Стан дисплея', width: 24, value: (product: CatalogProduct) => product.displayCondition },
  { header: 'Акумулятор', width: 18, value: (product: CatalogProduct) => product.batteryHealth },
  { header: 'Гарантія', width: 20, value: (product: CatalogProduct) => product.warranty },
  { header: 'Комплектація', width: 30, value: (product: CatalogProduct) => product.includedAccessories },
  { header: 'Дефекти', width: 34, value: (product: CatalogProduct) => String(product.diagnostics.defectsText || '') },
  { header: 'Шаблон характеристик', width: 30, value: (product: CatalogProduct) => product.characteristics?.templateLabel || '' }
] satisfies Array<{ header: string; width: number; value: (product: CatalogProduct) => ExportCell }>;

function characteristicValue(value: unknown): ExportCell {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return typeof value === 'boolean' ? (value ? 'Так' : 'Ні') : value;
  if (Array.isArray(value)) return value.map(String).join('; ');
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>;
    const name = String(item.name || item.label || '').trim();
    const hex = String(item.hex || '').trim();
    return [name, hex].filter(Boolean).join(' | ') || JSON.stringify(item);
  }
  return String(value);
}

function characteristicColumns(products: CatalogProduct[]): CharacteristicColumn[] {
  const columns = new Map<string, CharacteristicColumn>();
  products.forEach((product) => {
    const templateId = product.characteristics?.templateId || null;
    const templateLabel = product.characteristics?.templateLabel || 'Характеристики';
    product.characteristics?.items.forEach((item) => {
      const id = `${templateId || 'legacy'}:${item.key}`;
      if (columns.has(id)) return;
      const header = templateId
        ? `${templateLabel} · ${item.label} [${templateId}:${item.key}]`
        : `${templateLabel} · ${item.label} [${item.key}]`;
      columns.set(id, {
        id,
        header,
        width: Math.min(84, Math.max(32, header.length + 2)),
        templateId,
        templateLabel,
        key: item.key,
        sortOrder: item.sortOrder
      });
    });
  });
  return [...columns.values()].sort((left, right) => (
    left.templateLabel.localeCompare(right.templateLabel, 'uk')
    || left.sortOrder - right.sortOrder
    || left.header.localeCompare(right.header, 'uk')
  ));
}

function characteristicForProduct(product: CatalogProduct, column: CharacteristicColumn): CatalogProductCharacteristicItem | undefined {
  if ((product.characteristics?.templateId || null) !== column.templateId) return undefined;
  return product.characteristics?.items.find((item) => item.key === column.key);
}

function validDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildCatalogExportWorkbook(feed: CatalogExportFeed, { filtered = false } = {}) {
  const dynamicColumns = characteristicColumns(feed.items);
  const trailingColumns = [
    { header: 'Серійний номер / IMEI', width: 28 },
    { header: 'Створено', width: 20 },
    { header: 'Оновлено', width: 20 }
  ];
  const headers = [
    ...coreColumns.map((column) => column.header),
    ...dynamicColumns.map((column) => column.header),
    ...trailingColumns.map((column) => column.header)
  ];
  const rows: ExportCell[][] = feed.items.map((product) => [
    ...coreColumns.map((column) => column.value(product)),
    ...dynamicColumns.map((column) => characteristicValue(characteristicForProduct(product, column)?.value)),
    String(product.diagnostics.privateSerial || ''),
    validDate(product.createdAt),
    validDate(product.updatedAt)
  ]);

  const workbook = XLSX.utils.book_new();
  const productsSheet = XLSX.utils.aoa_to_sheet([headers, ...rows], { cellDates: true });
  productsSheet['!cols'] = [
    ...coreColumns.map((column) => ({ wch: column.width })),
    ...dynamicColumns.map((column) => ({ wch: column.width })),
    ...trailingColumns.map((column) => ({ wch: column.width }))
  ];
  productsSheet['!rows'] = [{ hpt: 24 }];
  productsSheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, rows.length), c: Math.max(0, headers.length - 1) } })
  };
  const priceColumn = coreColumns.findIndex((column) => column.header === 'Ціна');
  const positionColumn = coreColumns.findIndex((column) => column.header === 'Позиція популярності');
  const stockColumn = coreColumns.findIndex((column) => column.header === 'Залишок');
  const incomingColumn = coreColumns.findIndex((column) => column.header === 'В дорозі');
  const createdColumn = headers.length - 2;
  const updatedColumn = headers.length - 1;
  for (let row = 1; row <= rows.length; row += 1) {
    const priceCell = productsSheet[XLSX.utils.encode_cell({ r: row, c: priceColumn })];
    if (priceCell) priceCell.z = '#,##0.00';
    [positionColumn, stockColumn, incomingColumn].forEach((column) => {
      const cell = productsSheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell) cell.z = '#,##0';
    });
    [createdColumn, updatedColumn].forEach((column) => {
      const cell = productsSheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell) cell.z = 'yyyy-mm-dd hh:mm';
    });
  }
  XLSX.utils.book_append_sheet(workbook, productsSheet, 'Товари');

  const metaSheet = XLSX.utils.aoa_to_sheet([
    ['Тип вибірки', filtered ? 'Поточні фільтри каталогу' : 'Усі товари каталогу'],
    ['Кількість товарів', feed.total],
    ['Сформовано', validDate(feed.generatedAt) || feed.generatedAt]
  ], { cellDates: true });
  metaSheet['!cols'] = [{ wch: 24 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(workbook, metaSheet, '_meta');
  workbook.Workbook = {
    ...workbook.Workbook,
    Sheets: workbook.SheetNames.map((name) => ({ name, Hidden: name === '_meta' ? 1 : 0 }))
  };
  workbook.Props = {
    Title: 'Експорт каталогу смартфонів',
    Subject: filtered ? 'Поточна вибірка товарів' : 'Усі товари каталогу',
    Author: 'MT Workspace',
    CreatedDate: validDate(feed.generatedAt) || new Date()
  };
  return workbook;
}

export function catalogExportFileName(date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  return `used-smartphones-export-${day}.xlsx`;
}
