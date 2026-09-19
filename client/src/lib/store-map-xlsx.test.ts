import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { StoreMapPoint } from '../types/store-map';
import {
  buildStoreMapExportWorkbook,
  STORE_MAP_EXPORT_SHEET,
  storeMapExportFileName
} from './store-map-xlsx';

const points: StoreMapPoint[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    externalId: 'TT-001',
    name: 'Магазин Київ',
    city: 'Київ',
    address: 'вул. Хрещатик, 1',
    hoursText: '09:00 - 20:00',
    schedule: {},
    publicationStatus: 'ACTIVE',
    openStatusOverride: 'AUTO',
    latitude: 50.4501,
    longitude: 30.5234,
    createdAt: '2026-09-19T08:00:00.000Z',
    updatedAt: '2026-09-19T09:00:00.000Z'
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    externalId: 'TT-002',
    name: 'Магазин Львів',
    city: 'Львів',
    address: 'просп. Свободи, 1',
    hoursText: '10:00 - 19:00',
    schedule: {},
    publicationStatus: 'HIDDEN',
    openStatusOverride: 'TEMPORARILY_CLOSED',
    latitude: 49.8397,
    longitude: 24.0297,
    createdAt: '2026-09-19T08:00:00.000Z',
    updatedAt: '2026-09-19T09:00:00.000Z'
  }
];

describe('store map XLSX export', () => {
  it('creates an import-compatible workbook with every point and explicit coordinates', () => {
    const generatedAt = new Date('2026-09-19T12:00:00.000Z');
    const binary = XLSX.write(buildStoreMapExportWorkbook(points, generatedAt), {
      type: 'array',
      bookType: 'xlsx',
      compression: true
    });
    const reopened = XLSX.read(binary, { type: 'array', cellDates: true });
    const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(reopened.Sheets[STORE_MAP_EXPORT_SHEET]);

    expect(reopened.SheetNames).toEqual([STORE_MAP_EXPORT_SHEET, '_meta']);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      ID: 'TT-001',
      'Назва магазину': 'Магазин Київ',
      'Місто': 'Київ',
      'Адреса': 'вул. Хрещатик, 1',
      'Час роботи': '09:00 - 20:00',
      'Координати': '50.4501,30.5234',
      'Широта': 50.4501,
      'Довгота': 30.5234,
      'Статус': 'Активний',
      'Статус роботи': 'За розкладом'
    });
    expect(rows[1]).toMatchObject({
      ID: 'TT-002',
      'Координати': '49.8397,24.0297',
      'Статус': 'Прихований',
      'Статус роботи': 'Тимчасово зачинено'
    });
    expect(storeMapExportFileName(generatedAt)).toBe('store-map-2026-09-19.xlsx');
  });
});
