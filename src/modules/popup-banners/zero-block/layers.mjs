import {boxFor} from './responsive.mjs';
import {rotatedShapeBounds,shapeValues} from './shape.mjs';
import {textValues} from './text.mjs';
import {buttonValues} from './button.mjs';
/** Groups are editor metadata. Rendering still uses the canonical flat elements array. */
export function layerIndex(document) {
  const nodes = new Map(document.elements.map(item => [item.id, item]));
  const parents = new Map();
  for (const group of document.groups || []) { nodes.set(group.id, group); for (const id of group.children) parents.set(id, group.id); }
  const roots = [];
  for (const item of document.elements) {
    let id = item.id; while (parents.has(id)) id = parents.get(id);
    if (!roots.includes(id)) roots.push(id);
  }
  return { nodes, parents, roots };
}

export function leafIds(document, ids) {
  const { nodes } = layerIndex(document); const result = new Set();
  function visit(id) { const node = nodes.get(id); if (!node) return; if (node.children) node.children.forEach(visit); else result.add(id); }
  ids.forEach(visit); return document.elements.filter(item => result.has(item.id)).map(item => item.id);
}

export function selectionRoots(document, ids) {
  const { nodes, parents } = layerIndex(document); const selected = new Set(ids.filter(id => nodes.has(id)));
  return [...selected].filter(id => { let parent = parents.get(id); while (parent) { if (selected.has(parent)) return false; parent = parents.get(parent); } return true; });
}

/** Shift drills into a selected ancestor, then toggles individual canvas members. */
export function selectCanvasMember(document, ids, id, toggle = true) {
  const {nodes, parents} = layerIndex(document), selected = selectionRoots(document, ids);
  if (!nodes.has(id) || nodes.get(id).children) return selected;
  let ancestor = parents.get(id);
  while (ancestor) {
    if (selected.includes(ancestor)) return selected.map(key => key === ancestor ? id : key);
    ancestor = parents.get(ancestor);
  }
  return selected.includes(id) ? (toggle ? selected.filter(key => key !== id) : selected) : [...selected, id];
}

export function canvasLayer(document, id) {
  const { parents } = layerIndex(document); while (parents.has(id)) id = parents.get(id); return id;
}

function canonicalize(document, roots) {
  const { nodes } = layerIndex(document); const elements = [];
  function visit(id) { const node = nodes.get(id); if (node?.children) node.children.forEach(visit); else if (node) elements.push(node); }
  roots.forEach(visit); document.elements = elements;
  // Empty ancestors can arise when the last member is moved or removed.
  let changed = true;
  while (changed) {
    const empty = new Set((document.groups || []).filter(group => !group.children.length).map(group => group.id));
    changed = !!empty.size;
    if (changed) { document.groups = document.groups.filter(group => !empty.has(group.id)); for (const group of document.groups) group.children = group.children.filter(id => !empty.has(id)); }
  }
  if (document.groups?.length === 0) delete document.groups;
}

/** index is a visible (front-to-back) insertion index, after removing the source. */
export function moveLayer(document, id, parentId, index) {
  const { nodes, parents, roots } = layerIndex(document); if (!nodes.has(id)) return;
  const oldParent = parents.get(id) || null;
  if (parentId !== null && !nodes.get(parentId)?.children) return;
  let ancestor = parentId;
  while (ancestor) { if (ancestor === id) return; ancestor = parents.get(ancestor); }
  const oldSiblings = oldParent ? nodes.get(oldParent).children : roots;
  oldSiblings.splice(oldSiblings.indexOf(id), 1);
  const siblings = parentId ? nodes.get(parentId).children : roots;
  const at = Math.max(0, Math.min(siblings.length, siblings.length - index));
  siblings.splice(at, 0, id); canonicalize(document, roots);
}

export function groupLayers(document, ids, id = crypto.randomUUID()) {
  const selection = selectionRoots(document, ids);
  if (selection.length < 2 || (document.groups?.length || 0) >= 50) return null;
  const { nodes, parents, roots } = layerIndex(document);
  const chains = selection.map(key => { const chain = [null]; let parent = parents.get(key); while (parent) { chain.push(parent); parent = parents.get(parent); } return chain; });
  const parent = chains[0].slice().reverse().find(key => chains.every(chain => chain.includes(key))) || null;
  const siblings = parent ? nodes.get(parent).children : roots;
  const selectedLeaves = new Set(leafIds(document, selection));
  const ordered = selection.slice().sort((a, b) => document.elements.findIndex(item => leafIds(document, [a]).includes(item.id)) - document.elements.findIndex(item => leafIds(document, [b]).includes(item.id)));
  const topBranch = siblings.filter(key => leafIds(document, [key]).some(leaf => selectedLeaves.has(leaf))).at(-1);
  let insertion = siblings.indexOf(topBranch) + 1;
  for (const key of selection) {
    const owner = parents.get(key); const list = owner ? nodes.get(owner).children : roots;
    const at = list.indexOf(key); if (list === siblings && at < insertion) insertion--;
    list.splice(at, 1);
  }
  const group = { id, name: 'Група', children: ordered };
  document.groups = [...(document.groups || []), group];
  siblings.splice(insertion, 0, id);
  canonicalize(document, roots);
  return id;
}

export function ungroupLayers(document, ids) {
  if (leafIds(document, ids).length < 2) return ids;
  const { nodes, parents, roots } = layerIndex(document);
  const groups = selectionRoots(document, ids).filter(id => nodes.get(id)?.children);
  // Explicitly selected child layers can also be detached from their group.
  if (!groups.length) {
    const chosen = selectionRoots(document, ids); const output = [];
    for (const id of chosen) {
      const parent = parents.get(id); if (!parent) { output.push(id); continue; }
      const group = nodes.get(parent); group.children = group.children.filter(key => key !== id);
      const grand = parents.get(parent); const siblings = grand ? nodes.get(grand).children : roots;
      siblings.splice(siblings.indexOf(parent) + 1, 0, id); output.push(id);
    }
    canonicalize(document, roots); return output;
  }
  const output = [];
  for (const id of selectionRoots(document, ids)) {
    const group = nodes.get(id); if (!group?.children) { output.push(id); continue; }
    const parent = parents.get(id); const siblings = parent ? nodes.get(parent).children : roots;
    siblings.splice(siblings.indexOf(id), 1, ...group.children); output.push(...group.children);
  }
  document.groups = document.groups.filter(group => !groups.includes(group.id)); canonicalize(document, roots); return output;
}

export function removeLayers(document, ids) {
  const leaves = new Set(leafIds(document, ids)); const removed = new Set(ids);
  const { nodes } = layerIndex(document);
  function mark(id) { removed.add(id); nodes.get(id)?.children?.forEach(mark); }
  ids.forEach(mark);
  const roots = layerIndex(document).roots.filter(id => !removed.has(id));
  document.elements = document.elements.filter(item => !leaves.has(item.id));
  if (document.groups) { document.groups = document.groups.filter(group => !removed.has(group.id)); for (const group of document.groups) group.children = group.children.filter(id => !removed.has(id)); }
  canonicalize(document, roots);
}

export function selectionBounds(document, ids, device) {
  const leaves = new Set(leafIds(document, ids)); const boxes = document.elements.filter(item => leaves.has(item.id)).map(item => {const box=boxFor(item,device);return item.type==='shape'?rotatedShapeBounds(box,shapeValues(item.content,device).rotation):item.type==='text'?rotatedShapeBounds(box,textValues(item.content,device).rotation):item.type==='button'?rotatedShapeBounds(box,buttonValues(item.content,device).rotation):box;});
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map(box => box.x)), y = Math.min(...boxes.map(box => box.y));
  return { x, y, width: Math.max(...boxes.map(box => box.x + box.width)) - x, height: Math.max(...boxes.map(box => box.y + box.height)) - y };
}
