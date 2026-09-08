import { z } from 'zod';

export const blockTypes = ['container', 'text', 'image', 'button', 'divider', 'spacer', 'coupon', 'countdown', 'form', 'field', 'product'] as const;
export type BlockType = typeof blockTypes[number];
export type Device = 'desktop' | 'mobile';
export const blockLabels: Record<BlockType, string> = { container: 'Контейнер', text: 'Текст', image: 'Зображення', button: 'Кнопка', divider: 'Роздільник', spacer: 'Відступ', coupon: 'Промокод', countdown: 'Таймер', form: 'Форма', field: 'Поле форми', product: 'Товар' };
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
export type BlockStyle = z.infer<typeof styleSchema>;
// Optional mobile properties must remain absent; Zod defaults inside partial() would override inheritance.
const mobileStyleSchema = z.object(Object.fromEntries(Object.entries(styleSchema.shape).map(([key, schema]) => [key, schema.removeDefault().optional()]))) as z.ZodType<Partial<BlockStyle>>;
export const propsSchema = z.object({
  text: z.string().max(3000).default(''), src: z.string().max(2000).default(''), alt: z.string().max(240).default(''),
  imageFit: z.enum(['contain', 'cover']).default('contain'), imagePosition: z.enum(['center', 'top', 'bottom', 'left', 'right']).default('center'),
  binding: z.enum(['none', 'product.title', 'product.variant', 'product.price', 'product.oldPrice', 'product.badge', 'product.image']).default('none'),
  action: z.enum(['link', 'close', 'copy', 'submit', 'product', 'cart']).default('link'), href: z.string().max(2000).default(''), newTab: z.boolean().default(false),
  code: z.string().max(80).default('HELLO10'), copyLabel: z.string().max(120).default('Скопіювати'),
  timerMode: z.enum(['duration', 'deadline']).default('duration'), durationMinutes: z.number().min(1).max(43200).default(15), deadlineAt: z.string().max(40).default(''), hideOnExpire: z.boolean().default(true),
  fieldType: z.enum(['text', 'email', 'phone', 'textarea', 'select', 'checkbox']).default('email'), placeholder: z.string().max(200).default(''), required: z.boolean().default(false), options: z.string().max(1600).default('Варіант 1\nВаріант 2'),
  productId: z.enum(['titanium', 'blue', 'pink', 'black']).default('titanium'), successMessage: z.string().max(1000).default('Дякуємо! Твій промокод: HELLO10')
});
export type BlockProps = z.infer<typeof propsSchema>;
export interface BlockNode { id: string; type: BlockType; name: string; style: BlockStyle; mobile: Partial<BlockStyle>; props: BlockProps; children: BlockNode[] }
const nodeSchema: z.ZodType<BlockNode> = z.object({
  id: z.string().regex(/^[a-z][a-z\d_-]{0,79}$/i), type: z.enum(blockTypes), name: z.string().max(120),
  style: styleSchema, mobile: mobileStyleSchema, props: propsSchema,
  children: z.array(z.lazy(() => nodeSchema)).max(MAX_BLOCKS)
});
export interface BlockDocument { version: 1; name: string; root: BlockNode }
const documentSchema = z.object({ version: z.literal(1), name: z.string().max(160), root: nodeSchema });

export function isContainer(node: BlockNode) { return ['container', 'form', 'product'].includes(node.type); }
export function effectiveStyle(node: BlockNode, device: Device): BlockStyle { return device === 'mobile' ? { ...node.style, ...node.mobile } : node.style; }
export function flatten(root: BlockNode, parent: BlockNode | null = null, depth = 0): { node: BlockNode; parent: BlockNode | null; depth: number }[] {
  return [{ node: root, parent, depth }, ...root.children.flatMap((child) => flatten(child, root, depth + 1))];
}
export function findBlock(root: BlockNode, id: string) { return flatten(root).find((entry) => entry.node.id === id); }

export function validateDocument(value: unknown): BlockDocument {
  // Bound depth/count before asking the recursive schema to walk untrusted imports.
  const pending: { value: unknown; depth: number; inForm: boolean }[] = [{ value: (value as BlockDocument | null)?.root, depth: 0, inForm: false }];
  const ids = new Set<string>();
  while (pending.length) {
    const entry = pending.pop()!;
    const node = entry.value as BlockNode | null;
    if (!node || typeof node !== 'object' || !Array.isArray(node.children)) throw new Error('Некоректна структура блока.');
    if (entry.depth > MAX_DEPTH || ids.size >= MAX_BLOCKS) throw new Error(`Макет підтримує до ${MAX_BLOCKS} блоків і ${MAX_DEPTH} рівнів вкладеності.`);
    if (ids.has(node.id)) throw new Error('Ідентифікатори блоків мають бути унікальними.');
    ids.add(node.id);
    if (!isContainer(node) && node.children.length) throw new Error('Вкладати блоки можна лише в контейнери, форми й товари.');
    if (entry.inForm && node.type === 'form') throw new Error('Не можна вкладати форму в іншу форму.');
    if (node.type === 'field' && !entry.inForm) throw new Error('Поле має бути всередині форми.');
    for (const child of node.children) pending.push({ value: child, depth: entry.depth + 1, inForm: entry.inForm || node.type === 'form' });
  }
  const result = documentSchema.safeParse(value);
  if (!result.success || result.data.root.type !== 'container') throw new Error('Файл містить некоректні властивості макета.');
  return result.data;
}

export function makeBlock(type: BlockType, direction: 'row' | 'column' = 'column'): BlockNode {
  const node: BlockNode = { id: `b-${crypto.randomUUID()}`, type, name: blockLabels[type], style: styleSchema.parse({}), mobile: {}, props: propsSchema.parse({}), children: [] };
  if (isContainer(node)) { node.style.direction = direction; node.style.minHeight = 48; if (direction === 'row') node.mobile.direction = 'column'; }
  if (type === 'container') node.name = direction === 'row' ? 'Горизонтальний блок' : 'Вертикальний блок';
  if (type === 'text') node.props.text = 'Новий текст';
  if (type === 'button') { node.props.text = 'Дізнатися більше'; Object.assign(node.style, { background: '#6554c0', color: '#ffffff', paddingTop: 12, paddingRight: 20, paddingBottom: 12, paddingLeft: 20, radius: 12, textAlign: 'center', fontWeight: 600 }); }
  if (type === 'image') { node.props.alt = 'Зображення банера'; Object.assign(node.style, { heightMode: 'fixed', height: 180, background: '#f2effa', radius: 16 }); }
  if (type === 'divider') Object.assign(node.style, { heightMode: 'fixed', height: 1, background: '#e5e2ed' });
  if (type === 'spacer') Object.assign(node.style, { heightMode: 'fixed', height: 24 });
  if (type === 'coupon') Object.assign(node.style, { paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16, background: '#f3effc', borderWidth: 1, borderStyle: 'dashed', borderColor: '#c0b4e8', radius: 12, fontSize: 22, fontWeight: 650 });
  if (type === 'countdown') Object.assign(node.style, { fontSize: 28, fontWeight: 650, textAlign: 'center', color: '#6554c0' });
  if (type === 'field') node.props.text = 'Електронна пошта';
  if (type === 'form') { const field = makeBlock('field'); field.props.required = true; const button = makeBlock('button'); button.props.action = 'submit'; button.props.text = 'Отримати промокод'; node.children = [field, button]; }
  if (type === 'product') {
    node.style.direction = 'row'; node.mobile.direction = 'column';
    const photo = makeBlock('image'); photo.name = 'Фото товару'; photo.props.binding = 'product.image'; Object.assign(photo.style, { widthMode: 'fixed', width: 180, shrink: false }); photo.mobile = { widthMode: 'fill' };
    const details = makeBlock('container'); details.name = 'Інформація про товар';
    const title = makeBlock('text'); title.name = 'Назва товару'; title.props.binding = 'product.title'; Object.assign(title.style, { fontSize: 22, fontWeight: 650 });
    const price = makeBlock('text'); price.name = 'Ціна товару'; price.props.binding = 'product.price'; Object.assign(price.style, { fontSize: 26, fontWeight: 650 });
    const button = makeBlock('button'); button.props.action = 'product'; button.props.text = 'Переглянути товар';
    details.children = [title, price, button]; node.children = [photo, details];
  }
  return node;
}
export function blankDocument(): BlockDocument {
  const root = makeBlock('container'); root.name = 'Банер';
  Object.assign(root.style, { widthMode: 'fixed', width: 640, minHeight: 180, paddingTop: 32, paddingRight: 32, paddingBottom: 32, paddingLeft: 32, gap: 20, rowGap: 20, background: '#ffffff', radius: 24, shadow: 'large' });
  root.mobile = { width: 350, paddingTop: 20, paddingRight: 20, paddingBottom: 20, paddingLeft: 20 };
  return { version: 1, name: 'Мій банер', root };
}

export function patchBlock(root: BlockNode, id: string, update: (node: BlockNode) => BlockNode): BlockNode {
  if (root.id === id) return update(root);
  return { ...root, children: root.children.map((child) => patchBlock(child, id, update)) };
}
export function removeBlock(document: BlockDocument, id: string): BlockDocument {
  if (document.root.id === id) throw new Error('Кореневий банер не можна видалити.');
  const prune = (node: BlockNode): BlockNode => ({ ...node, children: node.children.filter((child) => child.id !== id).map(prune) });
  return { ...document, root: prune(document.root) };
}
export function insertBlock(document: BlockDocument, parentId: string, block: BlockNode, index?: number): BlockDocument {
  const parent = findBlock(document.root, parentId)?.node;
  if (!parent || !isContainer(parent)) throw new Error('Оберіть контейнер для нового блока.');
  const root = patchBlock(document.root, parentId, (node) => { const children = [...node.children]; children.splice(index ?? children.length, 0, block); return { ...node, children }; });
  return validateDocument({ ...document, root });
}
export function moveBlock(document: BlockDocument, id: string, parentId: string, index?: number): BlockDocument {
  const source = findBlock(document.root, id);
  if (!source?.parent) throw new Error('Кореневий банер не можна переміщувати.');
  if (findBlock(source.node, parentId)) throw new Error('Не можна перемістити блок усередину себе або його нащадка.');
  const oldIndex = source.parent.children.findIndex((child) => child.id === id);
  const position = index === undefined ? undefined : source.parent.id === parentId && oldIndex < index ? index - 1 : index;
  return insertBlock(removeBlock(document, id), parentId, source.node, position);
}
export function duplicateBlock(document: BlockDocument, id: string): { document: BlockDocument; id: string } {
  const source = findBlock(document.root, id);
  if (!source?.parent) throw new Error('Кореневий банер не можна дублювати.');
  const clone = (node: BlockNode): BlockNode => ({ ...structuredClone(node), id: `b-${crypto.randomUUID()}`, children: node.children.map(clone) });
  const copy = clone(source.node);
  return { document: insertBlock(document, source.parent.id, copy, source.parent.children.findIndex((node) => node.id === id) + 1), id: copy.id };
}
export function wrapBlock(document: BlockDocument, id: string, direction: 'row' | 'column') {
  const source = findBlock(document.root, id);
  if (!source?.parent) throw new Error('Оберіть вкладений блок для обгортання.');
  const wrapper = makeBlock('container', direction); wrapper.children = [source.node];
  return { document: validateDocument({ ...document, root: patchBlock(document.root, source.parent.id, (node) => ({ ...node, children: node.children.map((child) => child.id === id ? wrapper : child) })) }), id: wrapper.id };
}
export function safeHref(value: string) { return /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(value.trim()) ? value.trim() : ''; }
