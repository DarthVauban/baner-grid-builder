import * as XLSX from 'xlsx';
import type { CatalogImportTemplateField, CatalogImportTemplateSchema } from '../types/catalog';

function fieldExample(field: CatalogImportTemplateField) {
  if (field.type === 'boolean') return 'Так';
  if (field.type === 'number') return field.unit === '%' ? 91 : 1;
  if (field.type === 'multiselect') return field.options.slice(0, 2).join('; ');
  if (field.type === 'color') return 'Midnight | #1f2937';
  return field.options[0] || '';
}

function fieldTypeLabel(field: CatalogImportTemplateField) {
  const labels: Record<CatalogImportTemplateField['type'], string> = {
    text: 'Текст',
    number: 'Число',
    select: 'Один варіант',
    multiselect: 'Декілька варіантів через ;',
    boolean: 'Так/Ні',
    color: 'Назва | #RRGGBB'
  };
  return labels[field.type];
}

export function buildCatalogImportWorkbook(schema: CatalogImportTemplateSchema) {
  const workbook = XLSX.utils.book_new();
  const characteristicFields = schema.templates.flatMap((template) => template.fields);
  const templateColumnIndex = schema.columns.findIndex((column) => column.key === 'template');
  const leadingColumns = templateColumnIndex >= 0 ? schema.columns.slice(0, templateColumnIndex + 1) : schema.columns;
  const trailingColumns = templateColumnIndex >= 0 ? schema.columns.slice(templateColumnIndex + 1) : [];
  const headers = [
    ...leadingColumns.map((column) => column.label),
    ...characteristicFields.map((field) => field.header),
    ...trailingColumns.map((column) => column.label)
  ];
  const importSheet = XLSX.utils.aoa_to_sheet([headers]);
  importSheet['!cols'] = [
    ...leadingColumns.map((column) => ({ wch: Math.min(42, Math.max(12, column.width || column.label.length + 4)) })),
    ...characteristicFields.map((field) => ({ wch: Math.min(42, Math.max(20, field.label.length + 14)) })),
    ...trailingColumns.map((column) => ({ wch: Math.min(42, Math.max(12, column.width || column.label.length + 4)) }))
  ];
  importSheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, headers.length - 1) } }) };
  XLSX.utils.book_append_sheet(workbook, importSheet, 'Імпорт');

  const exampleTemplate = schema.templates[0] || null;
  const columnExample = (column: CatalogImportTemplateSchema['columns'][number]) => {
    if (column.key === 'template') return exampleTemplate?.label || '';
    if (column.key === 'brandDirectory') return schema.brands[0]?.directoryLabel || column.example;
    if (column.key === 'brand') return schema.brands[0]?.label || column.example;
    return column.example;
  };
  const exampleCharacteristics = characteristicFields.map((field) => (
    field.templateId === exampleTemplate?.id ? fieldExample(field) : ''
  ));
  const exampleSheet = XLSX.utils.aoa_to_sheet([
    headers,
    [
      ...leadingColumns.map(columnExample),
      ...exampleCharacteristics,
      ...trailingColumns.map(columnExample)
    ]
  ]);
  exampleSheet['!cols'] = importSheet['!cols'];
  XLSX.utils.book_append_sheet(workbook, exampleSheet, 'Приклад');

  const dictionaryRows: Array<Array<string | number>> = [
    ['Тип', 'Довідник', 'Значення', 'Коментар'],
    ['Стан', '', 'Вживаний', 'Також можна USED'],
    ['Стан', '', 'Відновлений', 'Також можна REFURBISHED'],
    ...schema.brands.map((brand) => ['Бренд', brand.directoryLabel, brand.label, 'Використовуйте точне значення']),
    ...schema.templates.map((template) => ['Шаблон', '', template.label, template.description || 'Активний шаблон характеристик'])
  ];
  const dictionariesSheet = XLSX.utils.aoa_to_sheet(dictionaryRows);
  dictionariesSheet['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 30 }, { wch: 56 }];
  dictionariesSheet['!autofilter'] = { ref: `A1:D${dictionaryRows.length}` };
  XLSX.utils.book_append_sheet(workbook, dictionariesSheet, 'Довідники');

  const characteristicRows: Array<Array<string | number>> = [
    ['Шаблон', 'Характеристика', 'Ключ', 'Тип', 'Одиниця', 'Обовʼязкова', 'Допустимі значення', 'Заголовок XLSX'],
    ...schema.templates.flatMap((template) => template.fields.map((field) => [
      template.label,
      field.label,
      field.key,
      fieldTypeLabel(field),
      field.unit,
      field.required ? 'Так' : 'Ні',
      field.options.join('; '),
      field.header
    ]))
  ];
  const characteristicsSheet = XLSX.utils.aoa_to_sheet(characteristicRows);
  characteristicsSheet['!cols'] = [{ wch: 28 }, { wch: 28 }, { wch: 22 }, { wch: 24 }, { wch: 12 }, { wch: 16 }, { wch: 42 }, { wch: 72 }];
  characteristicsSheet['!autofilter'] = { ref: `A1:H${characteristicRows.length}` };
  XLSX.utils.book_append_sheet(workbook, characteristicsSheet, 'Характеристики');

  const helpRows: Array<Array<string>> = [
    ['Колонка', 'Правило'],
    ...schema.columns.map((column) => [column.label, column.description]),
    ['Характеристики', 'Виберіть шаблон у колонці «Шаблон характеристик» і заповнюйте лише його колонки. Порожні клітинки під час оновлення не стирають наявні значення.'],
    ['Очищення', `Щоб явно очистити необовʼязкове поле або характеристику, введіть ${schema.clearToken}.`],
    ['Фото', 'Фото та галерея не імпортуються і не змінюються. Їх потрібно додати вручну в картці товару.'],
    ['Оновлення шаблону', 'Завантажуйте новий XLSX із каталогу після зміни шаблонів характеристик. Файл завжди генерується з актуальної конфігурації.'],
    ['Модифікації', 'Групи та основні модифікації не імпортуються. Звʼязуйте товари вручну після імпорту.']
  ];
  const helpSheet = XLSX.utils.aoa_to_sheet(helpRows);
  helpSheet['!cols'] = [{ wch: 28 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(workbook, helpSheet, 'Довідка');

  const metaSheet = XLSX.utils.aoa_to_sheet([
    ['schemaVersion', schema.version],
    ['source', schema.source],
    ['generatedAt', new Date().toISOString()],
    ['templateVersions', JSON.stringify(schema.templates.map((template) => ({ id: template.id, updatedAt: template.updatedAt })))]
  ]);
  XLSX.utils.book_append_sheet(workbook, metaSheet, '_meta');
  workbook.Workbook = {
    ...workbook.Workbook,
    Sheets: workbook.SheetNames.map((name) => ({ name, Hidden: name === '_meta' ? 1 : 0 }))
  };
  workbook.Props = {
    Title: 'Актуальний шаблон імпорту каталогу смартфонів',
    Subject: 'Імпорт товарів і характеристик',
    Author: 'MT Workspace'
  };
  return workbook;
}
