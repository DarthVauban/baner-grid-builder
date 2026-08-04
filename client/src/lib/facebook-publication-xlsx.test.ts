import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import {
  createFacebookGroupsExportWorkbook,
  createFacebookPublicationTemplateWorkbook,
  createFacebookStoresExportWorkbook,
  FACEBOOK_GROUPS_SHEET,
  FACEBOOK_INSTRUCTIONS_SHEET,
  FACEBOOK_STORES_SHEET,
  readFacebookPublicationWorkbook
} from './facebook-publication-xlsx';

describe('facebook publication XLSX template', () => {
  it('contains stores, groups and instructions sheets', () => {
    const workbook = createFacebookPublicationTemplateWorkbook();
    expect(workbook.SheetNames).toEqual([
      FACEBOOK_STORES_SHEET,
      FACEBOOK_GROUPS_SHEET,
      FACEBOOK_INSTRUCTIONS_SHEET
    ]);
    const groupRows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[FACEBOOK_GROUPS_SHEET]);
    expect(groupRows[0]['Код магазину']).toBe('KYIV-01');
    expect(groupRows[0].Посилання).toContain('facebook.com/groups/');
  });

  it('reads the two data sheets back into import rows', async () => {
    const data = XLSX.write(createFacebookPublicationTemplateWorkbook(), { type: 'array', bookType: 'xlsx' });
    const file = new File([data], 'template.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const rows = await readFacebookPublicationWorkbook(file);
    expect(rows.stores).toHaveLength(1);
    expect(rows.groups).toHaveLength(1);
  });
});

describe('facebook publication XLSX exports', () => {
  it('exports groups with only the group name and link columns', () => {
    const workbook = createFacebookGroupsExportWorkbook([
      { name: 'Новини Києва', url: 'https://www.facebook.com/groups/kyiv.news' }
    ]);
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[FACEBOOK_GROUPS_SHEET]);

    expect(workbook.SheetNames).toEqual([FACEBOOK_GROUPS_SHEET]);
    expect(Object.keys(rows[0])).toEqual(['Назва групи', 'Посилання']);
    expect(rows[0]).toEqual({
      'Назва групи': 'Новини Києва',
      'Посилання': 'https://www.facebook.com/groups/kyiv.news'
    });
  });

  it('exports stores with only the city and address columns', () => {
    const workbook = createFacebookStoresExportWorkbook([
      { city: 'Київ', address: 'вул. Хрещатик, 1' }
    ]);
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[FACEBOOK_STORES_SHEET]);

    expect(workbook.SheetNames).toEqual([FACEBOOK_STORES_SHEET]);
    expect(Object.keys(rows[0])).toEqual(['Місто', 'Адреса']);
    expect(rows[0]).toEqual({
      'Місто': 'Київ',
      'Адреса': 'вул. Хрещатик, 1'
    });
  });
});
