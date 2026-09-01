const SELECTION_STYLES = `.mt-product-selection {
  --mt-selection-accent: #ffe101;
  --mt-selection-text: #111827;
  --mt-selection-border: #e2e5ea;
  --mt-selection-desktop-columns: 4;
  --mt-selection-mobile-columns: 2;
  width: 100% !important;
  margin: 28px 0 !important;
  color: var(--mt-selection-text) !important;
  font-family: Arial, sans-serif !important;
  box-sizing: border-box !important;
}
.mt-product-selection *, .mt-product-selection *::before, .mt-product-selection *::after {
  box-sizing: border-box !important;
}
.p-review-add {
  display: none !important;
}
.mt-product-selection__heading {
  margin: 0 0 18px !important;
  color: var(--mt-selection-text) !important;
  font-size: clamp(22px, 2vw, 30px) !important;
  font-weight: 800 !important;
  line-height: 1.2 !important;
}
.mt-product-selection__grid {
  display: grid !important;
  grid-template-columns: repeat(var(--mt-selection-desktop-columns), minmax(0, 1fr)) !important;
  gap: 20px !important;
  width: 100% !important;
}
.mt-product-selection__card {
  display: grid !important;
  grid-template-rows: auto minmax(44px, 1fr) auto auto !important;
  gap: 12px !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 14px !important;
  overflow: hidden !important;
  border: 1px solid var(--mt-selection-border) !important;
  border-radius: 16px !important;
  background: #fff !important;
  box-shadow: 0 6px 18px rgba(17, 24, 39, .08) !important;
  transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease !important;
  will-change: transform !important;
}
.mt-product-selection__media {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  aspect-ratio: 1 / 1 !important;
  padding: 10px !important;
  overflow: hidden !important;
  border-radius: 12px !important;
  background: #fff !important;
}
.mt-product-selection__image {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  max-width: 100% !important;
  max-height: 100% !important;
  border: 0 !important;
  object-fit: contain !important;
  object-position: center !important;
  transform: none !important;
}
.mt-product-selection__title {
  display: -webkit-box !important;
  overflow: hidden !important;
  margin: 0 !important;
  color: var(--mt-selection-text) !important;
  font-size: 15px !important;
  font-weight: 650 !important;
  line-height: 1.45 !important;
  text-decoration: none !important;
  -webkit-box-orient: vertical !important;
  -webkit-line-clamp: 2 !important;
}
.mt-product-selection__price {
  display: flex !important;
  align-items: baseline !important;
  flex-wrap: wrap !important;
  gap: 8px !important;
  min-height: 26px !important;
}
.mt-product-selection__price strong {
  color: var(--mt-selection-text) !important;
  font-size: 19px !important;
  font-weight: 800 !important;
  line-height: 1.2 !important;
}
.mt-product-selection__price.is-promo strong { color: #dc2626 !important; }
.mt-product-selection__price del {
  color: #7b8493 !important;
  font-size: 13px !important;
  line-height: 1.2 !important;
}
.mt-product-selection__buy {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  min-height: 46px !important;
  margin: 0 !important;
  padding: 10px 16px !important;
  border: 1px solid var(--mt-selection-accent) !important;
  border-radius: 11px !important;
  background: var(--mt-selection-accent) !important;
  color: #111 !important;
  font: 700 15px/1.2 Arial, sans-serif !important;
  cursor: pointer !important;
}
.mt-product-selection__buy:disabled { cursor: wait !important; opacity: .68 !important; }
@media (hover: hover) and (pointer: fine) {
  .mt-product-selection__card:hover {
    border-color: #d2d7e0 !important;
    box-shadow: 0 16px 34px rgba(17, 24, 39, .15) !important;
    transform: translateY(-4px) !important;
  }
}
@media (max-width: 1080px) {
  .mt-product-selection__grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
}
@media (max-width: 760px) {
  .mt-product-selection { margin: 22px 0 !important; }
  .mt-product-selection__grid {
    grid-template-columns: repeat(var(--mt-selection-mobile-columns), minmax(0, 1fr)) !important;
    gap: 10px !important;
  }
  .mt-product-selection__card { gap: 9px !important; padding: 9px !important; border-radius: 13px !important; }
  .mt-product-selection__media { padding: 6px !important; border-radius: 10px !important; }
  .mt-product-selection__title { min-height: 38px !important; font-size: 13px !important; line-height: 1.4 !important; }
  .mt-product-selection__price { gap: 5px !important; min-height: 22px !important; }
  .mt-product-selection__price strong { font-size: 16px !important; }
  .mt-product-selection__price del { font-size: 11px !important; }
  .mt-product-selection__buy { min-height: 42px !important; padding: 8px !important; font-size: 14px !important; }
}`;

const PROMO_STYLES = `.mt-product-promo-old-price {
  display: block !important;
  width: max-content !important;
  margin: 0 0 7px !important;
  color: #7b8493 !important;
  font: 500 15px/1.3 Arial, sans-serif !important;
  text-decoration: line-through !important;
  text-decoration-thickness: 1px !important;
  white-space: nowrap !important;
}
.mt-product-promo-old-price[data-mt-promo-surface="desktop"] {
  margin: 0 12px 0 0 !important;
  font-size: 16px !important;
}
.mt-product-promo-old-price[data-mt-promo-surface="mobile"] {
  margin-bottom: 6px !important;
  font-size: 14px !important;
}
.product-price__box[data-mt-product-promo="v2"],
.product-card__price-box[data-mt-product-promo="v2"] {
  column-gap: 12px !important;
  row-gap: 6px !important;
}
.product-price__item.mt-product-promo-current-price,
.product-card__price.mt-product-promo-current-price {
  color: #dc2626 !important;
}`;

export function productSelectionEmbedScript(selection, origin = '') {
  return `(function () {
  "use strict";
  var sourceScript = document.currentScript;
  if (!sourceScript) return;
  var payload = ${JSON.stringify(selection)};
  var apiOrigin = ${JSON.stringify(origin)};
  var styleId = "mt-product-selection-styles-v2";
  var eventQueue = [];
  var eventTimer = 0;
  var visitorKey = "";
  try {
    visitorKey = localStorage.getItem("mt-product-selection-visitor") || "";
    if (!visitorKey) {
      visitorKey = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now();
      localStorage.setItem("mt-product-selection-visitor", visitorKey);
    }
  } catch (_) { visitorKey = Math.random().toString(36).slice(2) + Date.now(); }

  function surface() {
    return window.matchMedia && window.matchMedia("(max-width: 720px)").matches ? "mobile" : "desktop";
  }

  function flushEvents() {
    clearTimeout(eventTimer);
    eventTimer = 0;
    if (!eventQueue.length || !apiOrigin) return;
    var events = eventQueue.splice(0, 50);
    fetch(new URL("/api/public/product-selections/events", apiOrigin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publicId: payload.id, events: events }),
      keepalive: true
    }).catch(function () {});
    if (eventQueue.length) eventTimer = setTimeout(flushEvents, 350);
  }

  function track(eventType, product, metadata) {
    eventQueue.push({
      eventType: eventType,
      productExternalId: product && product.productExternalId || "",
      modificationExternalId: product && product.modificationExternalId || "",
      visitorKey: visitorKey,
      pageUrl: location.href,
      surface: surface(),
      metadata: metadata || {}
    });
    if (eventQueue.length >= 10) flushEvents();
    else if (!eventTimer) eventTimer = setTimeout(flushEvents, 350);
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flushEvents();
  });

  function installStyles() {
    if (document.getElementById(styleId)) return;
    var style = document.createElement("style");
    style.id = styleId;
    style.textContent = ${JSON.stringify(SELECTION_STYLES)};
    (document.head || document.documentElement).appendChild(style);
  }

  function money(value, currency) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    var currencyText = String(currency || "").trim().toUpperCase() === "UAH" ? "грн" : String(currency || "").trim();
    return [raw, currencyText].filter(Boolean).join(" ");
  }

  function normalizedHost(value) {
    return String(value || "").toLowerCase().replace(/^www\\./, "");
  }

  function storeUrl(value) {
    try {
      var parsed = new URL(value, location.href);
      if (!/^https?:$/.test(parsed.protocol) || normalizedHost(parsed.hostname) !== normalizedHost(location.hostname)) return null;
      return parsed;
    } catch (_) { return null; }
  }

  function productPath(url) {
    return url.origin + (url.pathname.replace(/\\/+$/, "") || "/") + url.search;
  }

  var desktopAddSelector = [
    '.product-order__block--buy .j-buy-button-add[id^="j-buy-button-widget-"]',
    '.product-order .j-buy-button-add[id^="j-buy-button-widget-"]',
    '.product__section--order .j-buy-button-add[id^="j-buy-button-widget-"]'
  ].join(',');
  var desktopRemoveSelector = desktopAddSelector.replaceAll('.j-buy-button-add', '.j-buy-button-remove');
  var mobileAddSelector = [
    '.product__block--orderBox [data-view-block="orderBox"] .product-card--main[itemprop="offers"] .product-card__buy-button > .j-buy-button-add[id^="j-buy-button-widget-"]',
    '[itemtype$="/Product"] [itemprop="offers"] .product-card__buy-button > .j-buy-button-add[id^="j-buy-button-widget-"]'
  ].join(',');
  var mobileRemoveSelector = mobileAddSelector.replaceAll('.j-buy-button-add', '.j-buy-button-remove');

  function surfaceSelectors(root) {
    var mobile = Boolean(root.querySelector('.product-card__price-box, .product__block--orderBox'));
    return mobile
      ? { add: mobileAddSelector, remove: mobileRemoveSelector }
      : { add: desktopAddSelector, remove: desktopRemoveSelector };
  }

  function nativeBuyDescriptor(button, requireQuantity) {
    var match = String(button && button.id || "").match(/^j-buy-button-widget-(\\d+)$/);
    var quantity = Number(button && button.dataset.quantity);
    var hasQuantity = Number.isFinite(quantity) && quantity > 0;
    if (!match || (requireQuantity && !hasQuantity)) return null;
    return {
      id: match[1],
      quantity: hasQuantity ? String(quantity) : "",
      productType: String(button.dataset.cartproducttype || "product")
    };
  }

  function existingNativeBuy(targetUrl, expectedId) {
    var targetPath = productPath(targetUrl);
    var links = document.querySelectorAll('a[href]');
    for (var index = 0; index < links.length; index += 1) {
      var link = links[index];
      var linkUrl = storeUrl(link.href);
      if (!linkUrl || productPath(linkUrl) !== targetPath) continue;
      var item = link.closest('.productsSlider-i, .catalogCard-box, .j-product-container, article, li');
      if (!item) continue;
      var addButton = item.querySelector('.j-buy-button-add[id^="j-buy-button-widget-"]');
      var removeButton = item.querySelector('.j-buy-button-remove[id^="j-buy-button-widget-"]');
      var button = addButton || removeButton;
      var descriptor = nativeBuyDescriptor(button, Boolean(addButton));
      if (button && descriptor && (!expectedId || descriptor.id === expectedId) && !button.disabled) {
        return { button: button, descriptor: descriptor, already: Boolean(removeButton && !addButton) };
      }
    }
    return null;
  }

  function pageArticle(root) {
    var node = root.querySelector('[itemprop="sku"], meta[property="product:retailer_item_id"], [data-product-article]');
    var direct = String(node && (node.content || node.dataset.productArticle || node.textContent) || "").trim();
    if (direct) return direct;
    var scripts = root.querySelectorAll('script[type="application/ld+json"]');
    for (var index = 0; index < scripts.length; index += 1) {
      try {
        var data = JSON.parse(scripts[index].textContent || "null");
        var values = Array.isArray(data) ? data : [data];
        for (var valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
          var sku = String(values[valueIndex] && values[valueIndex].sku || "").trim();
          if (sku) return sku;
        }
      } catch (_) {}
    }
    return "";
  }

  function nativeCart() {
    try {
      var instance = window.AjaxCart && window.AjaxCart.getInstance && window.AjaxCart.getInstance();
      var candidates = [instance, instance && instance.Cart];
      return candidates.find(function (candidate) {
        return candidate && typeof candidate.appendProduct === "function" && typeof candidate.getProductById === "function";
      }) || null;
    } catch (_) { return null; }
  }

  function cartProduct(cart, descriptor) {
    try { return cart.getProductById(descriptor.id, descriptor.productType) || null; }
    catch (_) { return null; }
  }

  function cartQuantity(product) {
    var raw = product && (product.quantity ?? product.Quantity ?? product.qty ?? product.count) || 0;
    var quantity = Number(raw);
    return Number.isFinite(quantity) ? quantity : 0;
  }

  function waitForCartChange(cart, descriptor, beforeProduct) {
    var beforeQuantity = cartQuantity(beforeProduct);
    var deadline = Date.now() + 4500;
    return new Promise(function (resolve) {
      function check() {
        var product = cartProduct(cart, descriptor);
        if (product && (!beforeProduct || cartQuantity(product) > beforeQuantity)) { resolve(true); return; }
        if (Date.now() >= deadline) { resolve(false); return; }
        setTimeout(check, 60);
      }
      check();
    });
  }

  async function clickExisting(entry) {
    var cart = nativeCart();
    if (!cart) return "";
    var before = cartProduct(cart, entry.descriptor);
    if (before) return "already";
    entry.button.click();
    return await waitForCartChange(cart, entry.descriptor, before) ? "added" : "";
  }

  async function appendNative(descriptor) {
    var cart = nativeCart();
    if (!cart) return "";
    var before = cartProduct(cart, descriptor);
    if (before) return "already";
    try {
      window.AjaxCart.openCartOnAdd = true;
      cart.appendProduct({ type: descriptor.productType, quantity: Number(descriptor.quantity), id: descriptor.id }, []);
    } catch (_) { return ""; }
    return await waitForCartChange(cart, descriptor, before) ? "added" : "";
  }

  async function nativeBuy(product) {
    var targetUrl = storeUrl(product.pageUrl);
    if (!targetUrl) return "";
    var rawBuyId = String(product.buyId || "").trim();
    var expectedId = /^\\d+$/.test(rawBuyId) ? rawBuyId : "";
    var existing = existingNativeBuy(targetUrl, expectedId);
    if (existing) return existing.already ? "already" : clickExisting(existing);
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 4500);
    var descriptor = null;
    var already = false;
    try {
      var response = await fetch(targetUrl.href, { credentials: "same-origin", headers: { accept: "text/html" }, signal: controller.signal });
      var responseUrl = response.url ? storeUrl(response.url) : targetUrl;
      if (response.ok && responseUrl && productPath(responseUrl) === productPath(targetUrl)) {
        var page = new DOMParser().parseFromString(await response.text(), "text/html");
        var selectors = surfaceSelectors(page);
        var addButton = page.querySelector(selectors.add);
        var removeButton = page.querySelector(selectors.remove);
        var button = addButton || removeButton;
        already = Boolean(removeButton && !addButton);
        descriptor = nativeBuyDescriptor(button, !already);
        var expectedArticle = String(product.article || "").trim().toLocaleLowerCase("uk-UA");
        var actualArticle = pageArticle(page).toLocaleLowerCase("uk-UA");
        if ((expectedId && descriptor && descriptor.id !== expectedId)
          || (expectedArticle && actualArticle && expectedArticle !== actualArticle)) {
          descriptor = null;
          already = false;
        }
      }
    } catch (_) { descriptor = null; }
    finally { clearTimeout(timeout); }
    if (!descriptor) return "";
    return already ? "already" : appendNative(descriptor);
  }

  function createCard(product) {
    var card = document.createElement("article");
    card.className = "mt-product-selection__card";
    var media = document.createElement("a");
    media.className = "mt-product-selection__media";
    media.href = product.pageUrl;
    var image = document.createElement("img");
    image.className = "mt-product-selection__image";
    image.src = product.imageUrl;
    image.alt = product.title;
    image.loading = "lazy";
    media.appendChild(image);
    var title = document.createElement("a");
    title.className = "mt-product-selection__title";
    title.href = product.pageUrl;
    title.textContent = product.title;
    media.addEventListener("click", function () { track("product_click", product, { target: "image" }); });
    title.addEventListener("click", function () { track("product_click", product, { target: "title" }); });
    var price = document.createElement("div");
    price.className = "mt-product-selection__price" + (product.highlightPrice ? " is-promo" : "");
    var current = document.createElement("strong");
    current.textContent = money(product.price, product.currency);
    price.appendChild(current);
    if (product.oldPrice && product.oldPrice !== product.price) {
      var old = document.createElement("del");
      old.textContent = money(product.oldPrice, product.currency);
      price.appendChild(old);
    }
    var buy = document.createElement("button");
    buy.className = "mt-product-selection__buy";
    buy.type = "button";
    buy.textContent = payload.buttonLabel || "Купити";
    buy.addEventListener("click", async function () {
      track("buy_click", product);
      buy.disabled = true;
      buy.textContent = "Додаємо…";
      var result = await nativeBuy(product);
      if (result === "added" || result === "already") {
        track(result === "added" ? "add_to_cart" : "already_in_cart", product);
        buy.textContent = "У кошику";
        buy.title = "Товар уже в кошику.";
      } else {
        track("add_to_cart_error", product);
        buy.disabled = false;
        buy.textContent = "Спробувати ще";
        buy.title = "Не вдалося додати товар. Повторіть спробу.";
      }
    });
    card.appendChild(media);
    card.appendChild(title);
    card.appendChild(price);
    card.appendChild(buy);
    card.__mtSelectionProduct = product;
    return card;
  }

  function mount() {
    if (!payload.products || !payload.products.length) return;
    installStyles();
    var duplicate = document.querySelector('[data-mt-product-selection="' + payload.id + '"]');
    if (duplicate) duplicate.remove();
    var section = document.createElement("section");
    section.className = "mt-product-selection";
    section.setAttribute("data-mt-product-selection", payload.id);
    section.style.setProperty("--mt-selection-desktop-columns", String(payload.desktopColumns || 4));
    section.style.setProperty("--mt-selection-mobile-columns", String(payload.mobileColumns || 2));
    var heading = document.createElement("h2");
    heading.className = "mt-product-selection__heading";
    heading.textContent = payload.heading || "Ми рекомендуємо";
    var grid = document.createElement("div");
    grid.className = "mt-product-selection__grid";
    for (var index = 0; index < payload.products.length; index += 1) grid.appendChild(createCard(payload.products[index]));
    section.appendChild(heading);
    section.appendChild(grid);
    var containerId = sourceScript.getAttribute("data-container") || "";
    var container = containerId ? document.getElementById(containerId) : null;
    if (container) container.appendChild(section);
    else if (sourceScript.parentNode && sourceScript.parentNode !== document.head) sourceScript.parentNode.insertBefore(section, sourceScript.nextSibling);
    else (document.body || document.documentElement).appendChild(section);
    var selectionTracked = false;
    var visibleProducts = new WeakSet();
    if (typeof IntersectionObserver === "function") {
      var sectionObserver = new IntersectionObserver(function (entries) {
        if (!selectionTracked && entries.some(function (entry) { return entry.isIntersecting && entry.intersectionRatio >= 0.45; })) {
          selectionTracked = true;
          track("impression", null);
          sectionObserver.disconnect();
        }
      }, { threshold: [0.45] });
      sectionObserver.observe(section);
      var productObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.6 || visibleProducts.has(entry.target)) return;
          visibleProducts.add(entry.target);
          track("product_impression", entry.target.__mtSelectionProduct);
          productObserver.unobserve(entry.target);
        });
      }, { threshold: [0.6] });
      grid.querySelectorAll(".mt-product-selection__card").forEach(function (card) { productObserver.observe(card); });
    } else {
      track("impression", null);
      grid.querySelectorAll(".mt-product-selection__card").forEach(function (card) {
        track("product_impression", card.__mtSelectionProduct);
      });
    }
  }

  if (document.readyState === "loading" && sourceScript.parentNode === document.head) document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();`;
}

export function productPromoLoaderScript(apiOrigin) {
  return `(function () {
  "use strict";
  var sourceScript = document.currentScript || document.querySelector("script[data-mt-product-promo-loader]");
  if (!sourceScript || window.__mtProductPromoLoaderV2) return;
  window.__mtProductPromoLoaderV2 = true;
  var token = new URLSearchParams(location.search).get("mt_promo");
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return;
  var apiOrigin = ${JSON.stringify(apiOrigin)};
  var adapters = [
    { surface: "desktop", box: ".product-price__box", price: ".product-price__item" },
    { surface: "mobile", box: ".product-card__price-box", price: ".product-card__price" }
  ];
  var promo = null;
  var observers = [];

  function installStyles() {
    if (document.getElementById("mt-product-promo-styles-v2")) return;
    var style = document.createElement("style");
    style.id = "mt-product-promo-styles-v2";
    style.textContent = ${JSON.stringify(PROMO_STYLES)};
    (document.head || document.documentElement).appendChild(style);
  }

  function calculate(current) {
    if (!promo || !Number.isFinite(current) || current <= 0) return null;
    if (promo.mode === "percent") {
      var rounded = Math.floor((current * (1 + promo.value / 100)) / 10) * 10;
      return rounded > current ? rounded : Math.ceil(current / 10) * 10 + 10;
    }
    if (promo.mode === "fixed") {
      var fixed = Math.round((current + promo.value) * 100) / 100;
      return fixed > current ? fixed : null;
    }
    return null;
  }

  function format(value, currency) {
    var maximumFractionDigits = Number.isInteger(value) ? 0 : 2;
    var amount = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: maximumFractionDigits }).format(value);
    return amount + (String(currency || "").toUpperCase() === "UAH" ? " грн" : currency ? " " + currency : "");
  }

  function applyAdapter(adapter) {
    var box = document.querySelector(adapter.box);
    if (!box) return false;
    var priceNode = box.querySelector(adapter.price);
    var metaPrice = box.querySelector('meta[itemprop="price"]');
    var current = Number(String(metaPrice && metaPrice.content || "").replace(',', '.'));
    var oldValue = calculate(current);
    if (!priceNode || !Number.isFinite(oldValue) || oldValue <= current) return false;
    var currency = box.querySelector('meta[itemprop="priceCurrency"]');
    var old = box.querySelector('.mt-product-promo-old-price');
    var text = format(oldValue, currency && currency.content || "UAH");
    if (!old) {
      old = document.createElement("div");
      old.className = "mt-product-promo-old-price";
      old.setAttribute("aria-label", "Стара ціна");
      priceNode.parentNode.insertBefore(old, priceNode);
    }
    if (old.textContent !== text) old.textContent = text;
    old.setAttribute("data-mt-promo-surface", adapter.surface);
    priceNode.classList.toggle("mt-product-promo-current-price", Boolean(promo.highlightPromoPrice));
    box.setAttribute("data-mt-product-promo", "v2");
    if (!box.__mtProductPromoObserved) {
      box.__mtProductPromoObserved = true;
      var observer = new MutationObserver(function () { applyAdapter(adapter); });
      observer.observe(box, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["content"]
      });
      observers.push(observer);
    }
    return true;
  }

  function discover(attempt) {
    var applied = false;
    for (var index = 0; index < adapters.length; index += 1) applied = applyAdapter(adapters[index]) || applied;
    if (!applied && attempt < 40) setTimeout(function () { discover(attempt + 1); }, 250);
  }

  async function start() {
    var endpoint = new URL("/api/public/product-selections/promo/" + encodeURIComponent(token), apiOrigin);
    endpoint.searchParams.set("page", location.href);
    try {
      var response = await fetch(endpoint.href, { headers: { accept: "application/json" }, credentials: "omit" });
      if (!response.ok) return;
      var envelope = await response.json();
      if (!envelope || !envelope.data) return;
      promo = envelope.data;
      installStyles();
      discover(0);
    } catch (_) {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();`;
}
