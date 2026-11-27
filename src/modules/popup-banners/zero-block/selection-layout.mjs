import {boxFor,editableBox} from './responsive.mjs';
import {leafIds, selectionBounds, selectionRoots} from './layers.mjs';
import {editorLocked} from './button.mjs';

const position = (item, device) => boxFor(item,device);
const near = (a, b) => Math.abs(a - b) < .00001;

/** A selected group is a rigid object; explicit child selections remain independent. */
function objects(document, ids, device) {
  return selectionRoots(document, ids).map(id => {
    const leaves = leafIds(document, [id]);
    return {id, leaves, box: selectionBounds(document, [id], device), order: document.elements.findIndex(item => leaves.includes(item.id))};
  }).filter(item => item.box).sort((a, b) => a.order - b.order);
}

function locked(document, items) {
  const ids = new Set(items.flatMap(item => item.leaves));
  return document.elements.some(item => ids.has(item.id) && editorLocked(item));
}

/** Atomic translation: reject impossible geometry, never clamp individual participants. */
function translate(document, items, device, offsets) {
  if (locked(document, items)) return false;
  const moves = [];
  for (const item of items) {
    const offset = offsets.get(item.id);
    if (!offset) continue;
    for (const id of item.leaves) {
      const element = document.elements.find(part => part.id === id), box = position(element, device);
      const x = box.x + (offset.x || 0), y = box.y + (offset.y || 0);
      if (![x,y].every(value => Number.isFinite(value) && value >= -1000 - .00001 && value <= 3000 + .00001)) return false;
      if (!near(x, box.x) || !near(y, box.y)) moves.push({element, box, x, y});
    }
  }
  for (const {element, x, y} of moves) {
    const target = editableBox(element,device);
    target.x = Math.max(-1000, Math.min(3000, x)); target.y = Math.max(-1000, Math.min(3000, y));
  }
  return moves.length > 0;
}

export function alignSelection(document, ids, device, alignment) {
  if (!['left','center','right','top','middle','bottom'].includes(alignment)) return false;
  const items = objects(document, ids, device);
  if (!items.length) return false;
  const bounds = items.length === 1 ? {x:0,y:0,...document[device]} : selectionBounds(document, ids, device);
  const horizontal = ['left','center','right'].includes(alignment), axis = horizontal ? 'x' : 'y', dimension = horizontal ? 'width' : 'height';
  const factor = ['left','top'].includes(alignment) ? 0 : ['center','middle'].includes(alignment) ? .5 : 1;
  return translate(document, items, device, new Map(items.map(item => [item.id, {[axis]:bounds[axis] + (bounds[dimension] - item.box[dimension]) * factor - item.box[axis]}])));
}

/** Absolute visible bounds with a shared range that keeps every raw coordinate valid. */
export function selectionPosition(document, ids, device) {
  const items = objects(document, ids, device), bounds = selectionBounds(document, ids, device);
  if (!bounds) return null;
  const leaves = new Set(items.flatMap(item => item.leaves)), boxes = document.elements.filter(item => leaves.has(item.id)).map(item => position(item, device));
  const range = axis => ({value:bounds[axis],min:bounds[axis] + Math.max(...boxes.map(box => -1000 - box[axis])),max:bounds[axis] + Math.min(...boxes.map(box => 3000 - box[axis]))});
  return {x:range('x'),y:range('y'),disabled:locked(document, items)};
}

export function positionSelection(document, ids, device, axis, value) {
  if (!['x','y'].includes(axis) || !Number.isFinite(value)) return false;
  const model = selectionPosition(document, ids, device);
  if (!model || model.disabled || value < model[axis].min || value > model[axis].max) return false;
  const items = objects(document, ids, device), delta = value - model[axis].value;
  return translate(document, items, device, new Map(items.map(item => [item.id, {[axis]:delta}])));
}

/** Capture lane order and anchor once per gesture so negative gaps cannot reorder a drag. */
export function spacingPlan(document, ids, device, axis) {
  const items = objects(document, ids, device), cross = axis === 'x' ? 'y' : 'x', dimension = axis === 'x' ? 'width' : 'height', crossDimension = axis === 'x' ? 'height' : 'width';
  const lanes = [];
  for (const item of items.slice().sort((a,b) => a.box[cross] - b.box[cross] || a.box[axis] - b.box[axis] || a.order - b.order)) {
    const lane = lanes.find(parts => {
      const first = parts[0].box, box = item.box;
      return Math.min(first[cross] + first[crossDimension], box[cross] + box[crossDimension]) - Math.max(first[cross], box[cross]) >= Math.min(first[crossDimension], box[crossDimension]) / 2 - .00001;
    });
    if (lane) lane.push(item); else lanes.push([item]);
  }
  lanes.forEach(lane => lane.sort((a,b) => a.box[axis] - b.box[axis] || a.order - b.order));
  const start = items.length ? Math.min(...items.map(item => item.box[axis])) : 0, gaps = [];
  let min = -1000, max = 3000;
  for (const lane of lanes) {
    let distance = 0;
    lane.forEach((item, index) => {
      if (index) {
        const previous = lane[index - 1].box;
        gaps.push(item.box[axis] - previous[axis] - previous[dimension]);
      }
      for (const id of item.leaves) {
        const box = position(document.elements.find(part => part.id === id), device), base = box[axis] + start + distance - item.box[axis];
        if (index) { min = Math.max(min, (-1000 - base) / index); max = Math.min(max, (3000 - base) / index); }
      }
      distance += item.box[dimension];
    });
  }
  const value = gaps.length && gaps.every(gap => Math.abs(gap - gaps[0]) < .01) ? Math.round(gaps[0] * 100) / 100 : null;
  return {axis, device, items, lanes, start, dimension, value, min:Math.ceil(min * 100) / 100, max:Math.floor(max * 100) / 100, disabled:items.length < 2 || locked(document, items) || min > max};
}

export function spaceSelection(document, plan, gap) {
  if (plan.disabled || !Number.isFinite(gap) || gap < plan.min || gap > plan.max) return false;
  const offsets = new Map();
  for (const lane of plan.lanes) {
    let at = plan.start;
    for (const item of lane) { offsets.set(item.id, {[plan.axis]:at - item.box[plan.axis]}); at += item.box[plan.dimension] + gap; }
  }
  return translate(document, plan.items, plan.device, offsets);
}
