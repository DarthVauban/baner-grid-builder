/* global document, location, history, window, requestAnimationFrame */
export { campaignStyles } from './campaign.styles.js';

/**
 * Serialized into the public storefront script. The shared card handles Horoshop's native cart.
 * @param {HTMLScriptElement} script
 * @param {{id: string, revision: number, name: string, sections: Array<{id: string, name: string, count: number, brands: string[]}>}} campaign
 * @param {(product: object) => HTMLElement} createCard
 */
export function mountCampaign(script, campaign, createCard) {
  const key = 'mt-section-' + campaign.id;
  const brandKey = 'mt-brand-' + campaign.id;
  const queryKey = 'mt-q-' + campaign.id;
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
  const searchLabel = campaignElement('label', 'search');
  const search = element('input');
  search.type = 'search';
  search.maxLength = 200;
  search.placeholder = 'Пошук у добірці';
  search.setAttribute('aria-label', search.placeholder);
  searchLabel.append(search);
  top.append(heading, count, searchLabel);
  const chips = campaignElement('div', 'brands');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'Бренди');
  const grid = element('div', 'mt-product-selection__grid');
  const status = campaignElement('p', 'status');
  status.setAttribute('role', 'status');
  const more = campaignElement('button', 'more', 'Показати ще');
  more.type = 'button';
  content.append(top, chips, grid, status, more);
  body.append(content);

  let active = all;
  let selected = new Set();
  let query = '';
  let timer;
  let nextCursor = 0;
  let controller;
  let stale = false;
  let pageCount = 0;
  function urlFor(group, brands, term) {
    const url = new URL(location.href);
    if (group.id) url.searchParams.set(key, group.id);
    else url.searchParams.delete(key);
    url.searchParams.delete(brandKey);
    for (const brand of brands) if (group.brands.has(brand)) url.searchParams.append(brandKey, brand);
    if (term) url.searchParams.set(queryKey, term);
    else url.searchParams.delete(queryKey);
    return url;
  }
  function rememberPosition() {
    history.replaceState({ ...history.state, [key]: { revision: campaign.revision, section: active.id,
      brands: [...selected], query, pages: pageCount, scroll: window.scrollY } }, '');
  }
  function navigate(group, brands, term, replace = false) {
    clearTimeout(timer);
    const url = urlFor(group, brands, term.trim());
    if (url.href === location.href) return;
    if (!replace) rememberPosition();
    history[replace ? 'replaceState' : 'pushState']({ ...history.state, [key]: null }, '', url);
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
      navigate(group, selected, search.value);
    });
    nav.append(link);
    const option = element('option', '', group.name + ' (' + group.count + ')');
    option.value = group.id;
    select.append(option);
  }
  select.onchange = () => navigate(groups.get(select.value), selected, search.value);
  search.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => navigate(active, selected, search.value, Boolean(query)), 220);
  };

  function showChips() {
    const focused = chips.contains(document.activeElement) ? document.activeElement.dataset.brand : undefined;
    const buttons = [];
    for (const [brand, label] of [['', 'Усі бренди'], ...active.brands]) {
      const button = campaignElement('button', 'chip', label);
      button.type = 'button';
      button.dataset.brand = brand;
      button.setAttribute('aria-pressed', String(brand ? selected.has(brand) : !selected.size));
      buttons.push(button);
    }
    chips.replaceChildren(...buttons);
    chips.hidden = !active.brands.size;
    if (focused !== undefined) buttons.find((button) => button.dataset.brand === focused)?.focus({ preventScroll: true });
  }
  chips.onclick = (event) => {
    const button = event.target.closest('button[data-brand]');
    if (!button) return;
    const brand = button.dataset.brand;
    const brands = new Set(selected);
    if (!brand) brands.clear();
    else if (brands.has(brand)) brands.delete(brand);
    else brands.add(brand);
    navigate(active, brands, search.value);
  };

  function campaignCard(product) {
    const card = createCard(product);
    const detail = [product.brand, product.article].filter(Boolean).join(' · ');
    if (detail) card.append(campaignElement('div', 'meta', detail));
    const footer = campaignElement('div', 'foot');
    footer.append(card.querySelector('.mt-product-selection__price'), card.querySelector('.mt-product-selection__buy'));
    card.append(footer);
    return card;
  }
  async function loadPage(signal) {
    const url = new URL('products', script.src);
    url.searchParams.set('revision', String(campaign.revision));
    url.searchParams.set('cursor', String(nextCursor));
    if (active.id) url.searchParams.set('section', active.id);
    for (const brand of selected) url.searchParams.append('brand', brand);
    if (query) url.searchParams.set('q', query);
    more.disabled = true;
    status.textContent = 'Завантажуємо товари…';
    try {
      const response = await fetch(url, { signal, credentials: 'omit' });
      if (signal.aborted) return false;
      if (!response.ok) {
        stale = response.status === 409 || response.status === 404;
        throw new Error();
      }
      /** @type {{data: {products: object[], nextCursor: number | null, total?: number}}} */
      const { data } = await response.json();
      if (signal.aborted) return false;
      if (typeof data.total === 'number') {
        count.textContent = String(data.total);
        count.hidden = false;
      }
      grid.append(...data.products.map(campaignCard));
      pageCount += 1;
      nextCursor = data.nextCursor;
      status.textContent = grid.childElementCount || nextCursor !== null ? '' : 'Товарів не знайдено.';
      more.textContent = 'Показати ще';
      more.hidden = nextCursor === null;
      return true;
    } catch {
      if (signal.aborted) return false;
      status.textContent = stale ? 'Склад акції змінився.' : 'Не вдалося завантажити товари.';
      more.hidden = false;
      more.textContent = stale ? 'Оновити сторінку' : 'Спробувати ще';
      return false;
    } finally {
      if (!signal.aborted) more.disabled = false;
    }
  }
  async function display() {
    clearTimeout(timer);
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const params = new URL(location.href).searchParams;
    active = groups.get(params.get(key)) || all;
    selected = new Set(params.getAll(brandKey).map((brand) => brand.toLowerCase()).filter((brand) => active.brands.has(brand)));
    query = (params.get(queryKey) || '').trim().slice(0, 200);
    if (search.value.trim() !== query) search.value = query;
    select.value = active.id;
    heading.textContent = active.name;
    count.textContent = String(active.count);
    count.hidden = Boolean(query || selected.size);
    for (const link of nav.children) {
      const group = groups.get(link.dataset.section);
      link.setAttribute('aria-current', String(group === active));
      link.href = urlFor(group, selected, query);
    }
    showChips();
    nextCursor = 0;
    stale = false;
    pageCount = 0;
    grid.replaceChildren();
    more.hidden = true;
    const saved = history.state?.[key];
    const restore = saved?.section === active.id && saved.revision === campaign.revision && (saved.query || '') === query
      && JSON.stringify(saved.brands || []) === JSON.stringify([...selected]) ? saved : null;
    do {
      if (!await loadPage(signal)) return;
    } while (nextCursor !== null && restore && pageCount < restore.pages);
    if (restore) requestAnimationFrame(() => { if (!signal.aborted) window.scrollTo(0, restore.scroll); });
  }
  grid.addEventListener('click', (event) => {
    if (event.target.closest('a')) rememberPosition();
  });
  more.onclick = () => { if (stale) location.reload(); else void loadPage(controller.signal); };
  window.addEventListener('popstate', display);
  void display();
}
