import { AppError } from '../../lib/app-error.js';
import { effectiveStyle, flatten, validateDocument } from './block-layout.schema.js';

export function normalizeBlockDocument(value) {
  if (value == null) return null;
  try {
    if (JSON.stringify(value).length > 500000) throw new Error('Макет має бути меншим за 500 КБ.');
    return validateDocument(value);
  } catch (error) { throw new AppError(422, 'POPUP_BLOCK_DOCUMENT_INVALID', error.message || 'Некоректний макет банера.'); }
}
export function blockProductReferences(document) {
  const items = new Map();
  for (const { node } of flatten(document.root)) if ((node === document.root || node.type === 'product') && node.props.productExternalId) {
    const value = { productExternalId: node.props.productExternalId, modificationExternalId: node.props.modificationExternalId || null };
    items.set(JSON.stringify(value), value);
  }
  for (const { node } of flatten(document.root)) if (node.type === 'collection' && node.props.collection.source === 'manual') for (const ref of node.props.collection.items) items.set(JSON.stringify(ref), ref);
  return [...items.values()];
}
export function blockNeedsPromoCode(document) {
  return flatten(document.root).some(({ node }) => (node.type === 'form' && node.props.reward === 'promo_code') || ((node.type === 'coupon' || (node.type === 'button' && node.props.action === 'copy')) && node.props.couponSource === 'campaign'));
}
export function blockHasRewardForm(document) { return flatten(document.root).some(({ node }) => node.type === 'form' && node.props.reward === 'promo_code'); }
export function visibleBlockNodes(root, device) {
  if (effectiveStyle(root, device).hidden) return [];
  return [root, ...root.children.flatMap((child) => visibleBlockNodes(child, device))];
}
export function blockFormConfig(document, formId, device = null) {
  const nodes = device ? visibleBlockNodes(document.root, device) : flatten(document.root).map(({ node }) => node);
  const form = nodes.find((node) => node.id === formId && node.type === 'form');
  if (!form) return null;
  const fields = (device ? visibleBlockNodes(form, device) : flatten(form).map(({ node }) => node)).filter((node) => node.type === 'field').map((node) => ({
    id: node.id, type: node.props.fieldType, label: node.props.text.trim().slice(0, 120), placeholder: node.props.placeholder,
    required: node.props.required, options: [...new Set(node.props.options.split('\n').map((value) => value.trim()).filter(Boolean))]
  }));
  return { fields, formId, reward: form.props.reward, successMessage: form.props.successMessage, submitLabel: 'Надіслати', successTitle: form.props.successMessage, successBody: '', blocks: [] };
}
export function allBlockFields(document) {
  return flatten(document.root).filter(({ node }) => node.type === 'form').flatMap(({ node }) => blockFormConfig(document, node.id).fields);
}
export function blockDeadlineExpired(document, now = Date.now(), device = null) {
  return (device ? [device] : ['desktop', 'mobile']).every(surface => visibleBlockNodes(document.root, surface).some(node => node.type === 'countdown' && node.props.hideOnExpire && node.props.timerMode === 'deadline' && Date.parse(node.props.deadlineAt) <= now));
}
export function validateBlockPublication(document, { products = [], promoCode = null, now = Date.now(), behavior = null } = {}) {
  const fail = (message) => { throw new AppError(422, 'POPUP_BLOCK_NOT_READY', message); };
  if (!document || !document.root.children.length) fail('Додайте вміст до банера перед публікацією.');
  const entries = flatten(document.root);
  const productKeys = new Set(products.filter((item) => item.available && item.visible).map((item) => JSON.stringify([item.productExternalId, item.modificationExternalId || ''])));
  for (const { node, parent } of entries) {
    if ((node === document.root || node.type === 'product') && node.props.productExternalId && !productKeys.has(JSON.stringify([node.props.productExternalId, node.props.modificationExternalId || '']))) fail('Оберіть доступний товар із поточного каталогу для ' + (node === document.root ? 'банера.' : 'блока «' + node.name + '».'));
    if (node.type === 'countdown') {
      if (node.props.timerMode === 'deadline' && (!/T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(node.props.deadlineAt) || !Number.isFinite(Date.parse(node.props.deadlineAt)) || Date.parse(node.props.deadlineAt) <= now)) fail('Вкажіть майбутню дату завершення таймера з часовим поясом.');
      if (!Number.isInteger(node.props.durationMinutes)) fail('Тривалість таймера має бути цілим числом хвилин.');
    }
    if (node.type === 'image' && node.props.binding === 'none' && !/^https?:\/\//iu.test(node.props.src)) fail('Додайте зображення до блока «' + node.name + '».');
    if (node.type === 'button' && node.props.action === 'link') {
      try { const url = new URL(node.props.href, 'https://popup.invalid'); if (!node.props.href.trim() || !['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) fail('Вкажіть коректне посилання кнопки «' + node.name + '».'); }
      catch { fail('Вкажіть коректне посилання кнопки «' + node.name + '».'); }
    }
    if ((node.type === 'coupon' || (node.type === 'button' && node.props.action === 'copy')) && node.props.couponSource === 'custom' && !node.props.code.trim()) fail('Вкажіть промокод для копіювання.');
    if (node.type === 'field' && node.props.fieldType === 'select') {
      const options = node.props.options.split('\n').map((value) => value.trim()).filter(Boolean);
      if (!options.length || options.length > 20 || options.some((value) => value.length > 80)) fail('Список має містити від 1 до 20 варіантів до 80 символів кожен.');
    }
    let ancestor = parent;
    let inCollection = false;
    let inProduct = node.type === 'product' && Boolean(node.props.productExternalId); let inForm = false;
    while (ancestor) { if ((ancestor === document.root || ancestor.type === 'product') && ancestor.props.productExternalId) inProduct = true; if (ancestor.type === 'form') inForm = true; if (ancestor.type === 'collection') { inCollection = true; inProduct = true; } ancestor = entries.find((entry) => entry.node.id === ancestor.id)?.parent || null; }
    if (node.props.dataSource === 'page') inProduct = true;
    if (node.props.dataSource === 'banner') inProduct = Boolean(document.root.props.productExternalId);
    if (node.props.dataSource === 'item' && !inCollection) fail('Джерело «Товар картки» доступне лише всередині добірки.');
    if (node.type === 'collection' && node.props.collection.source === 'selected_category' && !node.props.collection.categoryId) fail('Оберіть категорію добірки.');
    if (node.type === 'collection' && node.props.collection.source === 'manual' && !node.props.collection.items.length) fail('Додайте товари до ручної добірки.');
    if ((node.type === 'product' || (node.props.binding !== 'none' && ['text', 'image'].includes(node.type)) || (node.type === 'button' && ['product', 'cart'].includes(node.props.action))) && !inProduct) fail('Для елемента «' + node.name + '» оберіть «Товар банера» або товар у батьківському блоці «Товар».');
    if (node.type === 'button' && node.props.action === 'submit' && !inForm) fail('Кнопка відправлення має бути всередині форми.');
  }
  for (const device of ['desktop', 'mobile']) {
    const visible = visibleBlockNodes(document.root, device);
    if (behavior && !behavior.dismissible && !behavior.autoCloseSeconds && !visible.some(node => node.type === 'button' && node.props.action === 'close')) fail('Додайте видиму кнопку закриття або дозвольте стандартне закриття на ' + device + '.');
    if (behavior?.requireAcknowledgement && !visible.some(node => node.type === 'acknowledgement')) fail('Додайте видимий блок «Підтвердження» на ' + device + '.');
    for (const form of visible.filter((node) => node.type === 'form')) {
      const children = visibleBlockNodes(form, device);
      if (!children.some((node) => node.type === 'field')) fail('У формі потрібне хоча б одне видиме поле для ' + device + '.');
      if (!children.some((node) => node.type === 'button' && node.props.action === 'submit')) fail('Додайте кнопку відправлення форми для ' + device + '.');
    }
  }
  if (blockNeedsPromoCode(document) && !promoCode?.code) fail('Оберіть промокод із бібліотеки у налаштуваннях кампанії.');
}
