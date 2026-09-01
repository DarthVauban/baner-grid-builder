function safeJson(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}

export function titleLabelsEmbedScript(config) {
  return `(() => {
  'use strict';
  const config = ${safeJson(config)};
  const runtimeKey = '__mtHoroshopTitleLabelsV1';
  const styleId = 'mt-horoshop-title-labels-v1';
  const marker = 'data-mt-title-label';
  const normalizeHost = (value) => String(value || '').trim().toLowerCase().replace(/^www\\./u, '');
  const normalizePath = (value) => {
    try {
      const url = new URL(value, window.location.href);
      if (normalizeHost(url.hostname) !== normalizeHost(config.storeDomain)) return '';
      const path = url.pathname.replace(/\\/{2,}/gu, '/').replace(/\\/+$/u, '') || '/';
      return path.toLowerCase();
    } catch { return ''; }
  };
  if (!config || !Array.isArray(config.labels) || normalizeHost(window.location.hostname) !== normalizeHost(config.storeDomain)) return;
  const previous = window[runtimeKey];
  if (previous && typeof previous.destroy === 'function') previous.destroy();
  const labels = new Map(config.labels.map((label) => [label.id, label]));
  const assignments = new Map();
  (config.assignments || []).forEach((group) => {
    if (!labels.has(group.labelId)) return;
    (group.paths || []).forEach((path) => {
      const normalized = normalizePath(path);
      if (!normalized) return;
      const current = assignments.get(normalized) || [];
      if (!current.includes(group.labelId)) current.push(group.labelId);
      assignments.set(normalized, current);
    });
  });
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = '[data-mt-title-label="v1"]{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;max-width:100%;margin:0 .42em .12em 0;padding:.2em .48em;border:1px solid var(--mt-label-border,var(--mt-label-bg));border-radius:var(--mt-label-radius,4px);background:var(--mt-label-bg,#202020);color:var(--mt-label-color,#ffe101);font:inherit;font-size:.72em;font-weight:800;line-height:1.15;letter-spacing:.01em;vertical-align:.12em;white-space:nowrap;text-decoration:none!important}[data-mt-label-surface="mobile-card"],[data-mt-label-surface="desktop-card"]{font-size:.68em}[data-mt-label-surface$="cart"]{font-size:.72em}';
    document.head.appendChild(style);
  }
  const makeLabel = (label, surface) => {
    const node = document.createElement('span');
    node.setAttribute(marker, 'v1');
    node.setAttribute('data-mt-label-id', label.id);
    node.setAttribute('data-mt-label-surface', surface);
    node.setAttribute('aria-label', label.text);
    node.style.setProperty('--mt-label-bg', label.backgroundColor);
    node.style.setProperty('--mt-label-color', label.textColor);
    node.style.setProperty('--mt-label-border', label.borderColor);
    node.style.setProperty('--mt-label-radius', String(label.borderRadius) + 'px');
    node.textContent = label.text;
    return node;
  };
  const ownLabels = (target) => Array.from(target.children || []).filter((child) => child.getAttribute && child.getAttribute(marker) === 'v1');
  const decorate = (target, href, surface) => {
    if (!target) return;
    const desired = (assignments.get(normalizePath(href)) || []).map((labelId) => labels.get(labelId)).filter(Boolean);
    const existing = ownLabels(target);
    const currentIds = existing.map((node) => node.getAttribute('data-mt-label-id'));
    const desiredIds = desired.map((label) => label.id);
    if (currentIds.length === desiredIds.length && currentIds.every((id, index) => id === desiredIds[index])) return;
    existing.forEach((node) => node.remove());
    if (!desired.length) return;
    const fragment = document.createDocumentFragment();
    desired.forEach((label) => fragment.appendChild(makeLabel(label, surface)));
    target.insertBefore(fragment, target.firstChild);
  };
  const pageAdapters = [
    { surface: 'desktop-product', selector: 'h1.product-title[itemprop="name"]' },
    { surface: 'mobile-product', selector: 'h1.heading.heading--xl[itemprop="name"]' }
  ];
  const collectionAdapters = [
    { surface: 'desktop-card', root: '.productsSlider-i', title: '.productsSlider-title .a-link, .productsSlider-title a', fallback: '.productsSlider-title', link: 'a[href]' },
    { surface: 'desktop-card', root: '.catalogCard, .productsList-item', title: '.catalogCard-title a, .productsList-title a', fallback: '.catalogCard-title, .productsList-title', link: 'a[href]' },
    { surface: 'desktop-cart', root: '.popup.__cart .cart-item.j-cart-product', title: '.cart-title', link: '.cart-title a[href], .cart-image a[href]' },
    { surface: 'mobile-card', root: '.catalog-card', title: '.catalog-card__title .link', fallback: '.catalog-card__title', link: '.catalog-card__link[href], a[href]' },
    { surface: 'mobile-cart', root: '#cart-drawer .cart__item.j-cart-product', title: '.cart-item__link', fallback: '.cart-item__title', link: '.cart-item__link[href], .cart-item__image a[href]' }
  ];
  let queued = false;
  const apply = () => {
    queued = false;
    const doc = window.document;
    if (!doc || !doc.documentElement) return;
    pageAdapters.forEach((adapter) => doc.querySelectorAll(adapter.selector).forEach((target) => decorate(target, window.location.href, adapter.surface)));
    collectionAdapters.forEach((adapter) => doc.querySelectorAll(adapter.root).forEach((root) => {
      const target = root.querySelector(adapter.title) || (adapter.fallback && root.querySelector(adapter.fallback));
      const link = root.querySelector(adapter.link);
      decorate(target, link && link.href, adapter.surface);
    }));
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    Promise.resolve().then(apply);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  window[runtimeKey] = {
    destroy() {
      observer.disconnect();
      window.removeEventListener('popstate', schedule);
      document.querySelectorAll('[' + marker + '="v1"]').forEach((node) => node.remove());
    }
  };
  apply();
})();`;
}
