import { styleSchema, propsSchema, blockLabels, isContainer, findBlock, validateDocument } from '../../../../src/modules/popup-banners/block-layout.schema.js';
import type { BlockType, BlockNode, BlockDocument } from '../../../../src/modules/popup-banners/block-layout.schema.js';
export * from '../../../../src/modules/popup-banners/block-layout.schema.js';

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
  if (type === 'acknowledgement') { node.props.text = 'Я ознайомився з інформацією про товар'; node.style.fontSize = 13; }
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
  if (type === 'collection') {
    const card = makeBlock('product'); card.type = 'container'; card.name = 'Шаблон картки добірки'; card.style.direction = 'column';
    card.children[0].style.widthMode = 'fill';
    Object.assign(card.style, { paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16, background: '#f5f2fc', radius: 16 });
    node.children = [card];
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
