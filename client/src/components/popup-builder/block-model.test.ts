import { describe, expect, it } from 'vitest';
import { blankDocument, duplicateBlock, effectiveStyle, findBlock, flatten, insertBlock, makeBlock, MAX_BLOCKS, MAX_DEPTH, moveBlock, removeBlock, validateDocument, wrapBlock } from './block-model';
import { createTemplate, templateLabels, type TemplateName } from './templates';

describe('nested popup block documents', () => {
  it('validates every starter composition and keeps empty mobile properties absent', () => {
    for (const name of Object.keys(templateLabels) as TemplateName[]) {
      const draft = createTemplate(name);
      expect(validateDocument(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    }
    const text = makeBlock('text');
    const draft = blankDocument();
    expect(validateDocument(insertBlock(draft, draft.root.id, text)).root.children[0].mobile).toEqual({});
  });
  it('inherits desktop styles and overrides only explicit mobile properties after a round trip', () => {
    const draft = blankDocument();
    const text = makeBlock('text'); text.style.fontSize = 30; text.style.color = '#123456'; text.mobile.fontSize = 22;
    const restored = validateDocument(JSON.parse(JSON.stringify(insertBlock(draft, draft.root.id, text))));
    const actual = findBlock(restored.root, text.id)!.node;
    expect(actual.mobile).toEqual({ fontSize: 22 });
    expect(effectiveStyle(actual, 'mobile')).toMatchObject({ fontSize: 22, color: '#123456' });
    expect(effectiveStyle({ ...actual, mobile: {} }, 'mobile').fontSize).toBe(30);
  });
  it('moves containers with descendants, handles same-parent indices and rejects cycles', () => {
    let draft = blankDocument();
    const row = makeBlock('container', 'row'); const column = makeBlock('container'); const one = makeBlock('text'); const two = makeBlock('button');
    row.children = [one, two]; draft.root.children = [row, column];
    draft = moveBlock(draft, one.id, row.id, 2);
    expect(findBlock(draft.root, row.id)!.node.children.map((node) => node.id)).toEqual([two.id, one.id]);
    draft = moveBlock(draft, row.id, column.id);
    expect(findBlock(draft.root, row.id)!.parent?.id).toBe(column.id);
    expect(findBlock(draft.root, one.id)!.depth).toBe(3);
    expect(() => moveBlock(draft, column.id, row.id)).toThrow(/нащадка/);
    expect(() => moveBlock(draft, row.id, row.id)).toThrow(/себе/);
    expect(() => moveBlock(draft, draft.root.id, column.id)).toThrow(/Кореневий/);
    expect(() => moveBlock(draft, one.id, two.id)).toThrow(/контейнер/);
  });
  it('duplicates a complete subtree with fresh IDs and independent styles', () => {
    const draft = blankDocument(); const product = makeBlock('product'); draft.root.children = [product];
    const result = duplicateBlock(draft, product.id);
    const copy = findBlock(result.document.root, result.id)!.node;
    const originalIds = new Set(flatten(product).map(({ node }) => node.id));
    expect(flatten(copy).every(({ node }) => !originalIds.has(node.id))).toBe(true);
    expect(copy.children).toHaveLength(product.children.length);
    copy.children[0].style.width = 999;
    expect(product.children[0].style.width).toBe(180);
  });
  it('wraps in responsive rows and removes an entire branch without mutating the original', () => {
    const draft = blankDocument(); const text = makeBlock('text'); draft.root.children = [text];
    const wrapped = wrapBlock(draft, text.id, 'row'); const wrapper = findBlock(wrapped.document.root, wrapped.id)!.node;
    expect(wrapper.children[0].id).toBe(text.id);
    expect(effectiveStyle(wrapper, 'desktop').direction).toBe('row');
    expect(effectiveStyle(wrapper, 'mobile').direction).toBe('column');
    expect(removeBlock(wrapped.document, wrapped.id).root.children).toEqual([]);
    expect(draft.root.children[0].id).toBe(text.id);
    expect(() => removeBlock(draft, draft.root.id)).toThrow();
  });
  it('protects form semantics during imports and reparenting', () => {
    const draft = blankDocument(); const form = makeBlock('form'); const container = makeBlock('container'); draft.root.children = [form, container];
    expect(() => moveBlock(draft, form.children[0].id, container.id)).toThrow(/всередині форми/);
    expect(() => insertBlock(draft, form.id, makeBlock('form'))).toThrow(/форму в іншу/);
    expect(() => insertBlock(draft, draft.root.id, makeBlock('field'))).toThrow(/всередині форми/);
    const nested = makeBlock('container'); nested.children = [makeBlock('field')];
    expect(() => insertBlock(draft, form.id, nested)).not.toThrow();
  });
  it('rejects duplicate IDs, unsupported versions and invalid style values', () => {
    const draft = blankDocument(); const text = makeBlock('text'); draft.root.children = [text, text];
    expect(() => validateDocument(draft)).toThrow(/унікальними/);
    expect(() => validateDocument({ ...blankDocument(), version: 2 })).toThrow();
    const invalid = blankDocument(); invalid.root.mobile.opacity = -1;
    expect(() => validateDocument(invalid)).toThrow();
    invalid.root.mobile = {}; invalid.root.children = [makeBlock('text')]; invalid.root.children[0].children = [makeBlock('text')];
    expect(() => validateDocument(invalid)).toThrow(/Вкладати/);
  });
  it('bounds imported depth and block count before recursive validation', () => {
    const deep = blankDocument(); let node = deep.root;
    for (let index = 0; index <= MAX_DEPTH; index++) { const child = makeBlock('container'); node.children = [child]; node = child; }
    expect(() => validateDocument(deep)).toThrow(/рівнів/);
    const wide = blankDocument(); wide.root.children = Array.from({ length: MAX_BLOCKS }, () => makeBlock('text'));
    expect(() => validateDocument(wide)).toThrow(/блоків/);
    wide.root.children.pop(); expect(flatten(validateDocument(wide).root)).toHaveLength(MAX_BLOCKS);
  });
});
