export const productPriceCss = `
.mt-product-price-stack {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-start !important;
}

.mt-product-current-price,
.mt-product-current-price .product-price__item,
.mt-product-current-price .product-price__current,
.mt-product-current-price .product-price__value,
.mt-product-current-price .product-card__price {
  color: #ff0000 !important;
}

.mt-product-old-price {
  display: block !important;
  margin: 0 0 4px !important;
  color: #8a8f98 !important;
  font-size: 16px !important;
  font-weight: 500 !important;
  text-decoration: line-through !important;
}
`;

export function productPriceEmbedScript() {
  return String.raw`(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var promoEnabled = params.get("mt_promo_price") === "1";
  var percent = Number(params.get("mt_old_percent") || 0);
  var fixed = Number(params.get("mt_old_fixed") || 0);
  var observer = null;
  var stopTimer = null;
  var styleId = "mt-product-price-styles-v1";
  var oldPriceEnabled = percent > 0 || fixed > 0;

  if (!promoEnabled && !oldPriceEnabled) {
    return;
  }

  function injectStyles() {
    if (document.getElementById(styleId)) {
      return;
    }

    var style = document.createElement("style");
    style.id = styleId;
    style.textContent = ${JSON.stringify(productPriceCss)};
    (document.head || document.documentElement).appendChild(style);
  }

  function parsePrice(text) {
    var match = String(text || "").match(/\d[\d\s\u00a0]*(?:[.,]\d{1,2})?/);

    if (!match) {
      return null;
    }

    var value = Number(match[0].replace(/[\s\u00a0]/g, "").replace(",", "."));
    return Number.isFinite(value) ? value : null;
  }

  function findPriceContext() {
    // Horoshop owns these subtrees. Only touch the stable native price boxes;
    // broad price selectors can match skeletons or recommendation cards during hydration.
    var desktopBox = document.querySelector(
      ".product__block--wide .product-price__box"
    );

    if (desktopBox) {
      var desktopPrice = desktopBox.querySelector(
        ".product-price__item, .product-price__current, .product-price__value"
      );

      if (desktopPrice) {
        return { box: desktopBox, price: desktopPrice };
      }
    }

    var mobileBox = document.querySelector(
      ".product__block--orderBox .product-card--main .product-card__price-box"
    );

    if (mobileBox) {
      var mobilePrice = mobileBox.querySelector(".product-card__price");

      if (mobilePrice) {
        return { box: mobileBox, price: mobilePrice };
      }
    }

    return null;
  }

  function formatOldPrice(value) {
    var oldValue = percent > 0
      ? Math.floor((value * (1 + percent / 100)) / 10) * 10
      : Math.round((value + fixed) * 100) / 100;
    var fractionDigits = Number.isInteger(oldValue) ? 0 : 2;

    return new Intl.NumberFormat("uk-UA", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits
    }).format(oldValue) + " грн";
  }

  function apply() {
    var context = findPriceContext();

    if (!context) {
      return false;
    }

    var box = context.box;
    var price = context.price;
    var value = parsePrice(price.textContent);

    if (value === null) {
      return false;
    }

    if (promoEnabled) {
      price.classList.add("mt-product-current-price");
    }

    if (oldPriceEnabled) {
      var oldPrice = box.querySelector(".mt-product-old-price");
      var oldPriceText = formatOldPrice(value);

      box.classList.add("mt-product-price-stack");

      if (!oldPrice) {
        oldPrice = document.createElement("span");
        oldPrice.className = "mt-product-old-price";
        box.insertBefore(oldPrice, box.firstChild);
      }

      if (oldPrice.textContent !== oldPriceText) {
        oldPrice.textContent = oldPriceText;
      }
    }

    return true;
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    if (stopTimer !== null) {
      window.clearTimeout(stopTimer);
      stopTimer = null;
    }
  }

  function start() {
    try {
      injectStyles();

      if (apply()) {
        return;
      }

      var target = document.body || document.documentElement;

      if (!target) {
        return;
      }

      observer = new MutationObserver(function () {
        try {
          if (apply()) {
            // Keeping a body-wide observer after our own insertion creates a
            // reconciliation loop with Horoshop and can prevent the page from loading.
            stopObserver();
          }
        } catch (error) {
          stopObserver();
        }
      });
      observer.observe(target, {
        childList: true,
        subtree: true
      });
      stopTimer = window.setTimeout(stopObserver, 8000);
    } catch (error) {
      stopObserver();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();`;
}
