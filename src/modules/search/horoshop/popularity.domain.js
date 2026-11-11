import { AppError } from '../../../lib/app-error.js';

export const maximumPopularitySelection = 5000;
export const popularityLimit = 1_000_000_000;

export function popularityNumber(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  if (!/^-?\d+$/u.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && Math.abs(number) <= popularityLimit ? number : null;
}

export function targetPopularity(before, action, value) {
  const target = action === 'reset' ? 0 : action === 'add' ? before + value : value;
  if (!Number.isSafeInteger(target) || Math.abs(target) > popularityLimit) {
    throw new AppError(422, 'HOROSHOP_POPULARITY_RANGE', 'Значення популярності виходить за допустимі межі.');
  }
  return target;
}

export { normalizeCatalogSearch as normalizePopularitySearch, resolveCatalogEntries as resolvePopularityEntries } from './catalog-selection.domain.js';

export function remotePopularityGroups(products) {
  const groups = new Map();
  for (const raw of products) {
    if (!raw || typeof raw !== 'object') continue;
    const article = String(raw.parent_article ?? raw.article ?? raw.sku ?? '').trim();
    if (!article) continue;
    const group = groups.get(article) || { articles: new Set(), values: new Set() };
    const variants = Array.isArray(raw.modifications) ? raw.modifications
      : Array.isArray(raw.variants) ? raw.variants : [];
    const offers = variants.length ? variants : [raw];
    for (const offer of offers) {
      const offerArticle = String(offer?.article ?? offer?.sku ?? '').trim();
      if (offerArticle) group.articles.add(offerArticle);
      if (offer?.popularity !== undefined && offer?.popularity !== null && String(offer.popularity).trim() !== '') {
        group.values.add(String(offer.popularity).trim());
      }
    }
    if (raw.popularity !== undefined && raw.popularity !== null && String(raw.popularity).trim() !== '') {
      group.values.add(String(raw.popularity).trim());
    }
    groups.set(article, group);
  }
  return new Map([...groups].map(([article, group]) => {
    const values = [...group.values].map(popularityNumber);
    return [article, {
      articles: [...group.articles].sort(),
      popularity: values.length === 0 ? 0 : values.length === 1 ? values[0] : null,
      inconsistent: values.some((value) => value === null) || new Set(values).size > 1
    }];
  }));
}

export function sameArticles(left, right) {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((item, index) => item === sortedRight[index]);
}
