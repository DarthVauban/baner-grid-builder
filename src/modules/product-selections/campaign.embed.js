/* global document, location, history, window, requestAnimationFrame, cancelAnimationFrame */
export { campaignStyles } from './campaign.styles.js';

/**
 * Serialized into the public storefront script. The shared card handles Horoshop's native cart.
 * @param {HTMLScriptElement} script
 * @param {{id: string, revision: number, name: string, sections: Array<{id: string, name: string, count: number, brands: string[]}>}} campaign
 * @param {(product: object, imagePriority?: string) => HTMLElement} createCard
 */
export function mountCampaign(script, campaign, createCard) {
  const key = 'mt-section-' + campaign.id;
  const brandKey = 'mt-brand-' + campaign.id;
  if (document.getElementById(key)) return;
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function campaignElement(tag, part, text) {
    return element(tag, 'mt-campaign__' + part, text);
  }
  function brandsFor(names) {
    const brands = new Map();
    for (const name of names) {
      const normalized = name.trim().toLowerCase();
      if (normalized && !brands.has(normalized)) brands.set(normalized, name.trim());
    }
    return new Map([...brands].sort((a, b) => a[1].localeCompare(b[1], 'uk')));
  }
  const sections = campaign.sections.map((section) => ({ ...section, brands: brandsFor(section.brands || []) }));
  const all = { id: '', name: 'Усі товари', count: sections.reduce((sum, section) => sum + section.count, 0),
    brands: brandsFor(campaign.sections.flatMap((section) => section.brands || [])) };
  const groups = new Map([all, ...sections].map((group) => [group.id, group]));
  const root = element('section', 'mt-product-selection mt-campaign');
  root.id = key;
  if (script.parentNode === document.head) document.body.append(root);
  else script.after(root);

  const body = campaignElement('div', 'body');
  const sidebar = campaignElement('aside', 'sidebar');
  const mast = campaignElement('div', 'mast');
  const name = element('h2');
  const words = campaign.name.trim().split(/\s+/u);
  const accent = words.pop();
  if (words.length) name.append(words.join(' ') + ' ');
  name.append(element('span', '', accent));
  mast.append(name);
  sidebar.append(mast);
  body.append(sidebar);
  root.append(body);
  if (!sections.length) {
    body.append(element('p', '', 'Наразі в цій акції немає товарів.'));
    return;
  }

  const nav = campaignElement('nav', 'nav');
  nav.setAttribute('aria-label', 'Категорії акції');
  const mobile = campaignElement('label', 'mobile', 'Категорії');
  const select = element('select');
  mobile.append(select);
  sidebar.append(campaignElement('div', 'catlabel', 'Категорії'), nav, mobile);
  const content = campaignElement('div', 'catalog');
  const top = campaignElement('div', 'top');
  const heading = campaignElement('h3', 'title');
  const count = campaignElement('span', 'count');
  top.append(heading, count);
  const chips = campaignElement('div', 'brands');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'Бренди');
  const grid = element('div', 'mt-product-selection__grid');
  const skeletons = campaignElement('div', 'skeletons');
  skeletons.setAttribute('aria-hidden', 'true');
  skeletons.hidden = true;
  const status = campaignElement('p', 'status');
  status.setAttribute('role', 'status');
  const more = campaignElement('button', 'more', 'Показати ще');
  more.type = 'button';
  content.append(top, chips, status, grid, skeletons, more);
  body.append(content);

  let active = all;
  let selected = new Set();
  let nextCursor = 0;
  let controller;
  let stale = false;
  let pageCount = 0;
  // Only recent pages of this campaign revision are retained. Reusing the actual
  // cards also retains their images and native-cart button state on a return visit.
  const pages = new Map();
  const pending = new Map();
  let intentTimer;
  let chipGroup;
  function urlFor(group, brands) {
    const url = new URL(location.href);
    if (group.id) url.searchParams.set(key, group.id);
    else url.searchParams.delete(key);
    url.searchParams.delete(brandKey);
    for (const brand of brands) if (group.brands.has(brand)) url.searchParams.append(brandKey, brand);
    return url;
  }
  function rememberPosition() {
    history.replaceState({ ...history.state, [key]: { revision: campaign.revision, section: active.id,
      brands: [...selected], pages: pageCount, scroll: window.scrollY } }, '');
  }
  function navigate(group, brands) {
    const url = urlFor(group, brands);
    if (url.href === location.href) return;
    rememberPosition();
    history.pushState({ ...history.state, [key]: null }, '', url);
    if (group !== active && root.getBoundingClientRect().top < 0) root.scrollIntoView({ block: 'start' });
    void display();
  }
  for (const group of groups.values()) {
    const link = element('a', '', group.name);
    link.dataset.section = group.id;
    link.append(element('small', '', String(group.count)));
    link.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(group, selected);
    });
    nav.append(link);
    const option = element('option', '', group.name + ' (' + group.count + ')');
    option.value = group.id;
    select.append(option);
  }
  select.onchange = () => navigate(groups.get(select.value), selected);

  function showChips() {
    if (chipGroup !== active) {
      const focused = chips.contains(document.activeElement) ? document.activeElement.dataset.brand : undefined;
      const buttons = [];
      for (const [brand, label] of [['', 'Усі бренди'], ...active.brands]) {
        const button = campaignElement('button', 'chip', label);
        button.type = 'button';
        button.dataset.brand = brand;
        buttons.push(button);
      }
      chips.replaceChildren(...buttons);
      chips.hidden = !active.brands.size;
      chipGroup = active;
      if (focused !== undefined) buttons.find((button) => button.dataset.brand === focused)?.focus({ preventScroll: true });
    }
    for (const button of chips.children) {
      const brand = button.dataset.brand;
      button.setAttribute('aria-pressed', String(brand ? selected.has(brand) : !selected.size));
    }
  }
  function toggledBrands(brand) {
    const brands = new Set(selected);
    if (!brand) brands.clear();
    else if (brands.has(brand)) brands.delete(brand);
    else brands.add(brand);
    return brands;
  }
  chips.onclick = (event) => {
    const button = event.target.closest('button[data-brand]');
    if (button) navigate(active, toggledBrands(button.dataset.brand));
  };

  function campaignCard(product, priority) {
    const card = createCard(product, priority);
    const image = card.querySelector('img');
    if (!image.complete) {
      const media = image.parentElement;
      media.classList.add('mt-campaign__photo-pending');
      const finish = () => {
        media.classList.remove('mt-campaign__photo-pending');
        image.removeEventListener('load', finish);
        image.removeEventListener('error', finish);
      };
      image.addEventListener('load', finish);
      image.addEventListener('error', finish);
    }
    const detail = [product.brand, product.article].filter(Boolean).join(' · ');
    if (detail) card.append(campaignElement('div', 'meta', detail));
    const footer = campaignElement('div', 'foot');
    footer.append(card.querySelector('.mt-product-selection__price'), card.querySelector('.mt-product-selection__buy'));
    card.append(footer);
    return card;
  }
  function productsUrl(group, brands, cursor) {
    const url = new URL('products', script.src);
    url.searchParams.set('revision', String(campaign.revision));
    url.searchParams.set('cursor', String(cursor));
    if (group.id) url.searchParams.set('section', group.id);
    for (const brand of [...brands].sort()) if (group.brands.has(brand)) url.searchParams.append('brand', brand);
    return url.href;
  }
  function cachedPage(url) {
    const page = pages.get(url);
    if (!page) return;
    pages.delete(url);
    if (page.expires > Date.now()) {
      pages.set(url, page);
      return page;
    }
  }
  function requestPage(url) {
    const cached = cachedPage(url);
    if (cached) return Promise.resolve(cached);
    if (pending.has(url)) return pending.get(url).promise;
    const request = new AbortController();
    const promise = fetch(url, { signal: request.signal, credentials: 'omit' }).then(async (response) => {
      if (!response.ok) throw Object.assign(new Error('Campaign page request failed'), { status: response.status });
      const { data } = await response.json();
      const page = { data, expires: Date.now() + 60_000 };
      if (!request.signal.aborted) {
        pages.set(url, page);
        if (pages.size > 12) pages.delete(pages.keys().next().value);
      }
      return page;
    }).finally(() => {
      if (pending.get(url)?.request === request) pending.delete(url);
    });
    pending.set(url, { request, promise });
    return promise;
  }

  function prepareCards(page, columns, speculative) {
    if (!page.cards) {
      page.cards = page.data.products.map((product, index) => {
        let priority;
        if (index < columns) priority = speculative ? 'low' : 'high';
        else if (!speculative && index < columns * 2) priority = 'auto';
        return campaignCard(product, priority);
      });
    } else if (!speculative) {
      for (const [index, card] of page.cards.slice(0, columns * 2).entries()) {
        const image = card.querySelector('img');
        image.fetchPriority = index < columns ? 'high' : 'auto';
        image.loading = 'eager';
      }
    }
    return page.cards;
  }
  function columnsInGrid() {
    return window.getComputedStyle(grid.hidden ? skeletons : grid).gridTemplateColumns.split(' ').length;
  }
  function showSkeletons(first) {
    const size = Math.min(active.count, columnsInGrid() * 2);
    if (skeletons.childElementCount !== size) {
      const cards = Array.from({ length: size }, () => {
        const placeholder = campaignElement('div', 'skeleton');
        placeholder.append(element('div', 'mt-product-selection__media'), campaignElement('div', 'skeleton-lines'),
          campaignElement('div', 'skeleton-foot'));
        return placeholder;
      });
      skeletons.replaceChildren(...cards);
    }
    grid.hidden = first;
    skeletons.hidden = false;
    status.classList.add('mt-campaign__status-loading');
    status.textContent = 'Завантажуємо товари…';
  }
  function warmSelection(event) {
    clearTimeout(intentTimer);
    if (window.navigator.connection?.saveData) return;
    const link = event.target.closest('a[data-section]');
    const chip = event.target.closest('button[data-brand]');
    if (!link && !chip) return;
    const group = link ? groups.get(link.dataset.section) : active;
    const brands = chip ? toggledBrands(chip.dataset.brand) : selected;
    const url = productsUrl(group, brands, 0);
    if (url === productsUrl(active, selected, 0)) return;
    const warm = async () => {
      if (pending.size) return;
      try {
        const page = await requestPage(url);
        prepareCards(page, columnsInGrid(), true);
      } catch { /* A click can retry a speculative request. */ }
    };
    if (event.type === 'pointerover') intentTimer = setTimeout(warm, 60);
    else void warm();
  }
  for (const menu of [nav, chips]) {
    menu.addEventListener('pointerover', warmSelection);
    menu.addEventListener('focusin', warmSelection);
    menu.addEventListener('pointerdown', warmSelection);
    menu.addEventListener('pointerleave', () => clearTimeout(intentTimer));
  }

  async function loadPage(signal) {
    const first = pageCount === 0;
    const url = productsUrl(active, selected, nextCursor);
    more.disabled = true;
    grid.setAttribute('aria-busy', 'true');
    status.textContent = '';
    // Cached pages commit in the same turn, before a placeholder can be painted.
    const frame = requestAnimationFrame(() => { if (!signal.aborted) showSkeletons(first); });
    try {
      const page = await requestPage(url);
      if (signal.aborted) return false;
      const columns = columnsInGrid();
      const cards = prepareCards(page, columns, false);
      if (first) {
        grid.replaceChildren(...cards);
        count.textContent = String(active.count);
        count.hidden = Boolean(selected.size);
      } else {
        grid.append(...cards);
      }
      if (typeof page.data.total === 'number') {
        count.textContent = String(page.data.total);
        count.hidden = false;
      }
      pageCount += 1;
      nextCursor = page.data.nextCursor;
      status.textContent = grid.childElementCount || nextCursor !== null ? '' : 'Товарів не знайдено.';
      more.textContent = 'Показати ще';
      more.hidden = nextCursor === null;
      return true;
    } catch (error) {
      if (signal.aborted) return false;
      stale = error.status === 409 || error.status === 404;
      if (stale) pages.clear();
      status.textContent = stale ? 'Склад акції змінився.' : 'Не вдалося завантажити товари.';
      if (first && grid.childElementCount) {
        status.textContent += ' Показано попередні результати.';
        count.hidden = true;
      }
      more.hidden = false;
      more.textContent = stale ? 'Оновити сторінку' : 'Спробувати ще';
      return false;
    } finally {
      cancelAnimationFrame(frame);
      if (!signal.aborted) {
        grid.hidden = false;
        skeletons.hidden = true;
        status.classList.remove('mt-campaign__status-loading');
        more.disabled = false;
        grid.setAttribute('aria-busy', 'false');
      }
    }
  }
  async function display() {
    clearTimeout(intentTimer);
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const url = new URL(location.href);
    const params = url.searchParams;
    const legacySearchKey = 'mt-q-' + campaign.id;
    if (params.has(legacySearchKey)) {
      params.delete(legacySearchKey);
      history.replaceState({ ...history.state, [key]: null }, '', url);
    }
    active = groups.get(params.get(key)) || all;
    selected = new Set(params.getAll(brandKey).map((brand) => brand.toLowerCase()).filter((brand) => active.brands.has(brand)));
    select.value = active.id;
    const firstUrl = productsUrl(active, selected, 0);
    for (const [url, entry] of pending) {
      if (url !== firstUrl) {
        pending.delete(url);
        entry.request.abort();
      }
    }
    heading.textContent = active.name;
    count.textContent = String(active.count);
    count.hidden = Boolean(selected.size);
    for (const link of nav.children) {
      const group = groups.get(link.dataset.section);
      link.setAttribute('aria-current', String(group === active));
      link.href = urlFor(group, selected);
    }
    showChips();
    nextCursor = 0;
    stale = false;
    pageCount = 0;
    more.hidden = true;
    const saved = history.state?.[key];
    const restore = saved?.section === active.id && saved.revision === campaign.revision
      && JSON.stringify(saved.brands || []) === JSON.stringify([...selected]) ? saved : null;
    do {
      if (!await loadPage(signal)) return;
    } while (nextCursor !== null && (restore ? pageCount < restore.pages : cachedPage(productsUrl(active, selected, nextCursor))));
    if (restore) requestAnimationFrame(() => { if (!signal.aborted) window.scrollTo(0, restore.scroll); });
  }
  grid.addEventListener('click', (event) => {
    if (event.target.closest('a')) rememberPosition();
  });
  more.onclick = () => { if (stale) location.reload(); else void loadPage(controller.signal); };
  window.addEventListener('popstate', display);
  void display();
}
