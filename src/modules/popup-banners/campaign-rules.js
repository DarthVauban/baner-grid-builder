import { z } from 'zod';

export const ruleFields = ['page', 'stock', 'product', 'sku', 'category', 'brand', 'sticker', 'condition', 'url', 'path'];
const condition = z.object({ kind: z.literal('condition'), field: z.enum(ruleFields), operator: z.enum(['is', 'is_not', 'contains']), values: z.array(z.string().trim().min(1).max(500)).min(1).max(100), descendants: z.boolean().default(false) }).superRefine((value, ctx) => {
  if (value.operator === 'contains' && !['url', 'path'].includes(value.field)) ctx.addIssue({ code: 'custom', message: 'Оператор «містить» підтримується лише для URL та шляху.' });
  if (value.field === 'stock' && value.values.some(v => !['available', 'out_of_stock', 'unknown'].includes(v))) ctx.addIssue({ code: 'custom', message: 'Некоректний стан наявності.' });
  if (value.field === 'page' && value.values.some(v => !['product', 'other'].includes(v))) ctx.addIssue({ code: 'custom', message: 'Некоректний тип сторінки.' });
});
const group = z.object({ kind: z.literal('group'), match: z.enum(['all', 'any']), children: z.array(z.lazy(() => z.union([condition, group]))).max(30) });
export const ruleGroupSchema = z.unknown().superRefine((value, ctx) => {
  const pending = [{ node: value, depth: 0 }]; let count = 0;
  while (pending.length) {
    const { node, depth } = pending.pop();
    if (++count > 100 || depth > 5) { ctx.addIssue({ code: 'custom', message: 'До 100 правил і 5 рівнів групування.' }); return; }
    if (depth > 0 && node?.kind === 'group' && !node.children?.length) { ctx.addIssue({ code: 'custom', message: 'Додайте умови до вкладеної групи або видаліть її.' }); return; }
    if (Array.isArray(node?.children)) pending.push(...node.children.map(child => ({ node: child, depth: depth + 1 })));
  }
}).pipe(group);
export const productReferenceSchema = z.object({ productExternalId: z.string().trim().min(1).max(300), modificationExternalId: z.string().max(300).nullable().default(null) });
export const collectionSchema = z.object({
  source: z.enum(['category', 'parent_category', 'selected_category', 'manual']).default('category'),
  categoryId: z.string().max(300).default(''), descendants: z.boolean().default(false),
  items: z.array(productReferenceSchema).max(12).default([]),
  excludeCurrent: z.boolean().default(true), brands: z.array(z.string().max(200)).max(100).default([]),
  excludedCategories: z.array(z.string().max(300)).max(100).default([]), excludedBrands: z.array(z.string().max(200)).max(100).default([]),
  excludedProducts: z.array(z.string().max(300)).max(100).default([]), conditions: z.array(z.string().max(200)).max(100).default([]),
  minPrice: z.number().min(0).nullable().default(null), maxPrice: z.number().min(0).nullable().default(null),
  sort: z.enum(['nearest_price', 'popular', 'price_asc', 'price_desc']).default('nearest_price'),
  limit: z.number().int().min(1).max(12).default(6), minimum: z.number().int().min(1).max(12).default(1),
  desktopColumns: z.number().int().min(1).max(4).default(3), mobileColumns: z.number().int().min(1).max(2).default(1),
  layout: z.enum(['grid', 'carousel']).default('grid')
}).refine(v => v.minimum <= v.limit, 'Мінімум не може перевищувати кількість товарів.').refine(v => v.minPrice == null || v.maxPrice == null || v.minPrice <= v.maxPrice, 'Некоректний діапазон цін.');

const fold = value => String(value || '').trim().toLocaleLowerCase('uk-UA');
export function categoryAncestors(id, categories) {
  const ids = []; const seen = new Set(); let current = id;
  while (current && !seen.has(current)) { seen.add(current); ids.push(current); current = categories.find(c => c.id === current)?.parentId; }
  return ids;
}
export function categoryOptions(rows) {
  const items = rows.map(row => ({ id: row.external_id, parentId: row.parent_external_id || '', title: typeof row.titles === 'string' ? row.titles : row.titles?.ua || row.titles?.uk || row.titles?.ru || Object.values(row.titles || {})[0] || row.external_id }));
  return items.map(item => ({ ...item, path: categoryAncestors(item.id, items).reverse().map(id => items.find(c => c.id === id)?.title || id).join(' / ') }));
}
// Unknown facts never satisfy a positive OR a negative product condition.
export function evaluateRules(root, context) {
  const traces = [];
  function visit(node, path) {
    if (node.kind === 'group') {
      const values = node.children.map((child, i) => visit(child, path + '.' + (i + 1)));
      const result = !values.length ? true : node.match === 'all' ? values.includes(false) ? false : values.includes(null) ? null : true : values.includes(true) ? true : values.includes(null) ? null : false;
      return result;
    }
    const p = context.product;
    const fields = { page: p ? 'product' : 'other', stock: p ? context.stockState || 'unknown' : null, product: p?.externalId, sku: p?.sku, category: node.descendants && p ? categoryAncestors(p.categoryId, context.categories || []) : p?.categoryId, brand: p?.brand, condition: p?.condition, sticker: p?.stickers?.flatMap(s => [s.id, s.title, s.id + ':' + s.title]), url: context.pageUrl, path: (() => { try { return new URL(context.pageUrl).pathname; } catch { return ''; } })() };
    const actual = fields[node.field];
    let result = null;
    if (actual != null && !(node.field === 'stock' && actual === 'unknown' && !node.values.includes('unknown'))) {
      const values = (Array.isArray(actual) ? actual : [actual]).map(fold);
      const matched = node.values.some(expected => values.some(v => node.operator === 'contains' ? v.includes(fold(expected)) : v === fold(expected)));
      result = node.operator === 'is_not' ? !matched : matched;
    }
    traces.push({ path, field: node.field, operator: node.operator, expected: node.values, actual: actual ?? null, result });
    return result;
  }
  return { result: visit(root, '1'), traces };
}
export function evaluateAudience(targeting, context) {
  const include = targeting.rules ? evaluateRules(targeting.rules, context) : { result: true, traces: [] };
  const exclude = targeting.exclusions?.children?.length ? evaluateRules(targeting.exclusions, context) : { result: false, traces: [] };
  return { eligible: include.result === true && exclude.result === false, include, exclude };
}
