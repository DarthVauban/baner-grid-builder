import {hasProductBindings} from './product-bindings.mjs';
import { createPopupDocument, validatePopupStructure } from './document.mjs';
import {POPUP_DEVICES} from './responsive.mjs';
import { layerIndex, leafIds, selectionRoots } from './layers.mjs';

const FORMAT = 'kramkin-layers';
const MAX_TEXT = 1_000_000;

/** A detached, minimal document fragment. No unselected content or display rules. */
export function copyLayers(document, ids) {
  const selected = selectionRoots(document, ids);
  if (!selected.length) return null;
  const leaves = new Set(leafIds(document, selected));
  const { nodes } = layerIndex(document), groups = [];
  function visit(id) { const node = nodes.get(id); if (node?.children) { groups.push(node); node.children.forEach(visit); } }
  selected.forEach(visit);
  const elements = document.elements.filter(item => leaves.has(item.id));
  const forms = new Set(elements.filter(item => item.type === 'field' || item.type === 'form').map(item => item.content.formId));
  const fragment = createPopupDocument(document.shopId, document.widgetId, 'Буфер шарів');
  fragment.elements = elements;
  if(document.productId&&hasProductBindings(fragment))fragment.productId=document.productId;
  if (groups.length) fragment.groups = groups;
  fragment.forms = document.forms.filter(form => forms.has(form.id));
  return structuredClone(fragment);
}

export function serializeLayers(fragment) {
  return JSON.stringify({ format: FORMAT, version: 1, fragment });
}

export function parseLayers(text, shopId) {
  if (typeof text !== 'string' || text.length > MAX_TEXT) throw new Error('Завеликий буфер шарів');
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error('Буфер не містить шарів KramKin'); }
  if (!payload || payload.format !== FORMAT || payload.version !== 1 || Object.keys(payload).some(key => !['format','version','fragment'].includes(key))) throw new Error('Буфер не містить підтримуваних шарів KramKin');
  try { validatePopupStructure(payload.fragment); } catch { throw new Error('Пошкоджений буфер шарів'); }
  if (payload.fragment.shopId !== shopId) throw new Error('Можна вставляти шари лише з цього магазину');
  if (!payload.fragment.elements.length) throw new Error('У буфері немає шарів');
  return payload.fragment;
}

/** Atomic root insertion; neither the source snapshot nor the target is mutated. */
export function pasteLayers(document, fragment, offset = 20) {
  validatePopupStructure(fragment);
  if (fragment.shopId !== document.shopId) throw new Error('Можна вставляти шари лише з цього магазину');
  if(fragment.productId&&fragment.productId!==document.productId)throw new Error('Спершу прив’яжіть той самий товар до банера для вставки цих шарів');
  if (!fragment.elements.length || !Number.isFinite(offset)) throw new Error('У буфері немає шарів');
  if (document.elements.length + fragment.elements.length > 100) throw new Error('Вставка перевищить межу 100 елементів');
  if ((document.groups?.length || 0) + (fragment.groups?.length || 0) > 50) throw new Error('Вставка перевищить межу 50 груп');
  if (document.forms.length + fragment.forms.length > 20) throw new Error('Вставка перевищить межу 20 форм');
  const next = structuredClone(document), copied = structuredClone(fragment);
  const occupied = new Set([...document.elements, ...(document.groups || []), ...document.forms, ...fragment.elements, ...(fragment.groups || []), ...fragment.forms].map(node => node.id));
  const idMap = new Map();
  const mint = id => { let fresh; do { fresh = crypto.randomUUID(); } while (occupied.has(fresh)); occupied.add(fresh); idMap.set(id, fresh); return fresh; };
  const roots = layerIndex(copied).roots;
  for (const item of [...copied.elements, ...(copied.groups || []), ...copied.forms]) mint(item.id);
  // One offset for all explicit boxes also preserves inherited compositions.
  const boxes = copied.elements.flatMap(item => POPUP_DEVICES.map(device=>item[device])).filter(Boolean);
  const shiftX = Math.max(-1000 - Math.min(...boxes.map(box => box.x)), Math.min(offset, 3000 - Math.max(...boxes.map(box => box.x))));
  const shiftY = Math.max(-1000 - Math.min(...boxes.map(box => box.y)), Math.min(offset, 3000 - Math.max(...boxes.map(box => box.y))));
  for (const box of boxes) { box.x += shiftX; box.y += shiftY; }
  for (const item of copied.elements) {
    item.id = idMap.get(item.id);
    if (item.type === 'field' || item.type === 'form') item.content.formId = idMap.get(item.content.formId) || item.content.formId;
    if (item.type === 'form') {
      const fieldIds=new Map(),optionIds=new Map();
      for(const field of item.content.fields){const id=crypto.randomUUID();fieldIds.set(field.id,id);field.id=id;for(const option of field.options||[]){const id=crypto.randomUUID();optionIds.set(option.id,id);option.id=id;}}
      if(item.content.flow)for(const step of item.content.flow.steps){step.id=crypto.randomUUID();step.fieldIds=step.fieldIds.map(id=>fieldIds.get(id)||id);}
      for(const field of item.content.fields){if(Array.isArray(field.defaultValue))field.defaultValue=field.defaultValue.map(id=>optionIds.get(id)||id);else if(['radio','checkbox'].includes(field.type)&&field.defaultValue)field.defaultValue=optionIds.get(field.defaultValue)||field.defaultValue;for(const rule of field.visibility?.rules||[]){rule.fieldId=fieldIds.get(rule.fieldId)||rule.fieldId;if(optionIds.has(rule.value))rule.value=optionIds.get(rule.value);}}
    }
    if (item.action?.type === 'copy_promo') item.action.promoElementId = idMap.get(item.action.promoElementId) || item.action.promoElementId;
    if (item.action?.type === 'submit') item.action.formId = idMap.get(item.action.formId) || item.action.formId;
  }
  for (const group of copied.groups || []) { group.id = idMap.get(group.id); group.children = group.children.map(id => idMap.get(id)); }
  for (const form of copied.forms) form.id = idMap.get(form.id);
  next.elements.push(...copied.elements);
  if (copied.groups?.length) next.groups = [...(next.groups || []), ...copied.groups];
  next.forms.push(...copied.forms);
  validatePopupStructure(next);
  return { document: next, ids: roots.map(id => idMap.get(id)) };
}
