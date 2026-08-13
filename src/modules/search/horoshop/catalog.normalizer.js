function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringValue(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function localizedStringValue(value, depth = 0) {
  const direct = stringValue(value);
  if (direct) return direct;
  if (depth > 3) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = localizedStringValue(item, depth + 1);
      if (candidate) return candidate;
    }
    return null;
  }
  const source = record(value);
  for (const key of ['uk', 'ua', 'ru', 'en', 'title', 'name', 'label', 'value', 'status']) {
    const candidate = localizedStringValue(source[key], depth + 1);
    if (candidate) return candidate;
  }
  return null;
}

function numericStockValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && /^-?\d+(?:[.,]\d+)?$/u.test(value.trim())) {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return null;
}

function stockQuantities(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return [];
  const direct = numericStockValue(value);
  if (direct !== null) return [direct];
  if (Array.isArray(value)) return value.flatMap((item) => stockQuantities(item, depth + 1));
  const source = record(value);
  const quantityKeys = [
    'quantity', 'qty', 'count', 'stock', 'available_quantity', 'available',
    'balance', 'residue', 'amount', 'value'
  ];
  const explicit = quantityKeys.flatMap((key) =>
    Object.hasOwn(source, key) ? stockQuantities(source[key], depth + 1) : []);
  if (explicit.length > 0) return explicit;
  for (const key of ['warehouses', 'items', 'stocks', 'residues', 'data']) {
    if (!Object.hasOwn(source, key)) continue;
    const nested = stockQuantities(source[key], depth + 1);
    if (nested.length > 0) return nested;
  }
  const entries = Object.entries(source);
  if (entries.length > 0 && entries.every(([key, item]) =>
    /^\d+$/u.test(key) && numericStockValue(item) !== null)) {
    return entries.flatMap(([, item]) => stockQuantities(item, depth + 1));
  }
  return [];
}

function availabilityValue(source) {
  for (const statusSource of [source.presence, source.availability]) {
    const status = localizedStringValue(statusSource);
    if (status) return status;
  }
  for (const stockSource of [source.residues, source.quantity, source.stock_quantity, source.stock]) {
    const quantities = stockQuantities(stockSource);
    if (quantities.length === 0) continue;
    return quantities.some((quantity) => quantity > 0) ? 'В наявності' : 'Немає в наявності';
  }
  return null;
}

function booleanValue(value, fallback = true) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

export function normalizeLocalizedText(value) {
  if (typeof value === 'string' && value.trim()) return { uk: value.trim() };
  const source = record(value);
  return Object.fromEntries(Object.entries(source)
    .map(([locale, text]) => [locale === 'ua' ? 'uk' : locale, stringValue(text)])
    .filter((entry) => entry[1] !== null));
}

function normalizedHttpsUrl(candidate, storeDomain, requireStoreHost) {
  try {
    const base = new URL(`https://${storeDomain}/`);
    const url = new URL(candidate, base);
    if (url.protocol !== 'https:' || url.username || url.password
      || (requireStoreHost && url.hostname.toLowerCase() !== base.hostname.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function firstImage(source, storeDomain) {
  const candidates = [];
  const direct = stringValue(source.image ?? source.image_url ?? source.main_image);
  if (direct) candidates.push(direct);
  for (const collection of [source.images, source.gallery_common]) {
    if (!Array.isArray(collection)) continue;
    for (const item of collection) {
      const candidate = stringValue(item) ?? stringValue(record(item).url ?? record(item).src);
      if (candidate) candidates.push(candidate);
    }
  }
  for (const candidate of candidates) {
    const url = normalizedHttpsUrl(candidate, storeDomain, false);
    if (url) return url;
  }
  return null;
}

function pageUrl(source, storeDomain) {
  const explicit = stringValue(source.url) ?? stringValue(source.link);
  const slug = stringValue(source.slug) ?? stringValue(source.alias);
  const canonical = stringValue(source.canonical_url);
  for (const candidate of [explicit, slug ? `${slug.replace(/^\/+|\/+$/gu, '')}/` : null, canonical]) {
    if (!candidate) continue;
    const url = normalizedHttpsUrl(candidate, storeDomain, true);
    if (url) return url;
  }
  return null;
}

export function normalizeHoroshopCategories(items, storeDomain) {
  return items.flatMap((item) => {
    const source = record(item);
    const externalId = stringValue(source.id ?? source.external_id);
    if (!externalId) return [];
    return [{
      externalId,
      parentExternalId: stringValue(record(source.parent).id ?? source.parent_id ?? source.parent),
      titles: normalizeLocalizedText(source.title),
      imageUrl: firstImage(source, storeDomain),
      canonicalUrl: pageUrl(source, storeDomain),
      source
    }];
  });
}

function normalizeModification(source, fallbackSku, productExternalId, inheritedAvailability, storeDomain, inheritedPageUrl) {
  const sku = stringValue(source.article ?? source.sku) ?? fallbackSku;
  const offerIdentity = stringValue(source.article ?? source.sku ?? source.external_id ?? source.id) ?? fallbackSku;
  if (!sku || !offerIdentity) return null;
  return {
    externalId: `${productExternalId}:${offerIdentity}`,
    sku,
    titles: normalizeLocalizedText(source.mod_title ?? source.title),
    price: stringValue(source.price),
    oldPrice: stringValue(source.price_old ?? source.old_price),
    currency: stringValue(source.currency),
    availability: availabilityValue(source) ?? inheritedAvailability,
    visible: booleanValue(source.display_in_showcase ?? source.visible),
    imageUrl: firstImage(source, storeDomain),
    pageUrl: pageUrl(source, storeDomain) ?? inheritedPageUrl,
    attributes: record(source.characteristics ?? source.attributes),
    source
  };
}

export function normalizeHoroshopProducts(items, storeDomain) {
  const groups = new Map();
  for (const item of items) {
    const source = record(item);
    const externalId = stringValue(
      source.id ?? source.external_id ?? source.parent_article ?? source.article ?? source.sku
    );
    const sku = stringValue(source.parent_article ?? source.article ?? source.sku);
    if (!externalId || !sku) continue;

    let group = groups.get(externalId);
    if (!group) {
      const parent = record(source.parent);
      const canonicalUrl = pageUrl(source, storeDomain);
      group = {
        base: {
          externalId,
          parentExternalId: stringValue(source.parent_article),
          sku,
          titles: normalizeLocalizedText(source.title),
          descriptions: normalizeLocalizedText(source.description ?? source.short_description),
          brand: stringValue(source.brand),
          categoryExternalId: stringValue(parent.id ?? source.parent_id),
          price: stringValue(source.price),
          oldPrice: stringValue(source.price_old ?? source.old_price),
          currency: stringValue(source.currency),
          availability: availabilityValue(source),
          visible: booleanValue(source.display_in_showcase ?? source.visible),
          canonicalUrl,
          popularity: stringValue(source.popularity),
          characteristics: record(source.characteristics),
          source
        },
        primaryImageUrl: firstImage(source, storeDomain),
        modifications: new Map()
      };
      groups.set(externalId, group);
    } else if (!group.primaryImageUrl) {
      group.primaryImageUrl = firstImage(source, storeDomain);
    }

    const sourceModifications = Array.isArray(source.modifications)
      ? source.modifications
      : Array.isArray(source.variants) ? source.variants : [];
    const modificationSources = sourceModifications.length > 0 ? sourceModifications : [source];
    const inheritedAvailability = availabilityValue(source) ?? group.base.availability;
    for (const modificationSource of modificationSources) {
      const modification = normalizeModification(
        record(modificationSource), sku, externalId, inheritedAvailability, storeDomain, group.base.canonicalUrl
      );
      if (!modification) continue;
      group.modifications.set(modification.externalId, modification);
      if (!group.primaryImageUrl && modification.imageUrl) group.primaryImageUrl = modification.imageUrl;
    }
  }

  return [...groups.values()].map((group) => {
    const modifications = [...group.modifications.values()];
    const availability = group.base.availability
      ?? modifications.find((modification) => modification.availability)?.availability
      ?? null;
    return {
      ...group.base,
      availability,
      primaryImageUrl: group.primaryImageUrl,
      modifications: modifications.map((modification) => ({
        ...modification,
        availability: modification.availability ?? availability
      }))
    };
  });
}
