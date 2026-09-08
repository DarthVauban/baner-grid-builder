import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAudience, ruleGroupSchema, categoryAncestors, collectionSchema } from '../src/modules/popup-banners/campaign-rules.js';
const condition = (field, values, operator = 'is', descendants = false) => ({ kind: 'condition', field, values, operator, descendants });
const group = (children, match = 'all') => ({ kind: 'group', match, children });
const context = { pageUrl: 'https://shop.test/phones/iphone/?utm_source=test', stockState: 'out_of_stock', categories: [{ id: 'phones', parentId: 'catalog' }, { id: 'catalog' }], product: { externalId: 'iphone', sku: 'IPHONE-BLACK', categoryId: 'phones', brand: 'Apple', condition: 'Новий', stickers: [{ id: 'sale', title: 'Акція' }] } };
test('nested conditions, category ancestry and explicit exclusions share deterministic tri-state semantics', () => {
  const targeting = { rules: group([condition('page', ['product']), condition('stock', ['out_of_stock']), condition('category', ['catalog'], 'is', true), group([condition('brand', ['Samsung']), condition('sticker', ['Акція'])], 'any')]) };
  assert.equal(evaluateAudience(targeting, context).eligible, true);
  assert.equal(evaluateAudience(targeting, { ...context, stockState: 'available' }).eligible, false);
  assert.equal(evaluateAudience(targeting, { ...context, stockState: 'unknown' }).include.result, null);
  assert.equal(evaluateAudience(targeting, { ...context, product: null }).eligible, false);
  assert.equal(evaluateAudience({ ...targeting, exclusions: group([condition('sku', ['iphone-black'])]) }, context).eligible, false);
  assert.equal(evaluateAudience({ rules: group([condition('brand', ['Samsung'], 'is_not')]) }, { ...context, product: null }).eligible, false);
  assert.equal(evaluateAudience({ exclusions: group([]) }, context).eligible, true);
});
test('URL conditions, cyclic categories and bounded untrusted rule trees', () => {
  assert.equal(evaluateAudience({ rules: group([condition('url', ['utm_source=test'], 'contains')]) }, context).eligible, true);
  assert.equal(evaluateAudience({ rules: group([condition('path', ['/phones/iphone/'])]) }, context).eligible, true);
  assert.deepEqual(categoryAncestors('a', [{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }]), ['a', 'b']);
  assert.throws(() => ruleGroupSchema.parse(group([condition('brand', ['Apple'], 'contains')])));
  assert.throws(() => ruleGroupSchema.parse(group([condition('stock', ['maybe'])])));
  let deep = group([]); for (let i = 0; i < 8; i++) deep = group([deep]);
  assert.throws(() => ruleGroupSchema.parse(deep));
  assert.throws(() => collectionSchema.parse({ minimum: 7, limit: 3 }));
  assert.throws(() => collectionSchema.parse({ minPrice: 100, maxPrice: 20 }));
});
