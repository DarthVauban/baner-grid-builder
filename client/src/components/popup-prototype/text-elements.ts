import { demoProducts, type Device, type PrototypeDraft, type TextElement, type TextStyle } from './model';

const extraDefaults = {
  coverEyebrow: 'MEMBER\nBENEFITS', coverOffer: '10%', coverBody: 'Маленький крок.\nПриємний бонус.',
  coverBrand: 'MOBILE TREND', footnote: 'Тестові дані залишаються в цьому прев’ю', couponNote: 'Демонстраційний код'
};
const productKeys = { productBadge: 'badge', productTitle: 'title', productVariant: 'variant', price: 'price', oldPrice: 'oldPrice' } as const;
const formKeys = { successTitle: 'successTitle', successBody: 'successBody', discount: 'discount', code: 'code', copyLabel: 'copyLabel' } as const;

export function sampleProduct(draft: PrototypeDraft, id: string) {
  const base = demoProducts.find((product) => product.id === id) || demoProducts[0];
  return { ...base, imageUrl: '', ...draft.product.overrides[base.id] };
}

export function textValue(draft: PrototypeDraft, id: TextElement, productId: string) {
  if (id === 'eyebrow' || id === 'title' || id === 'body') return draft[id];
  if (id in productKeys) return String(sampleProduct(draft, productId)[productKeys[id as keyof typeof productKeys]]);
  if (id in formKeys) return draft.form[formKeys[id as keyof typeof formKeys]];
  return draft.extraText[id] ?? extraDefaults[id as keyof typeof extraDefaults];
}

export function changeText(draft: PrototypeDraft, id: TextElement, value: string, productId: string): PrototypeDraft {
  if (id === 'eyebrow' || id === 'title' || id === 'body') return { ...draft, [id]: value };
  if (id in productKeys) {
    const key = productKeys[id as keyof typeof productKeys];
    return { ...draft, product: { ...draft.product, overrides: { ...draft.product.overrides, [productId]: { ...draft.product.overrides[productId], [key]: key === 'price' || key === 'oldPrice' ? Number(value) : value } } } };
  }
  if (id in formKeys) return { ...draft, form: { ...draft.form, [formKeys[id as keyof typeof formKeys]]: value } };
  return { ...draft, extraText: { ...draft.extraText, [id]: value } };
}

export function elementTextStyle(draft: PrototypeDraft, device: Device, id: string): TextStyle {
  return draft[device].textStyles[id] || {};
}

export function defaultTextSize(draft: PrototypeDraft, device: Device, id: string) {
  if (id === 'title' || id === 'successTitle') return draft[device].titleSize;
  if (id === 'productTitle') return device === 'mobile' ? 17 : 20;
  if (id === 'price') return device === 'mobile' ? 21 : 24;
  return ({ eyebrow: 9, body: 12, productBadge: 8, productVariant: 10, oldPrice: 11, successBody: 12, code: 28, discount: 10, copyLabel: 11, cta: 11, coverEyebrow: 9, coverOffer: 60, coverBody: 11, coverBrand: 8, footnote: 8, couponNote: 8 } as Record<string, number>)[id] || 10;
}

// Match the sample's CSS defaults until this element receives a device override.
export function textStyleDefaults(draft: PrototypeDraft, device: Device, id: string): Required<TextStyle> {
  const titles = ['title', 'successTitle'];
  const button = id === 'cta' || id === 'copyLabel';
  const muted = id.startsWith('field:') ? 0.25 : ({ body: 0.45, successBody: 0.45, productVariant: 0.45, oldPrice: 0.65, footnote: 0.58, couponNote: 0.55 } as Record<string, number>)[id] || 0;
  const blend = (foreground: string, background: string, amount: number) => '#' + [1, 3, 5].map((offset) => Math.round(parseInt(foreground.slice(offset, offset + 2), 16) * (1 - amount) + parseInt(background.slice(offset, offset + 2), 16) * amount).toString(16).padStart(2, '0')).join('');
  return {
    fontSize: defaultTextSize(draft, device, id),
    fontWeight: button ? 550 : ['eyebrow', 'title', 'successTitle', 'productTitle', 'price'].includes(id) ? 650 : id === 'code' ? 700 : id === 'coverOffer' ? 500 : 400,
    lineHeight: titles.includes(id) ? 1.12 : id === 'productTitle' ? 1.2 : button ? 1.45 : ['body', 'successBody', 'productVariant'].includes(id) ? 1.65 : ['coverEyebrow', 'coverBody'].includes(id) ? 1.7 : 1.5,
    letterSpacing: ({ eyebrow: 1.6, title: -1, successTitle: -1, productTitle: -0.5, price: -0.7, code: 3, coverEyebrow: 2, coverBrand: 1.7, coverOffer: -5 } as Record<string, number>)[id] || 0,
    color: button ? '#ffffff' : ['eyebrow', 'productBadge', 'discount', 'code'].includes(id) || id.startsWith('cover') ? draft.accent : blend(draft.text, draft.background, muted),
    textAlign: button || ['code', 'discount', 'couponNote', 'footnote'].includes(id) ? 'center' : 'left',
    fontStyle: 'normal'
  };
}
