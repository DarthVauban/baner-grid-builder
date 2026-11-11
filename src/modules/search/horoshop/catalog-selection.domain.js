export function normalizeCatalogSearch(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('uk-UA');
}

function normalizeCatalogTitle(value) {
  return normalizeCatalogSearch(value).replace(/[^\p{L}\p{N}+]+/gu, ' ').trim().replace(/\s+/gu, ' ');
}

function titleOf(titles, fallback = '') {
  const source = titles && typeof titles === 'object' ? titles : {};
  return String(source.uk || source.ua || source.ru || source.en || Object.values(source)[0] || fallback).trim();
}

export function resolveCatalogEntries(entries, products) {
  const byArticle = new Map();
  const byTitle = new Map();
  const add = (index, raw, product, normalize = normalizeCatalogSearch) => {
    const key = normalize(raw);
    if (!key) return;
    const found = index.get(key) || new Map();
    found.set(product.id, product);
    index.set(key, found);
  };
  for (const product of products) {
    add(byArticle, product.sku, product);
    const parentTitles = Object.values(product.titles || {});
    for (const title of parentTitles) add(byTitle, title, product, normalizeCatalogTitle);
    for (const modification of product.modifications || []) {
      add(byArticle, modification.sku, product);
      for (const title of Object.values(modification.titles || {})) {
        add(byTitle, title, product, normalizeCatalogTitle);
        for (const parentTitle of parentTitles) {
          const parentKey = normalizeCatalogTitle(parentTitle);
          const modificationKey = normalizeCatalogTitle(title);
          if (parentKey && modificationKey && !modificationKey.includes(parentKey)) {
            add(byTitle, `${parentTitle} ${title}`, product, normalizeCatalogTitle);
          }
        }
      }
    }
  }
  const matched = [];
  const ambiguous = [];
  const unmatched = [];
  const seenInputs = new Set();
  const seenProducts = new Set();
  for (const raw of entries) {
    const input = String(raw ?? '').trim().replace(/\s+/gu, ' ');
    const key = normalizeCatalogSearch(input);
    if (!key || seenInputs.has(key)) continue;
    seenInputs.add(key);
    const titleKey = normalizeCatalogTitle(input);
    let candidates = [...(byArticle.get(key) || byTitle.get(titleKey) || new Map()).values()];
    if (!candidates.length && titleKey.length >= 8 && titleKey.includes(' ')) {
      const partial = new Map();
      for (const [storedTitle, matches] of byTitle) {
        if (!storedTitle.startsWith(`${titleKey} `) && !storedTitle.includes(` ${titleKey} `)
          && !storedTitle.endsWith(` ${titleKey}`)) continue;
        for (const [id, product] of matches) partial.set(id, product);
      }
      candidates = [...partial.values()];
    }
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
