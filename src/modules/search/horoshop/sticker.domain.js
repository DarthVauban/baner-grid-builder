import { AppError } from '../../../lib/app-error.js';
import { normalizeHoroshopProducts, normalizeHoroshopStickers } from './catalog.normalizer.js';

export const maximumStickerSelection = 20_000;
export const textKey = (value) => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('uk-UA');
export const titleFor = (titles, fallback = '') => typeof titles === 'string' ? titles : titles?.uk || titles?.ua || titles?.ru || titles?.en || Object.values(titles || {})[0] || fallback;
export const stickerKey = (item) => item.id ? `id:${item.id}` : `title:${textKey(item.title)}`;
export const sameStickers = (a, b) => JSON.stringify(a.map(stickerKey).sort()) === JSON.stringify(b.map(stickerKey).sort());
export const sameMembership = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

export function applyStickerChange(before, add, remove) {
  const removed = new Set(remove);
  const result = before.filter((item) => !removed.has(item.id));
  for (const item of add) if (!result.some((existing) => stickerKey(existing) === stickerKey(item))) result.push(item);
  return result;
}

// Native automatic icons: new-by-age, discount, video, countdown, PrivatBank and monobank.
// The other native icons (hit, new and sale) and custom icons are assigned through product.icons.
const automaticStickerIds = new Set(['2', '5', '6', '7', '8', '9']);
export const manualStickerDirectory = (directory) => directory.filter((item) => !automaticStickerIds.has(item.externalId));

export function assertManualActions(addIds, removeIds, directory) {
  const allowed = new Set(manualStickerDirectory(directory).map((item) => item.externalId));
  const byId = new Map(directory.map((item) => [item.externalId, item]));
  if (!addIds.length && !removeIds.length) throw new AppError(422, 'STICKER_ACTION_EMPTY', 'Оберіть стікери для додавання або зняття.');
  for (const id of [...addIds, ...removeIds]) {
    if (!allowed.has(id) || !byId.has(id)) throw new AppError(409, 'STICKER_NOT_MANUAL', 'Стікер автоматичний або його вже немає в Хорошоп. Оновіть довідник.');
    if (addIds.includes(id) && (!byId.get(id).enabled || removeIds.includes(id))) {
      throw new AppError(422, 'STICKER_ACTION_INVALID', 'Вимкнений стікер не можна додати; той самий стікер не можна одночасно додати й зняти.');
    }
    const title = textKey(byId.get(id).title);
    if (directory.filter((item) => textKey(item.title) === title).length !== 1) {
      throw new AppError(409, 'STICKER_TITLE_AMBIGUOUS', 'У Хорошоп є стікери з однаковими назвами. Спочатку надайте їм унікальні назви.');
    }
  }
  return addIds.map((id) => ({ id, title: byId.get(id).title }));
}

export function filterStickerProducts(products, categories, filters = {}, manualIds = []) {
  const categoryIds = new Set(filters.category ? [filters.category] : []);
  if (filters.category && filters.includeChildren !== false) {
    let previous;
    do {
      previous = categoryIds.size;
      for (const category of categories) if (categoryIds.has(category.parentExternalId)) categoryIds.add(category.externalId);
    } while (previous !== categoryIds.size);
  }
  const manual = new Set(manualIds);
  return products.filter((product) => {
    const offers = [product, ...product.modifications];
    if (filters.search && !textKey([product.brand, ...offers.flatMap((offer) => [offer.sku, ...Object.values(offer.titles)])].join(' ')).includes(textKey(filters.search))) return false;
    if (categoryIds.size && !categoryIds.has(product.categoryExternalId)) return false;
    if (filters.brand && product.brand !== filters.brand) return false;
    if (filters.availability && !offers.some((offer) => offer.availability === filters.availability)) return false;
    if (filters.visibility === 'visible' && !product.visible) return false;
    if (filters.visibility === 'hidden' && product.visible && !product.modifications.some((offer) => !offer.visible)) return false;
    if (filters.priceMin !== undefined && !offers.some((offer) => offer.price !== null && Number(offer.price) >= filters.priceMin)) return false;
    if (filters.priceMax !== undefined && !offers.some((offer) => offer.price !== null && Number(offer.price) <= filters.priceMax)) return false;
    if ((filters.priceMin !== undefined || filters.priceMax !== undefined) && !offers.some((offer) => offer.price !== null
      && (filters.priceMin === undefined || Number(offer.price) >= filters.priceMin)
      && (filters.priceMax === undefined || Number(offer.price) <= filters.priceMax))) return false;
    const date = product.horoshopCreatedAt || '';
    if (filters.createdFrom && date.slice(0, 10) < filters.createdFrom) return false;
    if (filters.createdTo && date.slice(0, 10) > filters.createdTo) return false;
    const stickers = offers.flatMap((offer) => offer.stickers || []);
    if (filters.stickerMode === 'present' && !stickers.some((item) => item.id === filters.stickerId)) return false;
    if (filters.stickerMode === 'missing' && stickers.some((item) => item.id === filters.stickerId)) return false;
    if (filters.stickerMode === 'none' && stickers.some((item) => manual.has(item.id))) return false;
    return true;
  });
}

export function summarizeStickerSelection(products, directory) {
  const byId = new Map(directory.map((item) => [item.externalId, item]));
  const byTitle = new Map();
  for (const item of directory) {
    const key = textKey(item.title);
    byTitle.set(key, byTitle.has(key) ? null : item.externalId);
  }
  const counts = new Map();
  for (const product of products) {
    const present = new Set();
    for (const offer of [product, ...product.modifications]) for (const sticker of offer.stickers) {
      const id = byId.has(sticker.id) ? sticker.id : !sticker.id ? byTitle.get(textKey(sticker.title)) : null;
      if (id) present.add(id);
    }
    for (const id of present) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return { total: products.length, stickers: directory.filter((item) => counts.has(item.externalId))
    .map((item) => ({ ...item, productCount: counts.get(item.externalId) })) };
}

export function resolveStickerArticles(entries, products) {
  const index = new Map();
  for (const product of products) for (const sku of new Set([product.sku, ...product.modifications.map((m) => m.sku)])) {
    const key = textKey(sku);
    if (!index.has(key)) index.set(key, new Map());
    index.get(key).set(product.id, product);
  }
  const productIds = new Set();
  const seen = new Set();
  const unmatched = [];
  const ambiguous = [];
  let duplicates = 0;
  for (const entry of entries) {
    const key = textKey(entry);
    if (!key) continue;
    if (seen.has(key)) { duplicates += 1; continue; }
    seen.add(key);
    const candidates = [...(index.get(key)?.values() || [])];
    if (!candidates.length) unmatched.push(entry);
    else if (candidates.length > 1) ambiguous.push({ input: entry, candidates: candidates.map((p) => ({ id: p.id, sku: p.sku, title: titleFor(p.titles, p.sku) })) });
    else if (productIds.has(candidates[0].id)) duplicates += 1;
    else productIds.add(candidates[0].id);
  }
  return { productIds: [...productIds], unmatched, ambiguous, duplicates };
}

function readIcons(value, directory) {
  if (value === undefined || value === null) throw new Error('Хорошоп не повернув поточні стікери товару.');
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(';').filter(Boolean) : [value];
  const result = new Map();
  for (const value of values) {
    const object = value && typeof value === 'object' ? value : {};
    const primitive = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    const explicitId = String(object.id ?? object.icon_id ?? object.external_id ?? '');
    const resolvedTitle = titleFor(object.title, object.name ?? primitive);
    const candidates = directory.filter((item) => textKey(item.title) === textKey(resolvedTitle));
    if (candidates.length > 1) throw new Error('Назва поточного стікера неоднозначна. Надайте стікерам унікальні назви в Хорошоп.');
    const found = directory.find((item) => item.externalId === (explicitId || primitive)) || candidates[0];
    const title = found?.title || titleFor(object.title, object.title ?? object.name ?? primitive);
    if (!title || typeof title !== 'string' || (explicitId && !found) || (/^\d+$/u.test(primitive) && !found)) throw new Error('Не вдалося визначити назву поточного стікера. Оновіть довідник Хорошоп.');
    const sticker = { id: found?.externalId || explicitId, title };
    result.set(stickerKey(sticker), sticker);
  }
  return [...result.values()];
}

export function remoteStickerSnapshot(rawProducts, rawDirectory, domain) {
  const directory = normalizeHoroshopStickers(rawDirectory);
  const products = normalizeHoroshopProducts(rawProducts, domain, directory);
  const groups = new Map();
  for (const product of products) {
    let error = '';
    let stickers = [];
    const stickerSets = [];
    let inconsistent = false;
    const sources = [product.source, ...product.modifications.map((item) => item.source)];
    const source = sources.find((item) => Object.hasOwn(item, 'icons') || Object.hasOwn(item, 'stickers'));
    try {
      if (!source) throw new Error('Хорошоп не повернув поле стікерів. Операцію заблоковано.');
      stickers = readIcons(source.icons ?? source.stickers, directory);
      for (const candidate of sources) if (Object.hasOwn(candidate, 'icons') || Object.hasOwn(candidate, 'stickers')) {
        stickerSets.push(readIcons(candidate.icons ?? candidate.stickers, directory));
      }
      inconsistent = stickerSets.some((set) => !sameStickers(stickers, set));
      if (inconsistent) error = 'Стікери модифікацій відрізняються. Спочатку виправте групу в Хорошоп.';
    } catch (reason) { error = reason.message; }
    const membership = [...new Set(product.modifications.map((item) => item.sku))].sort();
    // An actual exported offer article avoids creating a synthetic parent on import.
    const article = product.modifications[0]?.sku || product.source.article || product.sku;
    groups.set(product.externalId, { article, stickers, membership, error, inconsistent, stickerSets });
  }
  return { directory, groups };
}
