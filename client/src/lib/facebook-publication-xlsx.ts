import * as XLSX from 'xlsx';
import type {
  FacebookPublicationGroup,
  FacebookPublicationStore,
  FacebookPublicationWorkbookRows
} from '../types/facebook-publication';

export const FACEBOOK_STORES_SHEET = 'Магазини';
export const FACEBOOK_GROUPS_SHEET = 'Facebook-групи';
export const FACEBOOK_INSTRUCTIONS_SHEET = 'Інструкція';

const storeHeaders = ['Код магазину', 'Назва', 'Місто', 'Адреса', 'Примітка', 'Активний'];
const groupHeaders = [
  'Назва групи',
  'Посилання',
  'Місто',
  'Код магазину',
  'Примітки',
  'Реклама',
  'Модерація',
  'Частота, днів',
  'Статус'
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
    ['KYIV-01', 'Mobile Trend — Центр', 'Київ', 'вул. Хрещатик, 1', 'Основний магазин', 'Так']
  ], [18, 30, 18, 42, 32, 14]);
  const groups = worksheetWithWidths([
    groupHeaders,
    ['Новини Києва', 'https://www.facebook.com/groups/example.kyiv', 'Київ', 'KYIV-01', 'Публікувати у будні', 'Дозволена', 'Так', 14, 'Активна']
  ], [32, 56, 18, 18, 34, 18, 16, 18, 22]);
  const instructions = worksheetWithWidths([
    ['Аркуш', 'Колонка', 'Обовʼязково', 'Допустимі значення / пояснення'],
    ['Магазини', 'Код магазину', 'Так', 'Унікальний стабільний код, наприклад KYIV-01.'],
    ['Магазини', 'Назва', 'Так', 'Внутрішня зрозуміла назва магазину.'],
    ['Магазини', 'Місто', 'Так', 'Назва міста українською.'],
    ['Магазини', 'Адреса', 'Так', 'Повна адреса, яка підставлятиметься в текст.'],
    ['Магазини', 'Активний', 'Ні', 'Так або Ні. За замовчуванням — Так.'],
    ['Facebook-групи', 'Посилання', 'Так', 'HTTPS-посилання виду facebook.com/groups/...'],
    ['Facebook-групи', 'Код магазину', 'Так', 'Код із аркуша «Магазини» або з уже наявного довідника.'],
    ['Facebook-групи', 'Реклама', 'Ні', 'Дозволена, Заборонена або Невідома.'],
    ['Facebook-групи', 'Модерація', 'Ні', 'Так або Ні.'],
    ['Facebook-групи', 'Частота, днів', 'Ні', 'Ціле число від 0 до 365. За замовчуванням — 14.'],
    ['Facebook-групи', 'Статус', 'Ні', 'Активна, Неактивна або Не публікувати.'],
    ['', '', '', 'Перед імпортом видаліть приклади або замініть їх власними даними. Повторний імпорт оновлює магазини за кодом, а групи — за URL.']
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
  XLSX.writeFile(createFacebookStoresExportWorkbook(stores), 'mobile-trend-stores.xlsx', {
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

export async function readFacebookPublicationWorkbook(file: File): Promise<FacebookPublicationWorkbookRows> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const storesSheet = findSheet(workbook, [FACEBOOK_STORES_SHEET, 'Stores', 'Магазини Mobile Trend']);
  const groupsSheet = findSheet(workbook, [FACEBOOK_GROUPS_SHEET, 'Facebook groups', 'Групи']);
  const rows = {
    stores: sheetRows(storesSheet),
    groups: sheetRows(groupsSheet)
  };
  if (!rows.stores.length && !rows.groups.length) {
    throw new Error('У файлі немає заповнених аркушів «Магазини» або «Facebook-групи».');
  }
  return rows;
}
