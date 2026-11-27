import {isPaint} from './paint.mjs';
import {createTimerContent,validateTimerContent,timerDiagnostics,validTimerTimezone} from './timer.mjs';
/** The format shared by editor, server validation and the public renderer. */
import { createFormContent, validateFormContent } from './forms.mjs';
import { zeroFieldErrors } from './zero-form.mjs';
import {validateShapeContent,safeShapeUrl} from './shape.mjs';
import {validateTextContent} from './text.mjs';
import {validateButtonContent} from './button.mjs';
import {formFlowErrors} from './form-flow.mjs';
import {validatePromoContent} from './promo.mjs';
import {validateProductContent,productDiagnostics} from './product.mjs';
import {bindingDiagnostics} from './product-bindings.mjs';
import {productUrl} from './product.mjs';
import {validatePlacement} from './placement.mjs';
import {COMPOSITION_LIMITS} from './responsive.mjs';
import {actionAccessibleName} from './accessibility.mjs';
export {COMPOSITION_LIMITS} from './responsive.mjs';
export const POPUP_SCHEMA_VERSION = 1;
export const ELEMENT_TYPES = ['text', 'image', 'button', 'shape', 'product', 'promo', 'form', 'field', 'timer'];
export const ACTION_TYPES = ['navigate', 'close', 'submit', 'copy_promo', 'product'];
export const defaultCorners = () => ({ topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 });
export const defaultShadow = () => ({ enabled: true, x: 0, y: 18, blur: 54, spread: 0, color: '#00000040' });
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const simple = (value) => value && typeof value === 'object' && !Array.isArray(value);
const string = (value, min, max) => typeof value === 'string' && value.length >= min && value.length <= max && !/[\u0000-\u0008\u000e-\u001f]/.test(value);
const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const keys = (value, allowed) => Object.keys(value).every((key) => allowed.includes(key));
const fail = (message) => { throw new Error(message); };

export function safeUrl(value) {
  if (!string(value, 8, 2048)) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !/\s/.test(value);
  } catch { return false; }
}

/** @returns {import('@workspace/popup-banners/zero-block/types').PopupDocument} */
export function createPopupDocument(shopId, widgetId, name = 'Новий поп-ап') {
  const document = { schemaVersion: POPUP_SCHEMA_VERSION, shopId, widgetId, revision: 1, name, priority: 0,
    desktop: { width: 960, height: 600, background: '#ffffff', corners: defaultCorners(), shadow: defaultShadow() },
    mobile: { width: 360, height: 640, background: '#ffffff', corners: defaultCorners(), shadow: defaultShadow() },
    elements: [], forms: [], rules: { schemaVersion: 1, rules: [] } };
  return document;
}

/** @param {string} type @param {string | null} [formId]
 * @returns {import('@workspace/popup-banners/zero-block/types').PopupElement} */
export function createElement(type, formId = null) {
  return createElementBase(type,formId);
}

function createElementBase(type, formId = null) {
  if (!ELEMENT_TYPES.includes(type)) fail('Невідомий тип елемента');
  const id = crypto.randomUUID();
  const base = { id, type, role: type === 'button' ? 'button' : 'decorative', action: null,
    desktop: { x: 60, y: 60, width: 240, height: 72 },
    mobile: { x: 24, y: 60, width: 312, height: 72 }, mobileStyle: null,
    style: { color: '#25231f', background: '#ffffff', fontSize: 24, fontWeight: 500, textAlign: 'left', radius: 0, fit: 'contain' } };
  if (type === 'text') return { ...base, style: { ...base.style, background: '#FFFFFF00' }, content: { text: 'Новий текст',typography:{version:1,base:{fit:'auto-height'}} } };
  if (type === 'image') return { ...base, style:{...base.style,background:'#FFFFFF00'}, desktop: { ...base.desktop, height: 240 }, mobile: { ...base.mobile, height: 312 }, content: { resourceId: null, alt: '' } };
  if (type === 'button') return { ...base, content: { text: 'Кнопка',button:{version:1,base:{fit:'fixed',align:'center'}} }, style: { ...base.style, color: '#ffffff', background: '#24221f', radius: 16 } };
  if (type === 'shape') return { ...base, desktop:{...base.desktop,width:100,height:100},mobile:{...base.mobile,width:100,height:100},content: { accessibleName: '',shape:{version:1,kind:'rectangle',base:{}} }, style: { ...base.style, background: '#eaddbc', radius: 16 } };
  if (type === 'product') return { ...base, desktop: { ...base.desktop, width: 600, height: 180 }, mobile: { ...base.mobile, height: 360 }, content: { productId: null, product: { version: 1, preset: 'horizontal', base: {} } } };
  if (type === 'timer') return {...base,desktop:{...base.desktop,width:360,height:112},mobile:{...base.mobile,height:104},style:{...base.style,background:'#FFFFFF00'},content:createTimerContent()};
  if (type === 'promo') return { ...base, style: { ...base.style, background: '#FFFFFF00' }, content: { value: '', label: '',promo:{version:1,variant:'capsule',base:{}} } };
  if (type === 'form') return { ...base, desktop: { ...base.desktop, width: 320, height: 240 }, mobile: { ...base.mobile, height: 240 }, style: { ...base.style, background: '#FFFFFF00', fontSize: 16 }, content: createFormContent(formId || undefined) };
  return { ...base, style: { ...base.style, background: '#FFFFFF00' }, content: { formId, fieldType: 'text', label: '', required: false, placeholder: '' } };
}

function validateBox(box, label, minimum=16) {
  if (!simple(box) || !keys(box, ['x', 'y', 'width', 'height', 'scale']) || (box.scale !== undefined && !number(box.scale, .01, 100)) ||
      !number(box.x, -1000, 3000) || !number(box.y, -1000, 3000) ||
      !number(box.width, minimum, 3000) || !number(box.height, minimum, 3000)) fail(`Некоректна геометрія: ${label}`);
}
/** Adapt a loaded legacy draft only; callers retain explicit save and publication boundaries. */
export function constrainPopupCanvas(document) {
  let changed = false;
  for (const [device, limits] of Object.entries(COMPOSITION_LIMITS)) {
    const board = document[device];
    if (!board) continue;
    for (const [axis, min, max] of [['width', limits.minWidth, limits.maxWidth], ['height', limits.minHeight, limits.maxHeight]]) {
      if (typeof board[axis] !== 'number' || !Number.isFinite(board[axis])) continue;
      const value = Math.max(min, Math.min(max, board[axis]));
      if (value !== board[axis]) { board[axis] = value; changed = true; }
    }
  }
  return changed;
}

function validateComposition(value, label) {
  const limits = COMPOSITION_LIMITS[label];
  if (!simple(value) || !keys(value, ['width', 'height', 'background', 'corners', 'shadow', 'placement']) ||
      !number(value.width, limits.minWidth, limits.maxWidth) || !number(value.height, limits.minHeight, limits.maxHeight) || !isPaint(value.background)) fail(`Некоректна композиція: ${label} (ширина ${limits.minWidth}–${limits.maxWidth}, висота ${limits.minHeight}–${limits.maxHeight} px)`);
  if(value.placement!==undefined)validatePlacement(value.placement);
  if (value.corners !== undefined) {
    const corners = value.corners;
    if (!simple(corners) || !keys(corners, ['topLeft', 'topRight', 'bottomRight', 'bottomLeft']) ||
        !['topLeft', 'topRight', 'bottomRight', 'bottomLeft'].every(key => number(corners[key], 0, 999))) fail(`Некоректні кути: ${label}`);
  }
  if (value.shadow !== undefined) {
    const shadow = value.shadow;
    if (!simple(shadow) || !keys(shadow, ['enabled', 'x', 'y', 'blur', 'spread', 'color']) || typeof shadow.enabled !== 'boolean' ||
        !number(shadow.x, -200, 200) || !number(shadow.y, -200, 200) || !number(shadow.blur, 0, 200) || !number(shadow.spread, -100, 100) ||
        typeof shadow.color !== 'string' || !isPaint(shadow.color)) fail(`Некоректна тінь: ${label}`);
  }
}
function validateAction(action, shape=false) {
  if (action === null) return;
  if (!simple(action) || !ACTION_TYPES.includes(action.type)) fail('Некоректна дія');
  if (action.type === 'navigate') {
    if (!keys(action, ['type', 'url', 'target']) || !(shape?safeShapeUrl(action.url)||productUrl(action.url):safeUrl(action.url)||productUrl(action.url)) || !['same_tab', 'new_tab'].includes(action.target)) fail('Некоректне посилання');
  } else if (action.type === 'close') {
    if (!keys(action, ['type'])) fail('Некоректна дія закриття');
  } else if (action.type === 'product') {
    if (!keys(action, ['type','target']) || !['same_tab','new_tab'].includes(action.target)) fail('Некоректна товарна дія');
  } else if (action.type === 'submit') {
    if (!keys(action, ['type', 'formId']) || !ID.test(action.formId || '')) fail('Некоректна ціль форми');
  } else if (!keys(action, ['type', 'promoElementId']) || !ID.test(action.promoElementId || '')) fail('Некоректна ціль промокоду');
}
function validateElement(element) {
  if (!simple(element) || !keys(element, ['id', 'name', 'type', 'role', 'action', 'desktop', 'mobile', 'laptop','tablet','mobileLandscape','mobileStyle','laptopStyle','tabletStyle','mobileLandscapeStyle', 'style', 'content','locked']) || !ID.test(element.id || '') || !ELEMENT_TYPES.includes(element.type) || (element.locked!==undefined&&typeof element.locked!=='boolean')) fail('Некоректний елемент');
  if (element.name !== undefined && (!string(element.name, 1, 100) || element.name !== element.name.trim())) fail('Некоректна назва шару');
  if (!['decorative', 'link', 'button'].includes(element.role) || (element.type === 'button' && element.role !== 'button') || (!['text', 'image', 'shape', 'button'].includes(element.type) && element.role !== 'decorative')) fail('Некоректна роль елемента');
  validateBox(element.desktop, element.id,element.type==='shape'?1:16);
  if (element.mobile !== null) validateBox(element.mobile, element.id,element.type==='shape'?1:16);
  for (const device of ['laptop','tablet','mobileLandscape']) if (element[device] != null) validateBox(element[device],element.id,element.type==='shape'?1:16);
  const cornerKeys = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
  const validCorners = (value, partial = false) => element.type === 'image' && simple(value) && keys(value, cornerKeys) && (partial ? Object.values(value) : cornerKeys.map(key => value[key])).every(value => number(value, 0, 999));
  for (const device of ['mobile','laptop','tablet','mobileLandscape']) {
    const style = element[device+'Style'];
    if (style != null && (!simple(style) || !keys(style, ['fontSize', 'radius', 'corners']) || !number(style.fontSize, 10, 120) || (style.radius !== undefined && !number(style.radius, 0, 999)) || (style.corners !== undefined && !validCorners(style.corners, true)))) fail('Некоректний адаптивний стиль');
  }
  const style = element.style;
  if (!simple(style) || !keys(style, ['color', 'background', 'fontSize', 'fontWeight', 'textAlign', 'radius', 'corners', 'fit']) || !isPaint(style.color) || !isPaint(style.background) || !number(style.fontSize, 10, 120) || ![400, 500, 600, 700].includes(style.fontWeight) || !['left', 'center', 'right'].includes(style.textAlign) || !number(style.radius, 0, 999) || !['contain', 'cover'].includes(style.fit) || (style.corners !== undefined && !validCorners(style.corners))) fail('Некоректний стиль елемента');
  const content = element.content;
  if (!simple(content)) fail('Некоректний вміст елемента');
  if (element.type === 'text') validateTextContent(content);
  else if (element.type === 'button') validateButtonContent(content);
  else if (element.type === 'timer') validateTimerContent(content);
  else if (element.type === 'image') {
    if (!keys(content, ['resourceId', 'alt','productImage','externalUrl','mobileFit','laptopFit','tabletFit','mobileLandscapeFit','imageSize']) || (content.resourceId !== null && !ID.test(content.resourceId || '')) || !string(content.alt, 0, 300)) fail('Некоректне зображення');
    if(content.imageSize!==undefined){const size=content.imageSize;if(!simple(size)||!keys(size,['source','width','height'])||typeof size.source!=='string'||!(ID.test(size.source)||productUrl(size.source))||!['width','height'].every(key=>Number.isInteger(size[key])&&number(size[key],1,1000000)))fail('Некоректні природні розміри зображення');}
    if(content.mobileFit!==undefined&&!['contain','cover'].includes(content.mobileFit))fail('Некоректне мобільне вписування фото');
    for(const device of ['laptop','tablet','mobileLandscape'])if(content[device+'Fit']!==undefined&&!['contain','cover'].includes(content[device+'Fit']))fail('Некоректне адаптивне вписування фото');
    if(content.externalUrl!==undefined&&(!productUrl(content.externalUrl)||content.resourceId!==null||content.productImage))fail('Некоректне зовнішнє фото');
    if(content.productImage!==undefined){const image=content.productImage;if(!simple(image)||image.version!==1||!keys(image,['version','mode','url'])||!['main','specific'].includes(image.mode)||image.mode==='main'&&image.url!==undefined||image.mode==='specific'&&!productUrl(image.url)||content.resourceId!==null)fail('Некоректна прив’язка фото товару');}
  } else if (element.type === 'shape') {
    validateShapeContent(content);
  } else if (element.type === 'product') {
    validateProductContent(content);
  } else if (element.type === 'promo') {
    validatePromoContent(content);
  } else if (element.type === 'form') validateFormContent(content);
  else if (!keys(content, ['formId', 'fieldType', 'label', 'required', 'placeholder']) || !ID.test(content.formId || '') || !['text', 'email', 'tel', 'textarea'].includes(content.fieldType) || !string(content.label, 0, 200) || typeof content.required !== 'boolean' || !string(content.placeholder, 0, 200)) fail('Некоректне поле форми');
  validateAction(element.action,['shape','text','button'].includes(element.type));
  if (element.role === 'link' && !['navigate','product'].includes(element.action?.type)) fail('Посилання потребує адреси');
  if (element.role === 'decorative' && element.action !== null) fail('Декоративний елемент не має дії');
}

export function validatePopupStructure(document, expected = {}) {
  if (!simple(document) || !keys(document, ['schemaVersion', 'shopId', 'widgetId', 'revision', 'name', 'priority', 'timezone', 'desktop', 'mobile','laptop','tablet','mobileLandscape', 'elements', 'groups', 'forms', 'rules','productId','showCloseButton'])) fail('Некоректний документ');
  if (document.timezone !== undefined && !validTimerTimezone(document.timezone)) fail('Некоректний часовий пояс');
  if (document.showCloseButton !== undefined && typeof document.showCloseButton !== 'boolean') fail('Некоректне налаштування кнопки закриття');
  if(document.productId!==undefined&&document.productId!==null&&!ID.test(document.productId||''))fail('Некоректна прив’язка товару банера');
  if (document.schemaVersion !== POPUP_SCHEMA_VERSION) fail('Непідтримувана версія документа');
  if (!ID.test(document.shopId || '') || !ID.test(document.widgetId || '') ||
      (expected.shopId && document.shopId !== expected.shopId) || (expected.widgetId && document.widgetId !== expected.widgetId)) fail('Чужий магазин або віджет');
  if (!Number.isSafeInteger(document.revision) || document.revision < 1 || !string(document.name, 2, 100) || !Number.isInteger(document.priority) || document.priority < 0 || document.priority > 100) fail('Некоректна назва, пріоритет або ревізія');
  validateComposition(document.desktop, 'desktop'); validateComposition(document.mobile, 'mobile');
  for(const device of ['laptop','tablet','mobileLandscape'])if(document[device]!==undefined)validateComposition(document[device],device);
  if (!Array.isArray(document.elements) || document.elements.length > 100 || !Array.isArray(document.forms) || document.forms.length > 20) fail('Завеликий документ');
  const ids = new Set();
  for (const element of document.elements) { validateElement(element); if (ids.has(element.id)) fail('Повторний ID елемента'); ids.add(element.id); }
  if (document.groups !== undefined) {
    if (!Array.isArray(document.groups) || document.groups.length > 50) fail('Некоректні групи');
    for (const group of document.groups) {
      if (!simple(group) || !keys(group, ['id', 'name', 'children']) || !ID.test(group.id || '') || ids.has(group.id) || !string(group.name, 1, 100) || group.name !== group.name.trim() || !Array.isArray(group.children) || !group.children.length || group.children.length > 150) fail('Некоректна група');
      ids.add(group.id);
    }
    const byId = new Map(document.groups.map(group => [group.id, group])); const parent = new Map();
    for (const group of document.groups) for (const child of group.children) {
      if (typeof child !== 'string' || !ids.has(child) || parent.has(child)) fail('Некоректний учасник групи');
      parent.set(child, group.id);
    }
    for (const group of document.groups) {
      const seen = new Set([group.id]); let key = parent.get(group.id);
      while (key) { if (seen.has(key)) fail('Цикл груп'); seen.add(key); key = parent.get(key); }
    }
    const roots = []; for (const item of document.elements) { let key = item.id; while (parent.has(key)) key = parent.get(key); if (!roots.includes(key)) roots.push(key); }
    const ordered = []; const visit = id => { const group = byId.get(id); if (group) group.children.forEach(visit); else ordered.push(id); }; roots.forEach(visit);
    if (ordered.length !== document.elements.length || ordered.some((id, index) => id !== document.elements[index].id)) fail('Некоректний порядок груп');
  }
  const formIds = new Set();
  for (const form of document.forms) {
    if (!simple(form) || !keys(form, ['id', 'name']) || !ID.test(form.id || '') || !string(form.name, 2, 100) || formIds.has(form.id)) fail('Некоректна форма');
    formIds.add(form.id);
  }
  if (!simple(document.rules) || document.rules.schemaVersion !== 1 || !Array.isArray(document.rules.rules)) fail('Некоректні умови показу');
  return document;
}

export function popupDiagnostics(document, products) {
  const diagnostics = [];
  const elements = document.elements;
  if (document.showCloseButton === false && !elements.some(item => item.role === 'button' && item.action?.type === 'close')) diagnostics.push({ code: 'close_control_missing', message: 'Додайте об’єкт із дією «Закрити банер» або ввімкніть стандартну кнопку закриття.' });
  const forms = new Map(document.forms.map((form) => [form.id, form]));
  const fields = new Map();
  const components = new Set();
  for (const item of elements) if (item.type === 'form') {
    if (!forms.has(item.content.formId)) diagnostics.push({ elementId: item.id, code: 'field_form_missing', message: 'Форма посилається на видалене визначення' });
    if (components.has(item.content.formId)) diagnostics.push({ elementId: item.id, code: 'form_duplicate', message: 'Кожен компонент форми потребує власного визначення' });
    components.add(item.content.formId); fields.set(item.content.formId, item.content.fields.length);
    for(const error of [...zeroFieldErrors(item.content),...formFlowErrors(item.content)].filter(error=>error.semantic))diagnostics.push({elementId:item.id,code:'form_visibility_dependency',message:error.message});
  }
  for (const item of elements) if (item.type === 'field') {
    if (components.has(item.content.formId)) diagnostics.push({ elementId:item.id,code:'form_mixed',message:'Окреме поле не можна додавати до компонента форми. Оберіть окрему legacy-форму.' });
    if (!forms.has(item.content.formId)) diagnostics.push({ elementId: item.id, code: 'field_form_missing', message: 'Поле посилається на видалену форму' });
    fields.set(item.content.formId, (fields.get(item.content.formId) || 0) + 1);
  }
  const byId = new Map(elements.map((item) => [item.id, item]));
  for (const item of elements) {
    if (item.type === 'timer') diagnostics.push(...timerDiagnostics(item));
    if (item.type === 'image' && !item.content.resourceId&&!item.content.productImage&&!item.content.externalUrl) diagnostics.push({ elementId: item.id, code: 'image_missing', message: 'Завантажте зображення або оберіть фото товару' });
    if (item.type === 'promo' && !item.content.value.trim()) diagnostics.push({ elementId: item.id, code: 'promo_empty', message: 'Вкажіть значення промокоду' });
    if (item.role === 'button' && !item.action) diagnostics.push({ elementId: item.id, code: 'action_missing', message: 'Призначте дію кнопці' });
    if (item.role === 'button' && item.type === 'image' && !actionAccessibleName(item)) diagnostics.push({ elementId: item.id, code: 'name_missing', message: 'Вкажіть доступну назву зображення-кнопки' });
    if (item.role === 'button' && item.type === 'shape' && !actionAccessibleName(item)) diagnostics.push({ elementId: item.id, code: 'name_missing', message: 'Вкажіть доступну назву фігури-кнопки' });
    if (item.action?.type === 'submit' && !fields.get(item.action.formId)) diagnostics.push({ elementId: item.id, code: 'form_target_missing', message: `Форма ${item.action.formId} не має полів у цьому банері` });
    if (item.action?.type === 'copy_promo' && byId.get(item.action.promoElementId)?.type !== 'promo') diagnostics.push({ elementId: item.id, code: 'promo_target_missing', message: `Блок промокоду ${item.action.promoElementId} відсутній у цьому банері` });
  }
  return [...diagnostics,...productDiagnostics(document,products),...bindingDiagnostics(document,products)];
}

export function actionAvailability(document) {
  return { submit: document.elements.some((item) => item.type === 'field' || item.type === 'form' && item.content.fields.length),
    copy_promo: document.elements.some((item) => item.type === 'promo') };
}
