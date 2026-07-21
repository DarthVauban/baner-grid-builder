import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { CatalogImportTemplateField, CatalogImportTemplateSchema } from '../types/catalog';
import { buildCatalogImportWorkbook } from './catalog-import';

const templateId = '11111111-1111-4111-8111-111111111111';

function characteristicField(key: string, label: string, sortOrder: number): CatalogImportTemplateField {
  return {
    id: `22222222-2222-4222-8222-22222222222${sortOrder}`,
    templateId,
    key,
    label,
    type: key === 'storage' ? 'select' : 'text',
    unit: key === 'storage' ? 'GB' : '',
    options: key === 'storage' ? ['128', '256'] : [],
    required: key === 'storage',
    filterable: true,
    isModifier: key === 'storage',
    sortOrder,
    header: `Smartphone basics · ${label} [${templateId}:${key}]`
  };
}

function importSchema(fields: CatalogImportTemplateField[]): CatalogImportTemplateSchema {
  return {
    version: 1,
    source: 'xlsx_catalog',
    clearToken: '#CLEAR',
    columns: [
      { key: 'name', label: 'Назва', width: 38, example: 'iPhone 13', required: true, description: 'Назва товару.' },
      { key: 'condition', label: 'Стан', width: 16, example: 'Вживаний', required: true, description: 'Стан товару.' },
      { key: 'brandDirectory', label: 'Довідник брендів', width: 24, example: '', description: 'Довідник.' },
      { key: 'brand', label: 'Бренд', width: 20, example: '', description: 'Бренд.' },
      { key: 'template', label: 'Шаблон характеристик', width: 28, example: '', description: 'Шаблон.' },
      { key: 'groupLabel', label: 'Група модифікацій', width: 28, example: '', description: 'Група.' },
      { key: 'groupMain', label: 'Основна модифікація', width: 20, example: '', description: 'Основна модифікація.' }
    ],
    templates: [{
      id: templateId,
      label: 'Smartphone basics',
      description: 'Core specs',
      updatedAt: '2026-07-21T09:00:00.000Z',
      fields
    }],
    brands: [{
      id: '33333333-3333-4333-8333-333333333333',
      label: 'Apple',
      directoryId: '44444444-4444-4444-8444-444444444444',
      directoryLabel: 'Бренди смартфонів'
    }]
  };
}

describe('catalog XLSX import template', () => {
  it('builds a valid workbook with the current characteristic columns and hidden metadata', () => {
    const storage = characteristicField('storage', 'Storage', 0);
    const workbook = buildCatalogImportWorkbook(importSchema([storage]));
    const binary = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const reopened = XLSX.read(binary, { type: 'array' });

    expect(reopened.SheetNames).toEqual(['Імпорт', 'Приклад', 'Довідники', 'Характеристики', 'Довідка', '_meta']);
    const importRows = XLSX.utils.sheet_to_json<Array<string>>(reopened.Sheets['Імпорт'], { header: 1 });
    expect(importRows).toHaveLength(1);
    expect(importRows[0]).toContain(storage.header);
    expect(reopened.Workbook?.Sheets?.find((sheet) => sheet.name === '_meta')?.Hidden).toBe(1);
  });

  it('reflects a newly added characteristic every time the workbook is rebuilt', () => {
    const storage = characteristicField('storage', 'Storage', 0);
    const network = characteristicField('network', 'Network', 1);
    const before = buildCatalogImportWorkbook(importSchema([storage]));
    const after = buildCatalogImportWorkbook(importSchema([storage, network]));
    const beforeHeaders = XLSX.utils.sheet_to_json<Array<string>>(before.Sheets['Імпорт'], { header: 1 })[0];
    const afterHeaders = XLSX.utils.sheet_to_json<Array<string>>(after.Sheets['Імпорт'], { header: 1 })[0];

    expect(beforeHeaders).not.toContain(network.header);
    expect(afterHeaders).toContain(network.header);
  });
});
