import * as XLSX from 'xlsx';
import type { StoreMapPoint } from '../types/store-map';

export const STORE_MAP_EXPORT_SHEET = 'Магазини';

const publicationStatusLabels: Record<StoreMapPoint['publicationStatus'], string> = {
  ACTIVE: 'Активний',
  HIDDEN: 'Прихований'
};

const operatingStatusLabels: Record<StoreMapPoint['openStatusOverride'], string> = {
  AUTO: 'За розкладом',
  TEMPORARILY_CLOSED: 'Тимчасово зачинено',
  CLOSED: 'Зачинено'
};

const headers = [
  'ID',
  'Назва магазину',
  'Місто',
  'Адреса',
  'Час роботи',
  'Координати',
  'Широта',
  'Довгота',
  'Статус',
  'Статус роботи'
];

const columnWidths = [16, 38, 22, 48, 20, 28, 16, 16, 18, 24];

export function buildStoreMapExportWorkbook(points: StoreMapPoint[], generatedAt = new Date()) {
  const rows = points.map((point) => [
    point.externalId,
    point.name,
    point.city,
    point.address,
    point.hoursText,
    `${point.latitude},${point.longitude}`,
    point.latitude,
    point.longitude,
    publicationStatusLabels[point.publicationStatus],
    operatingStatusLabels[point.openStatusOverride]
  ]);
  const workbook = XLSX.utils.book_new();
  const storesSheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  storesSheet['!cols'] = columnWidths.map((wch) => ({ wch }));
  storesSheet['!rows'] = [{ hpt: 24 }];
  storesSheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(0, rows.length), c: headers.length - 1 }
    })
  };
  XLSX.utils.book_append_sheet(workbook, storesSheet, STORE_MAP_EXPORT_SHEET);

  const metaSheet = XLSX.utils.aoa_to_sheet([
    ['Кількість магазинів', points.length],
    ['Сформовано', generatedAt]
  ], { cellDates: true });
  metaSheet['!cols'] = [{ wch: 24 }, { wch: 24 }];
  const generatedAtCell = metaSheet.B2;
  if (generatedAtCell) generatedAtCell.z = 'yyyy-mm-dd hh:mm';
  XLSX.utils.book_append_sheet(workbook, metaSheet, '_meta');
  workbook.Workbook = {
    ...workbook.Workbook,
    Sheets: workbook.SheetNames.map((name) => ({ name, Hidden: name === '_meta' ? 1 : 0 }))
  };
  workbook.Props = {
    Title: 'Експорт мапи магазинів',
    Subject: 'Усі торгові точки з координатами',
    Author: 'MT Workspace',
    CreatedDate: generatedAt
  };
  return workbook;
}

export function storeMapExportFileName(date = new Date()) {
  return `store-map-${date.toISOString().slice(0, 10)}.xlsx`;
}

export function downloadStoreMapExport(points: StoreMapPoint[], generatedAt = new Date()) {
  XLSX.writeFile(
    buildStoreMapExportWorkbook(points, generatedAt),
    storeMapExportFileName(generatedAt),
    { compression: true }
  );
}
