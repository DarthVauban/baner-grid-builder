import * as XLSX from 'xlsx';
import type {
  FacebookPublicationGroup,
  FacebookPublicationStore,
  FacebookPublicationWorkbookRows
} from '../types/facebook-publication';

export const FACEBOOK_STORES_SHEET = 'Міста';
export const FACEBOOK_GROUPS_SHEET = 'Facebook-групи';
export const FACEBOOK_INSTRUCTIONS_SHEET = 'Інструкція';
export type FacebookPublicationImportType = 'stores' | 'groups';

const storeHeaders = ['Місто', 'Адреса'];
const groupHeaders = [
  'Назва групи',
  'Посилання',
  'Реклама дозволена',
  'Реклама заборонена',
  'Модерація',
  'Неактивна',
  'Не публікувати'
];

function worksheetWithWidths(rows: unknown[][], widths: number[]) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = widths.map((wch) => ({ wch }));
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, rows.length - 1), c: widths.length - 1 } }) };
  return sheet;
}

export function createFacebookPublicationTemplateWorkbook() {
  const workbook = XLSX.utils.book_new();
  const stores = worksheetWithWidths([
    storeHeaders,
    ['Київ', 'вул. Хрещатик, 1']
  ], [24, 64]);
  const groups = worksheetWithWidths([
    groupHeaders,
    ['Новини Києва', 'https://www.facebook.com/groups/example.kyiv', 'Так', '', 'Так', '', '']
  ], [32, 56, 22, 24, 16, 16, 22]);
  const instructions = worksheetWithWidths([
    ['Аркуш', 'Колонка', 'Обовʼязково', 'Допустимі значення / пояснення'],
    ['Міста', 'Місто', 'Так', 'Назва міста українською. Повторний імпорт оновлює адресу за містом.'],
    ['Міста', 'Адреса', 'Так', 'Повна адреса, яка підставлятиметься в текст.'],
    ['Facebook-групи', 'Назва групи', 'Так', 'Назва Facebook-групи.'],
    ['Facebook-групи', 'Посилання', 'Так', 'HTTPS-посилання виду facebook.com/groups/...'],
    ['Facebook-групи', 'Реклама дозволена', 'Ні', 'Так або порожньо. Не поєднуйте з «Реклама заборонена».'],
    ['Facebook-групи', 'Реклама заборонена', 'Ні', 'Так або порожньо. Не поєднуйте з «Реклама дозволена».'],
    ['Facebook-групи', 'Модерація', 'Ні', 'Так або Ні.'],
    ['Facebook-групи', 'Неактивна', 'Ні', 'Так або порожньо.'],
    ['Facebook-групи', 'Не публікувати', 'Ні', 'Так або порожньо.'],
    ['', '', '', 'Групи та міста імпортуються незалежно. Перед імпортом видаліть приклади або замініть їх власними даними.']
  ], [22, 24, 16, 90]);
  XLSX.utils.book_append_sheet(workbook, stores, FACEBOOK_STORES_SHEET);
  XLSX.utils.book_append_sheet(workbook, groups, FACEBOOK_GROUPS_SHEET);
  XLSX.utils.book_append_sheet(workbook, instructions, FACEBOOK_INSTRUCTIONS_SHEET);
  return workbook;
}

export function downloadFacebookPublicationTemplate() {
  XLSX.writeFile(createFacebookPublicationTemplateWorkbook(), 'facebook-groups-import-template.xlsx', {
    compression: true
  });
}

export function createFacebookStoresImportTemplateWorkbook() {
  const workbook = XLSX.utils.book_new();
  const stores = worksheetWithWidths([
    storeHeaders,
    ['Київ', 'вул. Хрещатик, 1']
  ], [24, 64]);
  const instructions = worksheetWithWidths([
    ['Колонка', 'Обовʼязково', 'Допустимі значення / пояснення'],
    ['Місто', 'Так', 'Назва міста українською. Повторний імпорт оновлює адресу за містом.'],
    ['Адреса', 'Так', 'Повна адреса, яка підставлятиметься в текст.'],
    ['', '', 'Перед імпортом видаліть приклад або замініть його власними даними.']
  ], [24, 16, 90]);
  XLSX.utils.book_append_sheet(workbook, stores, FACEBOOK_STORES_SHEET);
  XLSX.utils.book_append_sheet(workbook, instructions, FACEBOOK_INSTRUCTIONS_SHEET);
  return workbook;
}

export function downloadFacebookStoresImportTemplate() {
  XLSX.writeFile(createFacebookStoresImportTemplateWorkbook(), 'facebook-cities-import-template.xlsx', {
    compression: true
  });
}

export function createFacebookGroupsImportTemplateWorkbook() {
  const workbook = XLSX.utils.book_new();
  const groups = worksheetWithWidths([
    groupHeaders,
    ['Новини Києва', 'https://www.facebook.com/groups/example.kyiv', 'Так', '', 'Так', '', '']
  ], [32, 56, 22, 24, 16, 16, 22]);
  const instructions = worksheetWithWidths([
    ['Колонка', 'Обовʼязково', 'Допустимі значення / пояснення'],
    ['Назва групи', 'Так', 'Назва Facebook-групи.'],
    ['Посилання', 'Так', 'HTTPS-посилання виду facebook.com/groups/... Повторний імпорт оновлює групу за посиланням.'],
    ['Реклама дозволена', 'Ні', 'Так або порожньо. Не поєднуйте з «Реклама заборонена».'],
    ['Реклама заборонена', 'Ні', 'Так або порожньо. Не поєднуйте з «Реклама дозволена».'],
    ['Модерація', 'Ні', 'Так або Ні.'],
    ['Неактивна', 'Ні', 'Так або порожньо.'],
    ['Не публікувати', 'Ні', 'Так або порожньо.'],
    ['', '', 'Перед імпортом видаліть приклад або замініть його власними даними.']
  ], [24, 16, 90]);
  XLSX.utils.book_append_sheet(workbook, groups, FACEBOOK_GROUPS_SHEET);
  XLSX.utils.book_append_sheet(workbook, instructions, FACEBOOK_INSTRUCTIONS_SHEET);
  return workbook;
}

export function downloadFacebookGroupsImportTemplate() {
  XLSX.writeFile(createFacebookGroupsImportTemplateWorkbook(), 'facebook-groups-import-template.xlsx', {
    compression: true
  });
}

export function createFacebookGroupsExportWorkbook(
  groups: Array<Pick<FacebookPublicationGroup, 'name' | 'url'>>
) {
  const workbook = XLSX.utils.book_new();
  const sheet = worksheetWithWidths([
    ['Назва групи', 'Посилання'],
    ...groups.map((group) => [group.name, group.url])
  ], [42, 72]);
  XLSX.utils.book_append_sheet(workbook, sheet, FACEBOOK_GROUPS_SHEET);
  return workbook;
}

export function downloadFacebookGroupsExport(groups: FacebookPublicationGroup[]) {
  XLSX.writeFile(createFacebookGroupsExportWorkbook(groups), 'facebook-groups.xlsx', {
    compression: true
  });
}

export function createFacebookStoresExportWorkbook(
  stores: Array<Pick<FacebookPublicationStore, 'city' | 'address'>>
) {
  const workbook = XLSX.utils.book_new();
  const sheet = worksheetWithWidths([
    ['Місто', 'Адреса'],
    ...stores.map((store) => [store.city, store.address])
  ], [24, 64]);
  XLSX.utils.book_append_sheet(workbook, sheet, FACEBOOK_STORES_SHEET);
  return workbook;
}

export function downloadFacebookStoresExport(stores: FacebookPublicationStore[]) {
  XLSX.writeFile(createFacebookStoresExportWorkbook(stores), 'mobile-trend-cities.xlsx', {
    compression: true
  });
}

function normalizedSheetName(value: string) {
  return value.toLocaleLowerCase('uk-UA').replace(/[\s_-]+/g, ' ').trim();
}

function findSheet(workbook: XLSX.WorkBook, aliases: string[]) {
  const wanted = new Set(aliases.map(normalizedSheetName));
  const name = workbook.SheetNames.find((item) => wanted.has(normalizedSheetName(item)));
  return name ? workbook.Sheets[name] : undefined;
}

function sheetRows(sheet?: XLSX.WorkSheet): Array<Record<string, unknown>> {
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
}

export async function readFacebookPublicationWorkbook(
  file: File,
  importType?: FacebookPublicationImportType
): Promise<FacebookPublicationWorkbookRows> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const firstSheet = workbook.SheetNames[0] ? workbook.Sheets[workbook.SheetNames[0]] : undefined;
  const storesSheet = findSheet(workbook, [FACEBOOK_STORES_SHEET, 'Магазини', 'Stores', 'Магазини Mobile Trend'])
    || (importType === 'stores' ? firstSheet : undefined);
  const groupsSheet = findSheet(workbook, [FACEBOOK_GROUPS_SHEET, 'Facebook groups', 'Групи'])
    || (importType === 'groups' ? firstSheet : undefined);
  const rows = {
    stores: importType === 'groups' ? [] : sheetRows(storesSheet),
    groups: importType === 'stores' ? [] : sheetRows(groupsSheet)
  };
  if (!rows.stores.length && !rows.groups.length) {
    throw new Error(importType === 'stores'
      ? 'У файлі немає заповненого списку міст і адрес.'
      : importType === 'groups'
        ? 'У файлі немає заповненого списку Facebook-груп.'
        : 'У файлі немає заповнених аркушів «Міста» або «Facebook-групи».');
  }
  return rows;
}
