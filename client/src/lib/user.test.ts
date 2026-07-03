import { describe, expect, it } from 'vitest';
import { getInitials, roleLabels } from './user';

describe('user presentation helpers', () => {
  it('creates readable initials from a full name', () => {
    expect(getInitials('  Ірина Коваль  ')).toBe('ІК');
    expect(getInitials('Dante')).toBe('D');
  });

  it('provides a Ukrainian label for every supported role', () => {
    expect(roleLabels.admin).toBe('Адміністратор');
    expect(roleLabels.content_manager).toBe('Контент-менеджер');
  });
});
