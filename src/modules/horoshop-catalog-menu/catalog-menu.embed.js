const baseCss = String.raw`
@media (min-width: 1024px) {
  .j-products-menu[data-mt-catalog-menu="v1"] {
    --mt-menu-accent: #ffe101;
    --mt-menu-ink: #20242c;
    --mt-menu-muted: #626975;
    --mt-menu-line: #e6e8ec;
    --mt-menu-root-width: 252px;
    --mt-menu-columns: 4;
  }

  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-submenu.__hasTabs {
    box-sizing: border-box !important;
    width: min(1180px, calc(100vw - 60px)) !important;
    height: min(560px, calc(100vh - 110px)) !important;
    min-height: 420px !important;
    max-height: calc(100vh - 110px) !important;
    border: 1px solid var(--mt-menu-line) !important;
    border-radius: 0 0 10px 10px !important;
    background: #fff !important;
    box-shadow: 0 18px 48px rgba(20, 25, 34, .16) !important;
    overflow: hidden !important;
  }

  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-tabs {
    box-sizing: border-box !important;
    display: flex !important;
    width: 100% !important;
    height: 100% !important;
    min-height: 0 !important;
  }

  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-tabs-list {
    box-sizing: border-box !important;
    width: var(--mt-menu-root-width) !important;
    height: 100% !important;
    min-height: 0 !important;
    flex: 0 0 var(--mt-menu-root-width) !important;
    margin: 0 !important;
    padding: 8px 0 !important;
    border-right: 1px solid var(--mt-menu-line) !important;
    background: #fff !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    scrollbar-width: thin;
  }

  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-tabs-list__tab {
    position: relative !important;
    box-sizing: border-box !important;
    height: 32px !important;
    min-height: 32px !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-tabs-list__link {
    box-sizing: border-box !important;
    width: 100% !important;
    height: 32px !important;
    min-height: 32px !important;
    display: flex !important;
    align-items: center !important;
    gap: 9px !important;
    margin: 0 !important;
    padding: 4px 28px 4px 12px !important;
    color: var(--mt-menu-muted) !important;
    font-size: 13px !important;
    font-weight: 500 !important;
    line-height: 1.15 !important;
    text-decoration: none !important;
    white-space: normal !important;
    transition: color .14s ease, background-color .14s ease !important;
  }

  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-tabs-list__icon {
    width: 22px !important;
    height: 22px !important;
    min-width: 22px !important;
    display: grid !important;
    place-items: center !important;
    margin: 0 !important;
  }

  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-tabs-list__icon img {
    width: 20px !important;
    height: 20px !important;
    max-width: 20px !important;
    max-height: 20px !important;
    object-fit: contain !important;
  }

  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-tabs-list__tab.__hover > .productsMenu-tabs-list__link,
  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-tabs-list__tab:hover > .productsMenu-tabs-list__link,
  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-tabs-list__link:focus-visible {
    color: var(--mt-menu-ink) !important;
    background: #f3f4f5 !important;
    outline: none !important;
  }

  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-tabs-list__tab.__hover::before,
  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-tabs-list__tab:hover::before {
    position: absolute !important;
    z-index: 2 !important;
    inset: 5px auto 5px 0 !important;
    width: 3px !important;
    border-radius: 0 3px 3px 0 !important;
    background: var(--mt-menu-accent) !important;
    content: '' !important;
  }

  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-tabs-switch {
    right: 9px !important;
    transform: scale(.82) !important;
  }

  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-tabs-content {
    box-sizing: border-box !important;
    width: auto !important;
    height: 100% !important;
    min-width: 0 !important;
    min-height: 0 !important;
    flex: 1 1 auto !important;
    padding: 22px 24px !important;
    background: #fff !important;
    overflow: auto !important;
    overscroll-behavior: contain !important;
    scrollbar-width: thin;
  }

  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-submenu-w.__visible {
    box-sizing: border-box !important;
    width: 100% !important;
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: repeat(var(--mt-menu-columns), minmax(0, 1fr)) !important;
    align-items: start !important;
    gap: 24px 0 !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-submenu-i {
    box-sizing: border-box !important;
    min-width: 0 !important;
    margin: 0 !important;
    padding: 0 20px !important;
    list-style: none !important;
  }

  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-submenu-i:first-child {
    padding-left: 0 !important;
  }

  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-submenu-a {
    display: inline-flex !important;
    margin: 0 0 11px !important;
    padding: 0 0 6px !important;
    color: var(--mt-menu-ink) !important;
    font-size: 13px !important;
    font-weight: 750 !important;
    line-height: 1.25 !important;
    text-decoration: none !important;
  }

  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-submenu-t {
    padding: 0 !important;
  }

  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-list {
    display: grid !important;
    gap: 7px !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-list-i {
    margin: 0 !important;
    padding: 0 !important;
    line-height: 1.25 !important;
    list-style: none !important;
  }

  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-list-i a {
    color: var(--mt-menu-muted) !important;
    font-size: 12.5px !important;
    font-weight: 450 !important;
    line-height: 1.3 !important;
    text-decoration: none !important;
  }

  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-submenu-a:hover,
  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-list-i a:hover,
  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-submenu-a:focus-visible,
  .j-products-menu[data-mt-catalog-menu="v1"] .productsMenu-list-i a:focus-visible {
    color: #8a7600 !important;
    text-decoration: underline !important;
    text-underline-offset: 3px !important;
  }
}
`;

const themeCss = {
  'compact-columns': String.raw`
@media (min-width: 1024px) {
  .j-products-menu[data-mt-catalog-theme="compact-columns"] .productsMenu-submenu-i {
    border-left: 1px solid #eceef1 !important;
  }
  .j-products-menu[data-mt-catalog-theme="compact-columns"] .productsMenu-submenu-i:first-child {
    border-left: 0 !important;
  }
  .j-products-menu[data-mt-catalog-theme="compact-columns"] .productsMenu-submenu-a {
    border-bottom: 2px solid var(--mt-menu-accent) !important;
  }
}
`,
  'flat-directory': String.raw`
@media (min-width: 1024px) {
  .j-products-menu[data-mt-catalog-theme="flat-directory"] {
    --mt-menu-root-width: 238px;
    --mt-menu-columns: 3;
  }
  .j-products-menu[data-mt-catalog-theme="flat-directory"] .productsMenu-tabs-content {
    padding: 25px 30px !important;
  }
  .j-products-menu[data-mt-catalog-theme="flat-directory"] .productsMenu-submenu-w.__visible {
    gap: 28px 24px !important;
  }
  .j-products-menu[data-mt-catalog-theme="flat-directory"] .productsMenu-submenu-i {
    padding: 0 !important;
  }
  .j-products-menu[data-mt-catalog-theme="flat-directory"] .productsMenu-submenu-a {
    width: 100% !important;
    border-bottom: 1px solid #dfe2e7 !important;
  }
}
`,
  'grouped-sections': String.raw`
@media (min-width: 1024px) {
  .j-products-menu[data-mt-catalog-theme="grouped-sections"] {
    --mt-menu-root-width: 252px;
    --mt-menu-columns: 3;
  }
  .j-products-menu[data-mt-catalog-theme="grouped-sections"] .productsMenu-tabs-content {
    padding: 18px !important;
    background: #f6f7f9 !important;
  }
  .j-products-menu[data-mt-catalog-theme="grouped-sections"] .productsMenu-submenu-w.__visible {
    gap: 12px !important;
  }
  .j-products-menu[data-mt-catalog-theme="grouped-sections"] .productsMenu-submenu-i {
    height: 100% !important;
    border: 1px solid #e5e7eb !important;
    border-radius: 9px !important;
    padding: 15px 16px !important;
    background: #fff !important;
  }
  .j-products-menu[data-mt-catalog-theme="grouped-sections"] .productsMenu-submenu-a {
    border-bottom: 2px solid var(--mt-menu-accent) !important;
  }
}
`
};

export function catalogMenuCss(themeId) {
  return `${baseCss}\n${themeCss[themeId] || themeCss['compact-columns']}`;
}

export function catalogMenuEmbedScript(themeId, stylesheetUrl = '') {
  const css = catalogMenuCss(themeId);
  return `(() => {
  if (window.__mtHoroshopCatalogMenuV1) return;
  window.__mtHoroshopCatalogMenuV1 = true;
  const themeId = ${JSON.stringify(themeId)};
  const stylesheetUrl = ${JSON.stringify(stylesheetUrl)};
  const styleId = 'mt-horoshop-catalog-menu-v1';

  function installStyle() {
    if (document.getElementById(styleId)) return;
    if (stylesheetUrl) {
      const link = document.createElement('link');
      link.id = styleId;
      link.rel = 'stylesheet';
      link.href = stylesheetUrl;
      (document.head || document.documentElement).appendChild(link);
      return;
    }
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = ${JSON.stringify(css)};
    (document.head || document.documentElement).appendChild(style);
  }

  function apply() {
    if (!globalThis.document || typeof document.querySelector !== 'function') return false;
    const root = document.querySelector('.j-products-menu');
    const menu = root?.querySelector('.productsMenu-submenu.__hasTabs');
    const tabs = menu?.querySelector('.productsMenu-tabs');
    const list = tabs?.querySelector('.productsMenu-tabs-list');
    const content = tabs?.querySelector('.productsMenu-tabs-content');
    const links = list?.querySelectorAll('.productsMenu-tabs-list__link[data-target]');
    if (!root || !menu || !tabs || !list || !content || !links || links.length < 2) return false;
    installStyle();
    root.setAttribute('data-mt-catalog-menu', 'v1');
    root.setAttribute('data-mt-catalog-theme', themeId);
    return true;
  }

  if (apply()) return;
  const observer = new MutationObserver(() => {
    if (!apply()) return;
    observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 30000);
})();`;
}
