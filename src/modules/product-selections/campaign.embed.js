/* global document, location, history, window, requestAnimationFrame */
export const campaignStyles = `
.mt-campaign h2 { margin: 0 0 20px; color: inherit; font-size: clamp(24px,4vw,38px); line-height: 1.15 }
.mt-campaign__body { display: grid; grid-template-columns: minmax(150px, 215px) minmax(0,1fr); gap: 24px; align-items: start }
.mt-campaign__nav { display: grid; gap: 4px; position: sticky; top: 16px; max-height: 70vh; overflow: auto }
.mt-campaign__nav a { display: flex; gap: 10px; align-items: baseline; justify-content: space-between; padding: 10px 12px; border-radius: 7px; color: inherit; text-decoration: none; overflow-wrap: anywhere }
.mt-campaign__nav a[aria-current="true"] { background: #fff3a4; font-weight: 700 }
.mt-campaign__nav small { color: #535966 }
.mt-campaign__mobile { display: none }
.mt-campaign__more { margin: 20px auto 0; padding: 10px 20px; display: block; border: 1px solid #c7cbd0; border-radius: 8px; background: white; color: #17191d; cursor: pointer }
.mt-campaign__more[hidden], .mt-campaign__status:empty {display:none}
@media (max-width: 720px) {
  .mt-campaign__nav { display:none }
  .mt-campaign__body { display: block }
  .mt-campaign__mobile { position: sticky; top: 0; z-index: 2; display: grid; gap: 4px; padding: 8px 0; margin-bottom: 12px; background: white }
  .mt-campaign__mobile select { width: 100%; padding: 10px; border: 1px solid #c7cbd0; border-radius: 8px; background: white; color: inherit }
}`;

// Serialized into the external script. All runtime dependencies are supplied by the card embed.
export function mountCampaign(script, campaign, createCard) {
  const key = 'mt-section-' + campaign.id;
  if (document.getElementById(key)) return;
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  const root = element('section', 'mt-product-selection mt-campaign');
  root.id = key;
  root.style.setProperty('--mt-selection-desktop-columns', '3');
  root.append(element('h2', '', campaign.name));
  if (script.parentNode === document.head) document.body.append(root);
  else script.after(root);
  if (!campaign.sections.length) {
    root.append(element('p', '', 'Наразі в цій акції немає товарів.'));
    return;
  }
  const groups = [{ id: '', name: 'Усі товари', count: campaign.sections.reduce((sum, group) => sum + group.count, 0) }, ...campaign.sections];
  const body = element('div', 'mt-campaign__body');
  const nav = element('nav', 'mt-campaign__nav');
  nav.setAttribute('aria-label', 'Категорії акції');
  const mobile = element('label', 'mt-campaign__mobile', 'Категорії');
  const select = element('select');
  mobile.append(select);
  const content = element('div');
  const grid = element('div', 'mt-product-selection__grid');
  const status = element('p', 'mt-campaign__status');
  status.setAttribute('role', 'status');
  const more = element('button', 'mt-campaign__more', 'Показати ще');
  more.type = 'button';
  content.append(grid, status, more);
  body.append(nav, content);
  root.append(mobile, body);
  let active = '';
  let nextCursor = 0;
  let controller;
  let stale = false;
  let pageCount = 0;
  function linkFor(id) {
    const url = new URL(location.href);
    if (id) url.searchParams.set(key, id);
    else url.searchParams.delete(key);
    return url;
  }
  function openCategory(id) {
    if (active === id) return;
    rememberPosition();
    history.pushState({ ...history.state, [key]: null }, '', linkFor(id));
    if (root.getBoundingClientRect().top < 0) root.scrollIntoView({ block: 'start' });
    void display();
  }
  for (const group of groups) {
    const link = element('a', '', group.name);
    link.href = linkFor(group.id);
    link.dataset.section = group.id;
    link.append(element('small', '', String(group.count)));
    link.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openCategory(group.id);
    });
    nav.append(link);
    const option = element('option', '', group.name + ' (' + group.count + ')');
    option.value = group.id;
    select.append(option);
  }
  select.onchange = () => openCategory(select.value);

  async function loadPage(signal) {
    const url = new URL('products', script.src);
    url.searchParams.set('revision', String(campaign.revision));
    url.searchParams.set('cursor', String(nextCursor));
    if (active) url.searchParams.set('section', active);
    more.disabled = true;
    status.textContent = 'Завантажуємо товари…';
    try {
      const response = await fetch(url, { signal, credentials: 'omit' });
      if (signal.aborted) return false;
      if (!response.ok) {
        stale = response.status === 409 || response.status === 404;
        throw new Error();
      }
      const { data } = await response.json();
      if (signal.aborted) return false;
      grid.append(...data.products.map(createCard));
      pageCount += 1;
      nextCursor = data.nextCursor;
      status.textContent = grid.childElementCount ? '' : 'У цьому розділі поки немає товарів.';
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
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const id = new URL(location.href).searchParams.get(key);
    active = groups.some((group) => group.id === id) ? id : '';
    select.value = active;
    for (const link of nav.children) {
      link.setAttribute('aria-current', String(link.dataset.section === active));
      link.href = linkFor(link.dataset.section);
    }
    nextCursor = 0;
    stale = false;
    pageCount = 0;
    grid.replaceChildren();
    more.hidden = true;
    const saved = history.state?.[key];
    const restore = saved?.section === active && saved.revision === campaign.revision ? saved : null;
    do {
      if (!await loadPage(signal)) return;
    } while (nextCursor !== null && restore && pageCount < restore.pages);
    if (restore) requestAnimationFrame(() => { if (!signal.aborted) window.scrollTo(0, restore.scroll); });
  }
  function rememberPosition() {
    history.replaceState({ ...history.state, [key]: { revision: campaign.revision, section: active, pages: pageCount, scroll: window.scrollY } }, '');
  }
  grid.addEventListener('click', (event) => {
    if (event.target.closest('a')) rememberPosition();
  });
  more.onclick = () => { if (stale) location.reload(); else void loadPage(controller.signal); };
  window.addEventListener('popstate', display);
  void display();
}
