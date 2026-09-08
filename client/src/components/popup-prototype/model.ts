import { z } from 'zod';

export type PrototypeKind = 'product' | 'lead-form';
export type Device = 'desktop' | 'mobile';
export type PreviewState = 'default' | 'errors' | 'sending' | 'success';
export type Selection = 'banner' | 'copy' | 'products' | 'cta' | 'fields' | 'success' | 'coupon' | 'rules' | `field:${string}`;

const color = z.string().regex(/^#[\da-f]{6}$/i);
const deviceSchema = z.object({ width: z.number().min(280).max(800), titleSize: z.number().min(16).max(48), padding: z.number().min(12).max(48) });
const fieldSchema = z.object({
  id: z.string().max(100), type: z.enum(['text', 'email', 'phone', 'textarea', 'select', 'checkbox']),
  label: z.string().max(120), placeholder: z.string().max(160), required: z.boolean(),
  width: z.enum(['full', 'half']), options: z.string().max(1000)
});
export const draftSchema = z.object({
  kind: z.enum(['product', 'lead-form']), name: z.string().max(160),
  eyebrow: z.string().max(120), title: z.string().max(200), body: z.string().max(1000),
  button: z.string().max(80), accent: color, background: color, text: color,
  radius: z.number().min(0).max(36), buttonRadius: z.number().min(0).max(30),
  desktop: deviceSchema, mobile: deviceSchema,
  product: z.object({
    ids: z.array(z.string()).min(1).max(4), layout: z.enum(['compact', 'card', 'wide']),
    showOldPrice: z.boolean(), showBadge: z.boolean(), action: z.enum(['product', 'cart']),
    rotation: z.number().min(0).max(20)
  }),
  form: z.object({
    layout: z.enum(['simple', 'split']), fields: z.array(fieldSchema).min(1).max(8),
    successTitle: z.string().max(200), successBody: z.string().max(1000),
    code: z.string().max(40), discount: z.string().max(100), copyLabel: z.string().max(80)
  }),
  rules: z.object({ delay: z.number().min(0).max(60), pages: z.enum(['all', 'products']), frequency: z.enum(['session', 'day']) })
});
export type PrototypeDraft = z.infer<typeof draftSchema>;
export type PrototypeField = z.infer<typeof fieldSchema>;

export const demoProducts = [
  { id: 'titanium', title: 'iPhone 16 Pro', variant: '256 ГБ · Natural Titanium', price: 48999, oldPrice: 52999, tone: '#b4a58f', badge: 'Вигідна ціна' },
  { id: 'blue', title: 'iPhone 15', variant: '128 ГБ · Blue', price: 28999, oldPrice: 31999, tone: '#a7c4d4', badge: 'Хіт продажів' },
  { id: 'pink', title: 'iPhone 16', variant: '128 ГБ · Pink', price: 36999, oldPrice: 39999, tone: '#d8a1b2', badge: 'Обирають найчастіше' },
  { id: 'black', title: 'iPhone 16 Pro Max', variant: '256 ГБ · Black Titanium', price: 58999, oldPrice: 62999, tone: '#565b65', badge: 'Преміум вибір' }
];
export const fieldTypeLabels: Record<PrototypeField['type'], string> = {
  text: 'Текст', email: 'Email', phone: 'Телефон', textarea: 'Багаторядковий текст', select: 'Список', checkbox: 'Прапорець'
};
export const stateLabels: Record<PreviewState, string> = { default: 'Форма', errors: 'Помилки', sending: 'Відправлення', success: 'Промокод отримано' };

export function initialDraft(kind: PrototypeKind): PrototypeDraft {
  return {
    kind, name: kind === 'product' ? 'Добірка тижня' : 'Знижка за знайомство',
    eyebrow: kind === 'product' ? 'ВАРТО ПРИДИВИТИСЯ' : 'ПРИЄМНО ПОЗНАЙОМИТИСЯ',
    title: kind === 'product' ? 'Твій наступний iPhone' : 'Твій перший бонус — 10%',
    body: kind === 'product' ? 'Улюблені моделі за особливими цінами. Знайди свою.' : 'Залиш контакти й отримай промокод на першу покупку. Все просто.',
    button: kind === 'product' ? 'Переглянути товар' : 'Отримати промокод',
    accent: '#6554c0', background: '#ffffff', text: '#252438', radius: 24, buttonRadius: 12,
    desktop: { width: kind === 'product' ? 580 : 620, titleSize: 30, padding: 28 },
    mobile: { width: 350, titleSize: 24, padding: 20 },
    product: { ids: ['titanium', 'blue', 'pink'], layout: 'wide', showOldPrice: true, showBadge: true, action: 'product', rotation: 0 },
    form: {
      layout: 'split', fields: [
        { id: 'name', type: 'text', label: 'Як до тебе звертатися?', placeholder: 'Твоє ім’я', required: false, width: 'full', options: '' },
        { id: 'email', type: 'email', label: 'Електронна пошта', placeholder: 'you@example.com', required: true, width: 'full', options: '' }
      ],
      successTitle: 'Бонус уже твій!', successBody: 'Скопіюй промокод і введи його під час оформлення замовлення.',
      code: 'HELLO10', discount: '−10% на першу покупку', copyLabel: 'Скопіювати промокод'
    },
    rules: { delay: 5, pages: 'all', frequency: 'session' }
  };
}

export function readDraft(key: string, kind: PrototypeKind): PrototypeDraft {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved?.version === 1) {
      const parsed = draftSchema.safeParse(saved.draft);
      if (parsed.success && parsed.data.kind === kind && parsed.data.product.ids.every((id) => demoProducts.some((product) => product.id === id))) return parsed.data;
    }
  } catch { /* A missing, unavailable or older draft starts with the sample. */ }
  return initialDraft(kind);
}

export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const copy = [...items];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}
