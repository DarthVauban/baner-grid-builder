import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import {
  createFacebookPublicationTemplateWorkbook,
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
