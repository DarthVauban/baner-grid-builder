import { describe, expect, it } from 'vitest';
import { initialDraft, readDraft } from './model';
import { changeText, sampleProduct, textValue } from './text-elements';

describe('popup prototype draft compatibility', () => {
  it('restores a previous draft without discarding edited content or device settings', () => {
    const legacy = JSON.parse(JSON.stringify(initialDraft('product')));
    legacy.title = 'Мій збережений банер';
    legacy.desktop.width = 730;
    delete legacy.desktop.textStyles;
    delete legacy.mobile.textStyles;
    delete legacy.extraText;
    delete legacy.product.overrides;
    delete legacy.product.image;
    localStorage.setItem('legacy-popup', JSON.stringify({ version: 1, draft: legacy }));
    const restored = readDraft('legacy-popup', 'product');
    expect(restored.title).toBe('Мій збережений банер');
    expect(restored.desktop.width).toBe(730);
    expect(restored.desktop.textStyles).toEqual({});
    expect(restored.product.image.fit).toBe('contain');
    localStorage.removeItem('legacy-popup');
  });

  it('keeps product content local to its card and restores styles separately for each device', () => {
    let draft = changeText(initialDraft('product'), 'productTitle', 'Моя назва', 'titanium');
    draft = changeText(draft, 'price', '0', 'titanium');
    draft.desktop.textStyles.productTitle = { fontSize: 35, color: '#ff0000' };
    draft.mobile.textStyles.productTitle = { fontSize: 19 };
    // A partially typed URL must not discard the entire layout on reload.
    draft.product.overrides.titanium.imageUrl = 'https:';
    localStorage.setItem('current-popup', JSON.stringify({ version: 1, draft }));
    const restored = readDraft('current-popup', 'product');
    expect(sampleProduct(restored, 'titanium').title).toBe('Моя назва');
    expect(sampleProduct(restored, 'titanium').price).toBe(0);
    expect(sampleProduct(restored, 'blue').title).toBe('iPhone 15');
    expect(restored.desktop.textStyles.productTitle.fontSize).toBe(35);
    expect(restored.mobile.textStyles.productTitle).toEqual({ fontSize: 19 });
    localStorage.removeItem('current-popup');
  });

  it('edits individual success and cover texts without changing the form title or coupon', () => {
    let draft = initialDraft('lead-form');
    draft = changeText(draft, 'successTitle', 'Дякуємо!', 'titanium');
    draft = changeText(draft, 'coverBody', 'Твій новий бонус', 'titanium');
    expect(draft.form.successTitle).toBe('Дякуємо!');
    expect(textValue(draft, 'coverBody', 'titanium')).toBe('Твій новий бонус');
    expect(draft.title).toBe(initialDraft('lead-form').title);
    expect(draft.form.code).toBe('HELLO10');
  });
});
