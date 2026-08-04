import { describe, expect, it } from 'vitest';
import mediaLibraryStyles from '../styles/media-library.css?raw';

describe('media library selection styles', () => {
  it('uses project theme tokens for a visible selected card and checkbox', () => {
    expect(mediaLibraryStyles).not.toMatch(/var\(--(?:accent|shadow-sm)\)/);
    expect(mediaLibraryStyles).toMatch(/\.media-asset-card--selected\s*\{[^}]*border-color:\s*var\(--brand\);[^}]*background:\s*color-mix\([^;]*var\(--brand\)[^;]*var\(--surface\)[^;]*\);[^}]*box-shadow:/);
    expect(mediaLibraryStyles).toMatch(/\.media-asset-card__select input:checked \+ span\s*\{[^}]*background:\s*var\(--brand\);[^}]*box-shadow:/);
    expect(mediaLibraryStyles).toMatch(/\.media-asset-card__select input:checked \+ span \.icon\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*scale\(1\)/);
    expect(mediaLibraryStyles).toMatch(/\.media-asset-card__selected-label\s*\{[^}]*position:\s*absolute;[^}]*background:/);
  });
});
