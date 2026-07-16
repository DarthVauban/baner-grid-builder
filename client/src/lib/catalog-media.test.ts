import { describe, expect, it } from 'vitest';
import { convertCatalogImageToWebp, maxCatalogImageBytes, validateCatalogImageFile } from './catalog-media';

function imageFile(size: number, type = 'image/jpeg', name = 'phone.jpg') {
  return new File([new Uint8Array(size)], name, { type });
}

describe('catalog image preparation', () => {
  it('accepts product photos up to 5 MB and rejects larger files', () => {
    expect(() => validateCatalogImageFile(imageFile(maxCatalogImageBytes))).not.toThrow();
    expect(() => validateCatalogImageFile(imageFile(maxCatalogImageBytes + 1))).toThrow('до 5 МБ');
  });

  it('keeps an already optimized WebP file in WebP format', async () => {
    const webp = imageFile(1024, 'image/webp', 'phone.webp');
    const result = await convertCatalogImageToWebp(webp);
    expect(result).toBe(webp);
    expect(result.type).toBe('image/webp');
  });
});
