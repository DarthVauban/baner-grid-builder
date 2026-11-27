import {boxFor,styleFor,POPUP_DEVICES} from './responsive.mjs';
import { leafIds, selectionBounds } from './layers.mjs';
import {editorLocked} from './button.mjs';
import {imageCorners} from './images.mjs';

const textTypes = new Set(['text', 'button', 'promo', 'field', 'form']);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Uniform scaling from an immutable gesture snapshot, in document coordinates. */
export function resizeGroup(before, groupId, device, handle, dx, dy, measure = () => ({ width: 16, height: 16 })) {
  if (!before.groups?.some(group => group.id === groupId) || !POPUP_DEVICES.includes(device) ||
      !['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].includes(handle) || !Number.isFinite(dx) || !Number.isFinite(dy)) return before;
  const ids = new Set(leafIds(before, [groupId])); const bounds = selectionBounds(before, [groupId], device);
  if (!bounds?.width || !bounds.height) return before;
  const horizontal = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
  const vertical = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
  const anchorX = bounds.x + bounds.width * (horizontal < 0 ? 1 : horizontal > 0 ? 0 : .5);
  const anchorY = bounds.y + bounds.height * (vertical < 0 ? 1 : vertical > 0 ? 0 : .5);
  const requested = 1 + (horizontal && vertical ?
    (horizontal * dx * bounds.width + vertical * dy * bounds.height) / (bounds.width ** 2 + bounds.height ** 2) :
    horizontal ? horizontal * dx / bounds.width : vertical * dy / bounds.height);
  const members = before.elements.filter(item => ids.has(item.id));
  if(members.some(editorLocked))return before;
  let lower = 0, upper = Infinity;
  function constrain(offset, coefficient, min, max) {
    if (!coefficient) return;
    const a = (min - offset) / coefficient, b = (max - offset) / coefficient;
    lower = Math.max(lower, Math.min(a, b)); upper = Math.min(upper, Math.max(a, b));
  }
  for (const item of members) {
    const box = boxFor(item,device);
    const font = styleFor(item,device).fontSize;
    const radius = styleFor(item,device).radius;
    constrain(anchorX, box.x - anchorX, -1000, 3000); constrain(anchorY, box.y - anchorY, -1000, 3000);
    const minimum=item.type==='shape'?1:16;
    constrain(0, box.width, minimum, 3000); constrain(0, box.height, minimum, 3000); constrain(0, box.scale || 1, .01, 100);
    if (textTypes.has(item.type)) constrain(0, font, 10, 120);
    if(item.type==='image'&&(item.style.corners||styleFor(item,device).corners))for(const corner of Object.values(imageCorners(item,device)))constrain(0,corner,0,999);
    else constrain(0, radius, 0, 999);
  }
  if (lower > upper) return before;
  const factor = clamp(requested, lower, upper);
  function candidate(scale) {
    if (Math.abs(scale - 1) < 1e-10) return before;
    const next = structuredClone(before);
    for (const item of next.elements.filter(item => ids.has(item.id))) {
      const source = members.find(member => member.id === item.id);
      const box = boxFor(source,device);
      const font = styleFor(source,device).fontSize;
      const radius = styleFor(source,device).radius;
      const scaled = { x: clamp(anchorX + (box.x - anchorX) * scale, -1000, 3000), y: clamp(anchorY + (box.y - anchorY) * scale, -1000, 3000),
        width: clamp(box.width * scale, item.type==='shape'?1:16, 3000), height: clamp(box.height * scale, item.type==='shape'?1:16, 3000), scale: clamp((box.scale || 1) * scale, .01, 100) };
      if (device === 'desktop') {
        // Freeze every inactive composition before changing the shared base metrics.
        for(const other of POPUP_DEVICES.filter(key=>key!=='desktop')){
          const prior=styleFor(source,other);item[other] ||= structuredClone(boxFor(source,other));
          item[other+'Style']={...source[other+'Style'],fontSize:prior.fontSize,radius:prior.radius};
          if(item.type==='image'&&(source.style.corners||prior.corners))item[other+'Style'].corners=imageCorners(source,other);
        }
        item.desktop = scaled;
        if (textTypes.has(item.type)) item.style.fontSize = clamp(font * scale, 10, 120);
        item.style.radius = clamp(radius * scale, 0, 999);
        if(item.type==='image'&&source.style.corners)item.style.corners=Object.fromEntries(Object.entries(imageCorners(source)).map(([key,value])=>[key,clamp(value*scale,0,999)]));
      } else {
        item[device] = scaled;
        item[device+'Style'] = { ...source[device+'Style'], fontSize: textTypes.has(item.type) ? clamp(font * scale, 10, 120) : font, radius: clamp(radius * scale, 0, 999) };
        if(item.type==='image'&&(source.style.corners||styleFor(source,device).corners))item[device+'Style'].corners=Object.fromEntries(Object.entries(imageCorners(source,device)).map(([key,value])=>[key,clamp(value*scale,0,999)]));
      }
    }
    return next;
  }
  function fits(next) {
    return next.elements.filter(item => ids.has(item.id) && item.type === 'button').every(item => {
      const box = boxFor(item,device); const min = measure(item, device);
      return box.width >= min.width && box.height >= min.height;
    });
  }
  let next = candidate(factor);
  if (fits(next)) return next;
  // Keep one factor for the entire group when fixed safe button padding binds.
  if (!fits(before)) return before;
  let valid = 1, invalid = factor;
  for (let i = 0; i < 40; i++) { const middle = (valid + invalid) / 2; if (fits(candidate(middle))) valid = middle; else invalid = middle; }
  next = candidate(valid); return next;
}
