export const maximumFeedSelection = 5000;
export const feedNames = Object.freeze({ google: 'Google Feed for Merchant Center', facebook: 'Facebook Feed' });

// Missing/unsupported data is unknown, never an empty selection.
export function marketplaceNames(value) {
  const entries = typeof value === 'string' ? value.split(';') : Array.isArray(value) ? value : null;
  if (!entries) return null;
  const names = [];
  for (const entry of entries) {
    const name = typeof entry === 'string' ? entry : entry?.value ?? entry?.title ?? entry?.name;
    if (typeof name !== 'string' || name.includes(';')) return null;
    if (name.trim()) names.push(name.trim());
  }
  return [...new Set(names)].sort();
}

export function targetMarketplaces(before, action) {
  if (before === null) return null;
  const names = new Set(before);
  for (const [channel, name] of Object.entries(feedNames)) {
    if (action[channel] === 'enable') names.add(name);
    if (action[channel] === 'disable') names.delete(name);
  }
  return [...names].sort();
}

export function matchesKnownFeedSnapshot(before, current) {
  const known = before.filter((offer) => offer.marketplaces !== null);
  return sameFeedSnapshot(known, current.filter((offer) => known.some((item) => item.article === offer.article)));
}

export function sameFeedSnapshot(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const byArticle = new Map(right.map((item) => [item.article, item.marketplaces]));
  return left.every((item) => {
    const other = byArticle.get(item.article);
    return Array.isArray(item.marketplaces) && Array.isArray(other)
      && JSON.stringify([...item.marketplaces].sort()) === JSON.stringify([...other].sort());
  });
}

export function remoteFeedGroups(products) {
  const groups = new Map();
  const owners = new Map();
  for (const raw of products) {
    const article = String(raw?.parent_article ?? raw?.article ?? raw?.sku ?? '').trim();
    if (!article) continue;
    const group = groups.get(article) || { offers: new Map(), invalid: false };
    const variants = Array.isArray(raw.modifications) ? raw.modifications
      : Array.isArray(raw.variants) ? raw.variants : [];
    for (const offer of variants.length ? variants : [raw]) {
      if (!offer || typeof offer !== 'object') { group.invalid = true; continue; }
      const sku = String(offer?.article ?? offer?.sku ?? '').trim();
      const value = Object.hasOwn(offer, 'export_to_marketplace')
        ? offer.export_to_marketplace : raw.export_to_marketplace;
      const marketplaces = marketplaceNames(value);
      if (!sku || marketplaces === null || group.offers.has(sku)) group.invalid = true;
      if (owners.has(sku) && owners.get(sku) !== article) {
        group.invalid = true;
        groups.get(owners.get(sku)).invalid = true;
      }
      owners.set(sku, article);
      group.offers.set(sku, marketplaces);
    }
    groups.set(article, group);
  }
  return new Map([...groups].map(([article, group]) => [article, {
    invalid: group.invalid,
    offers: [...group.offers].sort(([a], [b]) => a.localeCompare(b))
      .map(([sku, marketplaces]) => ({ article: sku, marketplaces }))
  }]));
}

export function feedState(offers, channel) {
  if (!offers.length || offers.some((offer) => offer.marketplaces === null)) return 'unknown';
  const enabled = offers.filter((offer) => offer.marketplaces.includes(feedNames[channel])).length;
  return enabled === offers.length ? 'enabled' : enabled === 0 ? 'disabled' : 'mixed';
}
