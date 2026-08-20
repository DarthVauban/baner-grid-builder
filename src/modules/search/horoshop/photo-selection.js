function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function normalizePhotoSelectionValue(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('uk-UA');
}

function localizedValues(value) {
  const source = objectValue(value);
  return [...new Set(Object.values(source)
    .map((item) => String(item || '').trim())
    .filter(Boolean))];
}

function displayTitle(titles, fallback) {
  const source = objectValue(titles);
  return String(source.uk || source.ua || source.ru || source.en || Object.values(source)[0] || fallback || '').trim();
}

function candidate({ product, modification = null }) {
  return {
    targetType: modification ? 'modification' : 'product',
    productId: product.id,
    modificationId: modification?.id || null,
    sku: modification?.sku || product.sku || '',
    title: modification
      ? displayTitle(modification.titles, modification.sku)
      : displayTitle(product.titles, product.sku),
    productTitle: displayTitle(product.titles, product.sku),
    imageUrl: modification?.image_url || product.primary_image_url || ''
  };
}

function pushIndex(index, key, value) {
  if (!key) return;
  const items = index.get(key) || [];
  if (!items.some((item) => item.productId === value.productId && item.modificationId === value.modificationId)) {
    items.push(value);
  }
  index.set(key, items);
}

function uniqueResult(items) {
  const result = [];
  const seen = new Set();
  for (const item of items || []) {
    const key = `${item.productId}:${item.modificationId || 'product'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function resolveHoroshopPhotoSelection(entries, catalog) {
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const modifications = Array.isArray(catalog?.modifications) ? catalog.modifications : [];
  const productsById = new Map(products.map((product) => [product.id, product]));
  const productSku = new Map();
  const modificationSku = new Map();
  const productTitle = new Map();
  const modificationTitle = new Map();

  for (const product of products) {
    const item = candidate({ product });
    pushIndex(productSku, normalizePhotoSelectionValue(product.sku), item);
    for (const title of localizedValues(product.titles)) {
      pushIndex(productTitle, normalizePhotoSelectionValue(title), item);
    }
  }

  for (const modification of modifications) {
    const product = productsById.get(modification.product_id);
    if (!product) continue;
    const item = candidate({ product, modification });
    pushIndex(modificationSku, normalizePhotoSelectionValue(modification.sku), item);
    const productTitles = localizedValues(product.titles);
    for (const title of localizedValues(modification.titles)) {
      pushIndex(modificationTitle, normalizePhotoSelectionValue(title), item);
      for (const parentTitle of productTitles) {
        const normalizedParent = normalizePhotoSelectionValue(parentTitle);
        const normalizedTitle = normalizePhotoSelectionValue(title);
        if (normalizedTitle && !normalizedTitle.includes(normalizedParent)) {
          pushIndex(modificationTitle, normalizePhotoSelectionValue(`${parentTitle} ${title}`), item);
        }
      }
    }
  }

  const matched = [];
  const ambiguous = [];
  const unmatched = [];
  const seenInput = new Set();
  const seenTargets = new Set();

  for (const rawEntry of entries || []) {
    const input = String(rawEntry || '').trim().replace(/\s+/gu, ' ');
    const normalized = normalizePhotoSelectionValue(input);
    if (!normalized || seenInput.has(normalized)) continue;
    seenInput.add(normalized);

    const tiers = [
      ['modification_sku', modificationSku.get(normalized)],
      ['product_sku', productSku.get(normalized)],
      ['product_title', productTitle.get(normalized)],
      ['modification_title', modificationTitle.get(normalized)]
    ];
    const tier = tiers.find(([, items]) => items?.length);
    if (!tier) {
      unmatched.push(input);
      continue;
    }
    const [matchedBy, rawCandidates] = tier;
    const candidates = uniqueResult(rawCandidates);
    if (candidates.length !== 1) {
      ambiguous.push({ input, candidates });
      continue;
    }
    const target = candidates[0];
    const targetKey = `${target.productId}:${target.modificationId || 'product'}`;
    if (seenTargets.has(targetKey)) continue;
    seenTargets.add(targetKey);
    matched.push({ input, matchedBy, targetKey, target });
  }

  return { matched, ambiguous, unmatched };
}
