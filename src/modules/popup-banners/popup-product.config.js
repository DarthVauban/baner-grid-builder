import { z } from 'zod';

export const productPopupElementDefaults = {
  eyebrow: { fontSizeMobile: 12, color: '#6d5dfc', fontSize: 14, fontWeight: 700 },
  heading: { fontSizeMobile: 28, color: '#172033', fontSize: 36, fontWeight: 800 },
  productTitle: { fontSizeMobile: 18, color: '#172033', fontSize: 22, fontWeight: 700 },
  price: { fontSizeMobile: 32, color: '#172033', fontSize: 42, fontWeight: 800 },
  oldPrice: { fontSizeMobile: 14, color: '#667085', fontSize: 18, fontWeight: 500 },
  savings: { fontSizeMobile: 12, color: '#6d5dfc', backgroundColor: '#ede9fe', backgroundOpacity: 100, fontSize: 14, fontWeight: 700, paddingX: 12, paddingY: 7, borderRadius: 24 },
  buyButton: { fontSizeMobile: 14, color: '#172033', backgroundColor: '#ffe101', backgroundOpacity: 100, fontSize: 16, fontWeight: 700, paddingX: 20, paddingY: 15, borderRadius: 12, textAlign: 'center' },
  detailsButton: { fontSizeMobile: 14, color: '#6d5dfc', fontSize: 15, fontWeight: 600, paddingY: 8 },
  closeButton: { fontSizeMobile: 24, color: '#172033', backgroundColor: '#ffffff', backgroundOpacity: 85, fontSize: 26, fontWeight: 400, paddingX: 8, paddingY: 4, borderRadius: 24, textAlign: 'center' }
};

const elementBase = {
  color: '#172033', backgroundColor: '#ffffff', backgroundOpacity: 0,
  fontSize: 16, fontSizeMobile: 16, fontWeight: 600, fontFamily: 'Inter', textAlign: 'left',
  borderColor: '#e5e7eb', borderWidth: 0, borderRadius: 0, paddingX: 0, paddingY: 0
};
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/u);
const elementSchema = z.object({
  color, backgroundColor: color, backgroundOpacity: z.number().min(0).max(100),
  fontSize: z.number().min(8).max(72), fontSizeMobile: z.number().min(8).max(72), fontWeight: z.number().int().min(100).max(900).multipleOf(100),
  fontFamily: z.enum(['Inter', 'Arial', 'Georgia', 'system-ui']), textAlign: z.enum(['left', 'center', 'right']),
  borderColor: color, borderWidth: z.number().min(0).max(6), borderRadius: z.number().min(0).max(40),
  paddingX: z.number().min(0).max(40), paddingY: z.number().min(0).max(32)
}).partial();

const configSchema = z.object({
  titleOverride: z.string().trim().max(240), showOldPrice: z.boolean(),
  oldPriceSource: z.enum(['catalog', 'manual']),
  manualOldPrice: z.string().trim().max(24).refine((value) => !value || /^(?:0|[1-9]\d{0,9})(?:[.,]\d{1,2})?$/u.test(value), 'Вкажіть додатну ціну з максимум двома знаками після коми.'),
  showSavings: z.boolean(), savingsLabel: z.string().trim().max(60),
  imageWidth: z.number().int().min(0).max(40000), imageHeight: z.number().int().min(0).max(40000),
  overlayColor: color, overlayOpacity: z.number().min(0).max(90),
  contentPadding: z.number().min(12).max(64), contentGap: z.number().min(4).max(40),
  contentPaddingMobile: z.number().min(8).max(40), contentGapMobile: z.number().min(4).max(32),
  borderColor: color, borderWidth: z.number().min(0).max(6),
  elements: z.object(Object.fromEntries(Object.keys(productPopupElementDefaults).map((key) => [key, elementSchema.optional()]))).optional()
}).partial();

export function normalizeProductPopupConfig(value) {
  const parsed = configSchema.safeParse(value || {});
  const source = parsed.success ? parsed.data : {};
  return {
    titleOverride: '', showOldPrice: false, oldPriceSource: 'catalog', manualOldPrice: '',
    showSavings: false, savingsLabel: 'Вигода', imageWidth: 0, imageHeight: 0,
    overlayColor: '#0f172a', overlayOpacity: 56, contentPadding: 36, contentGap: 16, contentPaddingMobile: 24, contentGapMobile: 12,
    borderColor: '#e5e7eb', borderWidth: 0,
    ...source,
    elements: Object.fromEntries(Object.entries(productPopupElementDefaults).map(([key, defaults]) => [
      key, { ...elementBase, ...defaults, ...source.elements?.[key] }
    ]))
  };
}

export const productPopupConfigSchema = configSchema.optional().transform(normalizeProductPopupConfig);

export function productPopupOfferIsUsable(product, storeDomain) {
  if (!product?.available || !product.visible || !product.title || !product.pageUrl) return false;
  const price = Number(String(product.price).replace(/\s/gu, '').replace(',', '.'));
  if (!Number.isFinite(price) || price <= 0) return false;
  try {
    const url = new URL(product.pageUrl);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      && url.hostname.replace(/^www\./u, '') === storeDomain.replace(/^www\./u, '');
  } catch { return false; }
}
