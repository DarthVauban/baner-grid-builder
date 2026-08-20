import { describe, expect, it } from 'vitest';

const componentSources = import.meta.glob<string>([
  '../**/*.tsx',
  '!../**/*.test.tsx'
], { query: '?raw', import: 'default', eager: true });

describe('StyledSelect adoption', () => {
  it('does not allow native select menus in React production code', () => {
    const offenders = Object.entries(componentSources)
      .filter(([, source]) => /<select\b/u.test(source))
      .map(([path]) => path)
      .sort();

    expect(offenders).toEqual([]);
  });
});
