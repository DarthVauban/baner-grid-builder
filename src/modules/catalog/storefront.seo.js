const htmlEntities = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => htmlEntities[character]);
}

function absoluteUrl(value, origin) {
  const source = String(value || '').trim();
  if (!source) return '';
  try {
    return new URL(source, `${String(origin || '').replace(/\/$/, '')}/`).toString();
  } catch {
    return source;
  }
}

function schemaAvailability(status) {
  if (status === 'in_stock') return 'https://schema.org/InStock';
  if (status === 'incoming') return 'https://schema.org/PreOrder';
  return 'https://schema.org/OutOfStock';
}

function schemaCondition(condition) {
  return condition === 'REFURBISHED'
    ? 'https://schema.org/RefurbishedCondition'
    : 'https://schema.org/UsedCondition';
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export function storefrontSeoData(product, { origin = '', preview = false } = {}) {
  const title = String(product.seoTitle || product.name || 'Mobile Trend — смартфони').trim();
  const description = String(product.seoDescription || product.shortDescription || product.name || '').trim();
  const socialDescription = String(product.socialDescription || description).trim();
  const canonicalUrl = absoluteUrl(product.publicPath || `/storefront/smartphones/${encodeURIComponent(product.slug || '')}`, origin);
  const imageUrl = absoluteUrl(product.mainImageUrl, origin);
  const gallery = [product.mainImageUrl, ...(product.gallery || []).map((item) => item.url)]
    .map((url) => absoluteUrl(url, origin))
    .filter(Boolean);
  const additionalProperty = (product.characteristics?.items || [])
    .filter((item) => item.displayValue)
    .map((item) => ({
      '@type': 'PropertyValue',
      name: item.label,
      propertyID: item.key,
      value: item.displayValue,
      unitText: item.unit || undefined
    }));

  return {
    title,
    description,
    socialDescription,
    canonicalUrl,
    imageUrl,
    robots: preview ? 'noindex, nofollow' : 'index, follow, max-image-preview:large',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      sku: product.productCode,
      image: gallery,
      description,
      brand: product.brand?.label ? { '@type': 'Brand', name: product.brand.label } : undefined,
      itemCondition: schemaCondition(product.condition),
      additionalProperty,
      offers: {
        '@type': 'Offer',
        url: canonicalUrl,
        priceCurrency: 'UAH',
        price: Number(product.priceUah || 0),
        availability: schemaAvailability(product.availability?.status),
        itemCondition: schemaCondition(product.condition)
      }
    }
  };
}

function metaTag(attribute, key, content) {
  return `<meta ${attribute}="${escapeHtml(key)}" content="${escapeHtml(content)}" data-storefront-seo="server" />`;
}

export function injectStorefrontProductSeo(html, product, options = {}) {
  const seo = storefrontSeoData(product, options);
  const titleTag = `<title>${escapeHtml(seo.title)}</title>`;
  const descriptionTag = metaTag('name', 'description', seo.description);
  const tags = [
    metaTag('name', 'robots', seo.robots),
    `<link rel="canonical" href="${escapeHtml(seo.canonicalUrl)}" data-storefront-seo="server" />`,
    metaTag('property', 'og:locale', 'uk_UA'),
    metaTag('property', 'og:type', 'product'),
    metaTag('property', 'og:site_name', 'Mobile Trend'),
    metaTag('property', 'og:title', seo.title),
    metaTag('property', 'og:description', seo.socialDescription),
    metaTag('property', 'og:url', seo.canonicalUrl),
    seo.imageUrl ? metaTag('property', 'og:image', seo.imageUrl) : '',
    seo.imageUrl ? metaTag('property', 'og:image:alt', product.name) : '',
    metaTag('property', 'product:price:amount', String(Number(product.priceUah || 0))),
    metaTag('property', 'product:price:currency', 'UAH'),
    metaTag('name', 'twitter:card', seo.imageUrl ? 'summary_large_image' : 'summary'),
    metaTag('name', 'twitter:title', seo.title),
    metaTag('name', 'twitter:description', seo.socialDescription),
    seo.imageUrl ? metaTag('name', 'twitter:image', seo.imageUrl) : '',
    `<script type="application/ld+json" data-storefront-seo="server">${safeJson(seo.structuredData)}</script>`
  ].filter(Boolean).join('\n    ');

  let result = String(html || '');
  result = /<title(?:\s[^>]*)?>[\s\S]*?<\/title>/i.test(result)
    ? result.replace(/<title(?:\s[^>]*)?>[\s\S]*?<\/title>/i, titleTag)
    : result;
  result = /<meta\s+name=["']description["'][^>]*>/i.test(result)
    ? result.replace(/<meta\s+name=["']description["'][^>]*>/i, descriptionTag)
    : result;
  return result.replace(/<\/head>/i, `    ${tags}\n  </head>`);
}
