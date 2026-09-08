import { z } from 'zod';
export const blockTypes = ['container', 'text', 'image', 'button', 'divider', 'spacer', 'coupon', 'countdown', 'form', 'field', 'product'];
export const blockLabels = { container: 'Контейнер', text: 'Текст', image: 'Зображення', button: 'Кнопка', divider: 'Роздільник', spacer: 'Відступ', coupon: 'Промокод', countdown: 'Таймер', form: 'Форма', field: 'Поле форми', product: 'Товар' };
export const MAX_BLOCKS = 120;
export const MAX_DEPTH = 12;
const color = z.string().regex(/^(#[a-f\d]{6}|transparent)$/i);
export const styleSchema = z.object({
    direction: z.enum(['row', 'column']).default('column'), wrap: z.boolean().default(false),
    justify: z.enum(['flex-start', 'center', 'flex-end', 'space-between', 'space-around']).default('flex-start'),
    align: z.enum(['stretch', 'flex-start', 'center', 'flex-end']).default('stretch'),
    gap: z.number().min(0).max(120).default(12), rowGap: z.number().min(0).max(120).default(12),
    widthMode: z.enum(['auto', 'fill', 'fixed', 'percent']).default('fill'), width: z.number().min(1).max(1400).default(240),
    heightMode: z.enum(['auto', 'fixed']).default('auto'), height: z.number().min(1).max(1600).default(160),
    minHeight: z.number().min(0).max(1200).default(0), maxWidth: z.number().min(0).max(1400).default(0),
    grow: z.number().min(0).max(10).default(0), shrink: z.boolean().default(true),
    paddingTop: z.number().min(0).max(120).default(0), paddingRight: z.number().min(0).max(120).default(0), paddingBottom: z.number().min(0).max(120).default(0), paddingLeft: z.number().min(0).max(120).default(0),
    marginTop: z.number().min(-80).max(120).default(0), marginRight: z.number().min(-80).max(120).default(0), marginBottom: z.number().min(-80).max(120).default(0), marginLeft: z.number().min(-80).max(120).default(0),
    background: color.default('transparent'), color: color.default('#252438'),
    radius: z.number().min(0).max(100).default(0), borderWidth: z.number().min(0).max(12).default(0), borderColor: color.default('#e5e2ed'), borderStyle: z.enum(['solid', 'dashed', 'dotted']).default('solid'),
    shadow: z.enum(['none', 'soft', 'medium', 'large']).default('none'), opacity: z.number().min(0).max(1).default(1),
    fontSize: z.number().min(8).max(96).default(16), fontWeight: z.number().min(300).max(800).default(400),
    fontFamily: z.enum(['inherit', 'Arial, sans-serif', 'Georgia, serif', 'monospace']).default('inherit'),
    lineHeight: z.number().min(1).max(3).default(1.5), letterSpacing: z.number().min(-5).max(15).default(0),
    textAlign: z.enum(['left', 'center', 'right']).default('left'), italic: z.boolean().default(false), underline: z.boolean().default(false),
    hidden: z.boolean().default(false), overflow: z.enum(['visible', 'hidden']).default('visible')
});
// Optional mobile properties must remain absent; Zod defaults inside partial() would override inheritance.
const mobileStyleSchema = z.object(Object.fromEntries(Object.entries(styleSchema.shape).map(([key, schema]) => [key, schema.removeDefault().optional()])));
export const propsSchema = z.object({
    text: z.string().max(3000).default(''), src: z.string().max(2000).default(''), alt: z.string().max(240).default(''),
    imageFit: z.enum(['contain', 'cover']).default('contain'), imagePosition: z.enum(['center', 'top', 'bottom', 'left', 'right']).default('center'),
    binding: z.enum(['none', 'product.title', 'product.variant', 'product.price', 'product.oldPrice', 'product.badge', 'product.image']).default('none'),
    action: z.enum(['link', 'close', 'copy', 'submit', 'product', 'cart']).default('link'), href: z.string().max(2000).default(''), newTab: z.boolean().default(false),
    code: z.string().max(80).default('HELLO10'), copyLabel: z.string().max(120).default('Скопіювати'),
    timerMode: z.enum(['duration', 'deadline']).default('duration'), durationMinutes: z.number().min(1).max(43200).default(15), deadlineAt: z.string().max(40).default(''), hideOnExpire: z.boolean().default(true),
    fieldType: z.enum(['text', 'email', 'phone', 'textarea', 'select', 'checkbox']).default('email'), placeholder: z.string().max(200).default(''), required: z.boolean().default(false), options: z.string().max(1600).default('Варіант 1\nВаріант 2'),
    // The root sets the banner product; product blocks may override it for their descendants.
    productExternalId: z.string().max(300).default(''), modificationExternalId: z.string().max(300).default(''),
    couponSource: z.enum(['custom', 'campaign']).default('custom'), reward: z.enum(['none', 'promo_code']).default('none'),
    productId: z.enum(['titanium', 'blue', 'pink', 'black']).default('titanium'), successMessage: z.string().max(1000).default('Дякуємо! Контакти отримано.')
});
const nodeSchema = z.object({
    id: z.string().regex(/^[a-z][a-z\d_-]{0,79}$/i), type: z.enum(blockTypes), name: z.string().max(120),
    style: styleSchema, mobile: mobileStyleSchema, props: propsSchema,
    children: z.array(z.lazy(() => nodeSchema)).max(MAX_BLOCKS)
});
const documentSchema = z.object({ version: z.literal(1), name: z.string().max(160), root: nodeSchema });
export function isContainer(node) { return ['container', 'form', 'product'].includes(node.type); }
export function effectiveStyle(node, device) { return device === 'mobile' ? { ...node.style, ...node.mobile } : node.style; }
export function flatten(root, parent = null, depth = 0) {
    return [{ node: root, parent, depth }, ...root.children.flatMap((child) => flatten(child, root, depth + 1))];
}
export function findBlock(root, id) { return flatten(root).find((entry) => entry.node.id === id); }
export function validateDocument(value) {
    // Bound depth/count before asking the recursive schema to walk untrusted imports.
    const pending = [{ value: value?.root, depth: 0, inForm: false }];
    const ids = new Set();
    while (pending.length) {
        const entry = pending.pop();
        const node = entry.value;
        if (!node || typeof node !== 'object' || !Array.isArray(node.children))
            throw new Error('Некоректна структура блока.');
        if (entry.depth > MAX_DEPTH || ids.size >= MAX_BLOCKS)
            throw new Error(`Макет підтримує до ${MAX_BLOCKS} блоків і ${MAX_DEPTH} рівнів вкладеності.`);
        if (ids.has(node.id))
            throw new Error('Ідентифікатори блоків мають бути унікальними.');
        ids.add(node.id);
        if (!isContainer(node) && node.children.length)
            throw new Error('Вкладати блоки можна лише в контейнери, форми й товари.');
        if (entry.inForm && node.type === 'form')
            throw new Error('Не можна вкладати форму в іншу форму.');
        if (node.type === 'field' && !entry.inForm)
            throw new Error('Поле має бути всередині форми.');
        for (const child of node.children)
            pending.push({ value: child, depth: entry.depth + 1, inForm: entry.inForm || node.type === 'form' });
    }
    const result = documentSchema.safeParse(value);
    if (!result.success || result.data.root.type !== 'container')
        throw new Error('Файл містить некоректні властивості макета.');
    return result.data;
}
