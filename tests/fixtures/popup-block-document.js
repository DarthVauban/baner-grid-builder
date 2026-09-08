import { validateDocument } from '../../src/modules/popup-banners/block-layout.schema.js';

export function blockNode(id, type, props = {}, children = [], style = {}, mobile = {}) {
  return { id, type, name: id, props, children, style, mobile };
}
export function blockDocument(children, overrides = {}) {
  return validateDocument({ version: 1, name: 'Block campaign', root: blockNode('root', 'container', {}, children, { widthMode: 'fixed', width: 640, background: '#ffffff', paddingTop: 30, paddingRight: 30, paddingBottom: 30, paddingLeft: 30, rowGap: 16 }, { width: 350, paddingLeft: 16, paddingRight: 16 }), ...overrides });
}
