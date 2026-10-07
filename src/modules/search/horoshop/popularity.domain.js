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

export function normalizePopularitySearch(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('uk-UA');
}

function titleOf(titles, fallback = '') {
  const source = titles && typeof titles === 'object' ? titles : {};
  return String(source.uk || source.ua || source.ru || source.en || Object.values(source)[0] || fallback).trim();
}

export function resolvePopularityEntries(entries, products) {
  const byArticle = new Map();
  const byTitle = new Map();
  const add = (index, raw, product) => {
    const key = normalizePopularitySearch(raw);
    if (!key) return;
    const found = index.get(key) || new Map();
    found.set(product.id, product);
    index.set(key, found);
  };
  for (const product of products) {
    add(byArticle, product.sku, product);
    for (const title of Object.values(product.titles || {})) add(byTitle, title, product);
    for (const modification of product.modifications || []) {
      add(byArticle, modification.sku, product);
      for (const title of Object.values(modification.titles || {})) add(byTitle, title, product);
    }
  }
  const matched = [];
  const ambiguous = [];
  const unmatched = [];
  const seenInputs = new Set();
  const seenProducts = new Set();
  for (const raw of entries) {
    const input = String(raw ?? '').trim().replace(/\s+/gu, ' ');
    const key = normalizePopularitySearch(input);
    if (!key || seenInputs.has(key)) continue;
    seenInputs.add(key);
    const candidates = [...(byArticle.get(key) || byTitle.get(key) || new Map()).values()];
    if (!candidates.length) { unmatched.push(input); continue; }
    if (candidates.length > 1) {
      ambiguous.push({ input, candidates: candidates.map((product) => ({
        productId: product.id, sku: product.sku, title: titleOf(product.titles, product.sku)
      })) });
      continue;
    }
    const product = candidates[0];
    if (seenProducts.has(product.id)) continue;
    seenProducts.add(product.id);
    matched.push({ input, productId: product.id, sku: product.sku, title: titleOf(product.titles, product.sku) });
  }
  return { matched, ambiguous, unmatched };
}

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
