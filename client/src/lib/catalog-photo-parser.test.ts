import { describe, expect, it } from 'vitest';
import { catalogPhotoGoogleSearchUrl, catalogPhotoParserStatusLabels } from './catalog-photo-parser';

describe('catalog photo parser helpers', () => {
  it('builds a Google Images query from the product name', () => {
    const url = new URL(catalogPhotoGoogleSearchUrl('  Apple   iPhone 15 Pro  '));
    expect(url.origin).toBe('https://www.google.com');
    expect(url.searchParams.get('tbm')).toBe('isch');
    expect(url.searchParams.get('q')).toBe('Apple iPhone 15 Pro фото');
  });

  it('has a user-facing label for every parser status', () => {
    expect(Object.keys(catalogPhotoParserStatusLabels).sort()).toEqual([
      'failed',
      'partial',
      'queued',
      'running',
      'success'
    ]);
  });
});
