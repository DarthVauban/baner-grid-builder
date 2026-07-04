import { describe, expect, it } from 'vitest';
import { getPinnedColumnLeft, normalizeSheet } from './ProductTablesPage';

describe('spreadsheet normalization', () => {
  it('uses the first row as headers and removes empty product rows', () => {
    const sheet = normalizeSheet('Товари', [
      ['Назва', 'Колір'],
      ['Телефон', 'Чорний'],
      ['', ''],
      ['Навушники', 'Білі']
    ]);
    expect(sheet.headers).toEqual(['Назва', 'Колір']);
    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[1].values[0]).toBe('Навушники');
    expect(sheet.showCompletedStatus).toBe(false);
  });

  it('places the product column after every enabled status column', () => {
    expect(getPinnedColumnLeft(0)).toBe('0px');
    expect(getPinnedColumnLeft(1)).toBe('88px');
    expect(getPinnedColumnLeft(2)).toBe('176px');
  });
});
