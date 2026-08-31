import { buildShareMeta, escapeHtml } from './banner-generator';

export interface ProductCodeSettings {
  imageUrl: string;
  linkUrl: string;
  alt: string;
  oldPricePercent: number;
  oldPriceFixed: number;
  shareDescription: string;
}

function positive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function buildProductsCode(settings: ProductCodeSettings): string {
  const percent = positive(settings.oldPricePercent);
  const fixed = percent ? 0 : positive(settings.oldPriceFixed);
  const meta = buildShareMeta(settings.shareDescription, 'hs-share-description');
  const content = `<!-- MT INLINE PRODUCTS START -->
<div
  class="hs-page-banner"
  data-alt="${escapeHtml(settings.alt)}"
  data-image-url="${escapeHtml(settings.imageUrl)}"
  data-link-url="${escapeHtml(settings.linkUrl)}"
  hidden
  id="hs-page-banner"
></div>

<section
  class="hs-products"
  data-old-price-percent="${percent || ''}"
  data-old-price-fixed="${fixed || ''}"
  hidden
  id="hs-inline-products"
>
  <div aria-live="polite" class="hs-products__mount"></div>
</section>

<style type="text/css">
  .hs-page-banner[hidden],
  .hs-products[hidden] {
    display: none !important;
  }

  .hs-page-banner {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto 32px;
  }

  .hs-page-banner__link {
    display: block;
    overflow: hidden;
    border-radius: 16px;
    text-decoration: none;
  }

  .hs-page-banner__image {
    display: block;
    width: 100% !important;
    height: auto !important;
    aspect-ratio: 3 / 1;
    object-fit: cover;
  }

  .hs-products,
  #hs-inline-products,
  #hs-inline-products .hs-products__mount {
    width: 100% !important;
    max-width: none !important;
    box-sizing: border-box !important;
  }

  .hs-products {
    margin: 40px 0;
    font-family: inherit;
  }

  .hs-products__native,
  .hs-products__native.related-goods,
  .hs-products__native .carousel,
  .hs-products__native .productsSlider,
  .hs-products__native .productsSlider-container,
  .hs-products__native .productsSlider-wrapper {
    position: static !important;
    width: 100% !important;
    max-width: none !important;
    height: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    box-sizing: border-box !important;
    transform: none !important;
  }

  .hs-products__native > .product-heading,
  .hs-products__native.related-goods > .heading,
  .hs-products__native .swiper-button-prev,
  .hs-products__native .swiper-button-next,
  .hs-products__native .productsSlider-arrow,
  .hs-products__native .productsSlider-pagination,
  .hs-products__native .swiper-pagination,
  .hs-products__native .swiper-slide-duplicate {
    display: none !important;
  }

  .hs-products__native .productsSlider-wrapper,
  .hs-products__native .carousel__wrapper,
  .hs-products__native .swiper-wrapper {
    display: grid !important;
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    gap: 20px !important;
    align-items: stretch !important;
    list-style: none !important;
  }

  .hs-products__native .productsSlider-i,
  .hs-products__native .carousel__item,
  .hs-products__native .swiper-slide {
    display: block !important;
    flex: none !important;
    width: 100% !important;
    max-width: none !important;
    min-width: 0 !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    transform: none !important;
  }

  .hs-products__native .productsSlider-i,
  .hs-products__native .catalog-card {
    display: flex !important;
    flex-direction: column !important;
    min-width: 0 !important;
    height: 100% !important;
    padding: 18px !important;
    border: 1px solid #e7e9ee !important;
    border-radius: 16px !important;
    background: #fff !important;
    box-sizing: border-box !important;
    box-shadow: 0 6px 24px rgba(20, 30, 55, 0.07) !important;
    cursor: pointer !important;
  }

  .hs-products__native .productsSlider-i::before,
  .hs-products__native .productsSlider-i::after {
    display: none !important;
    content: none !important;
  }

  .hs-products__native .productsSlider-i:hover,
  .hs-products__native .catalog-card:hover {
    z-index: 5;
    border-color: #d6dae3 !important;
    box-shadow: 0 12px 32px rgba(20, 30, 55, 0.13) !important;
    transform: translateY(-4px) !important;
  }

  .hs-products__native .productsSlider-image,
  .hs-products__native .catalog-card__image,
  .hs-products__native .catalog-card__image .image,
  .hs-products__native .catalog-card__image .image__box {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    margin: 0 0 14px !important;
    padding: 8px !important;
    aspect-ratio: 1 / 1 !important;
    overflow: hidden !important;
    background: #fff !important;
    border-radius: 12px !important;
    box-sizing: border-box !important;
  }

  .hs-products__native .productsSlider-image img,
  .hs-products__native .productsSlider-img,
  .hs-products__native .catalog-card__image img {
    position: static !important;
    inset: auto !important;
    display: block !important;
    width: auto !important;
    height: auto !important;
    max-width: 100% !important;
    max-height: 100% !important;
    margin: auto !important;
    object-fit: contain !important;
    object-position: center center !important;
    transition: transform 0.25s ease !important;
  }

  .hs-products__native .productsSlider-i:hover img,
  .hs-products__native .catalog-card:hover img {
    transform: scale(1.04) !important;
  }

  .hs-products__native .productsSlider-title,
  .hs-products__native .catalog-card__title,
  .hs-products__native .catalog-card__title a {
    min-height: 2.8em;
    margin: 0 0 12px !important;
    overflow: hidden !important;
    color: #1f2937 !important;
    font-size: 15px !important;
    font-weight: 600 !important;
    line-height: 1.4 !important;
    text-decoration: none !important;
  }

  .hs-products__native .productsSlider-price,
  .hs-products__native .catalog-card__price {
    margin-top: auto !important;
    color: #ff0000 !important;
    font-size: 19px !important;
    font-weight: 800 !important;
    line-height: 1.3 !important;
  }

  .hs-products-old-price {
    display: block !important;
    margin: 0 0 5px !important;
    color: #8a8f98 !important;
    font-size: 16px !important;
    font-weight: 500 !important;
    line-height: 1.2 !important;
    text-decoration: line-through !important;
  }

  .hs-products__native .productsSlider-order,
  .hs-products__native .catalog-card__purchase {
    display: block !important;
    width: 100% !important;
    max-width: none !important;
    margin-top: 14px !important;
    padding: 0 !important;
    box-sizing: border-box !important;
  }

  .hs-products__native .productsSlider-order .btn,
  .hs-products__native .catalog-card__buy-button,
  .hs-products__native .catalog-card__purchase .btn,
  .hs-products__native .catalog-card__buy-button > .j-buy-button-add.btn {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 100% !important;
    max-width: none !important;
    min-height: 44px !important;
    box-sizing: border-box !important;
    border-radius: 10px !important;
  }

  @media (max-width: 980px) {
    .hs-products__native .productsSlider-wrapper,
    .hs-products__native .carousel__wrapper,
    .hs-products__native .swiper-wrapper {
      grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    }
  }

  @media (max-width: 720px) {
    .hs-page-banner {
      margin-bottom: 24px;
    }

    .hs-page-banner__link {
      border-radius: 12px;
    }

    .hs-products {
      margin: 30px 0;
    }

    .hs-products__native .productsSlider-wrapper,
    .hs-products__native .carousel__wrapper,
    .hs-products__native .swiper-wrapper {
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 14px !important;
    }

    .hs-products__native .productsSlider-i,
    .hs-products__native .catalog-card {
      padding: 14px !important;
    }
  }
</style>

<script>
  (function () {
    "use strict";

    var root = document.getElementById("hs-inline-products");
    var banner = document.getElementById("hs-page-banner");
    var observer = null;

    if (!root) {
      return;
    }

    function mountBanner() {
      if (!banner) {
        return;
      }

      var imageUrl = (banner.getAttribute("data-image-url") || "").trim();

      if (!imageUrl) {
        banner.parentNode && banner.parentNode.removeChild(banner);
        return;
      }

      var link = banner.querySelector(".hs-page-banner__link") || document.createElement("a");
      var linkUrl = (banner.getAttribute("data-link-url") || "").trim();
      var image = document.createElement("img");
      var contentParent = root.parentNode;

      link.className = "hs-page-banner__link";
      if (linkUrl) {
        link.href = linkUrl;
      } else {
        link.removeAttribute("href");
      }

      image.className = "hs-page-banner__image";
      image.src = imageUrl;
      image.alt = banner.getAttribute("data-alt") || "";
      image.width = 1200;
      image.height = 400;
      image.loading = "eager";

      if ("fetchPriority" in image) {
        image.fetchPriority = "high";
      }

      link.textContent = "";
      link.appendChild(image);

      if (!link.parentNode) {
        banner.appendChild(link);
      }

      if (contentParent && contentParent.firstChild !== banner) {
        contentParent.insertBefore(banner, contentParent.firstChild);
      }

      banner.hidden = false;
    }

    function findSource() {
      var candidates = document.querySelectorAll(
        ".article__associated-products, " +
        ".page__associated-products, " +
        ".textPage__associated-products, " +
        "[class*='associated-products'], " +
        ".related-goods"
      );

      for (var i = 0; i < candidates.length; i += 1) {
        if (
          !root.contains(candidates[i]) &&
          (
            candidates[i].querySelector(".productsSlider-i") ||
            candidates[i].querySelector(".catalog-card")
          )
        ) {
          return candidates[i];
        }
      }

      return null;
    }

    function parsePrice(text) {
      var match = String(text || "").match(/\\d[\\d\\s\\u00a0]*(?:[.,]\\d{1,2})?/);

      if (!match) {
        return null;
      }

      var value = Number(match[0].replace(/[\\s\\u00a0]/g, "").replace(",", "."));

      return Number.isFinite(value) ? value : null;
    }

    function formatOldPrice(current) {
      var percent = Number(root.getAttribute("data-old-price-percent") || 0);
      var fixed = Number(root.getAttribute("data-old-price-fixed") || 0);

      if (!(percent > 0) && !(fixed > 0)) {
        return "";
      }

      var oldValue = percent > 0
        ? Math.floor((current * (1 + percent / 100)) / 10) * 10
        : Math.round((current + fixed) * 100) / 100;
      var fractionDigits = Number.isInteger(oldValue) ? 0 : 2;

      return new Intl.NumberFormat("uk-UA", {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits
      }).format(oldValue) + " грн";
    }

    function addOldPrices(source) {
      var prices = source.querySelectorAll(".productsSlider-price, .catalog-card__price");

      Array.prototype.forEach.call(prices, function (price) {
        if (price.querySelector(".hs-products-old-price")) {
          return;
        }

        var current = parsePrice(price.textContent);
        var text = current === null ? "" : formatOldPrice(current);

        if (!text) {
          return;
        }

        var oldPrice = document.createElement("span");
        oldPrice.className = "hs-products-old-price";
        oldPrice.textContent = text;
        price.insertBefore(oldPrice, price.firstChild);
      });
    }

    function addPromoParameters(source) {
      var percent = Number(root.getAttribute("data-old-price-percent") || 0);
      var fixed = Number(root.getAttribute("data-old-price-fixed") || 0);

      if (!(percent > 0) && !(fixed > 0)) {
        return;
      }

      var links = source.querySelectorAll(
        ".productsSlider-i a[href], .catalog-card a[href]"
      );

      Array.prototype.forEach.call(links, function (link) {
        try {
          var url = new URL(link.getAttribute("href"), window.location.href);

          if (!/^https?:$/.test(url.protocol) || url.origin !== window.location.origin) {
            return;
          }

          if (percent > 0) {
            url.searchParams.set("mt_old_percent", String(percent));
            url.searchParams.delete("mt_old_fixed");
          } else {
            url.searchParams.set("mt_old_fixed", String(fixed));
            url.searchParams.delete("mt_old_percent");
          }

          url.searchParams.set("mt_promo_price", "1");
          link.href = url.toString();
        } catch (error) {
          return;
        }
      });
    }

    function enableCardLinks(source) {
      var cards = source.querySelectorAll(".catalog-card");

      Array.prototype.forEach.call(cards, function (card) {
        if (card.getAttribute("data-card-link-enabled") === "true") {
          return;
        }

        var productLink = card.querySelector(
          ".catalog-card__link[href], .catalog-card__title a[href]"
        );

        if (!productLink) {
          return;
        }

        card.setAttribute("data-card-link-enabled", "true");
        card.setAttribute("role", "link");
        card.setAttribute("tabindex", "0");

        card.addEventListener("click", function (event) {
          if (
            event.defaultPrevented ||
            event.target.closest("a, button, input, select, textarea, label, [role='button']")
          ) {
            return;
          }

          window.location.href = productLink.href;
        });

        card.addEventListener("keydown", function (event) {
          if (event.key === "Enter" && event.target === card) {
            window.location.href = productLink.href;
          }
        });
      });
    }

    function mountProducts() {
      if (root.getAttribute("data-initialized") === "true") {
        return true;
      }

      var source = findSource();

      if (!source) {
        return false;
      }

      var mount = root.querySelector(".hs-products__mount");

      if (!mount) {
        return false;
      }

      Array.prototype.forEach.call(
        source.querySelectorAll(".swiper-slide-duplicate"),
        function (duplicate) {
          duplicate.parentNode && duplicate.parentNode.removeChild(duplicate);
        }
      );

      source.classList.add("hs-products__native");
      mount.appendChild(source);

      Array.prototype.forEach.call(
        source.querySelectorAll(".swiper-slide-active, .swiper-slide-prev, .swiper-slide-next, .swiper-slide-visible"),
        function (card) {
          card.classList.remove(
            "swiper-slide-active",
            "swiper-slide-prev",
            "swiper-slide-next",
            "swiper-slide-visible"
          );
        }
      );

      addOldPrices(source);
      addPromoParameters(source);
      enableCardLinks(source);
      root.hidden = false;
      root.setAttribute("data-initialized", "true");

      if (observer) {
        observer.disconnect();
      }

      return true;
    }

    function start() {
      try {
        mountBanner();
      } catch (error) {
        if (banner) {
          banner.hidden = true;
        }
      }

      if (mountProducts()) {
        return;
      }

      observer = new MutationObserver(mountProducts);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });

      window.setTimeout(function () {
        if (observer) {
          observer.disconnect();
        }
      }, 8000);
    }

    if (document.readyState === "complete") {
      start();
    } else {
      window.addEventListener("load", start, { once: true });
    }
  })();
</script>
<!-- MT INLINE PRODUCTS END -->`;

  return meta ? `${meta}\n${content}` : content;
}

export function buildGlobalProductCode(): string {
  return `<!-- MT GLOBAL PRODUCT PRICE START -->
<style type="text/css">
  .mt-product-price-stack {
    display: flex !important;
    flex-direction: column !important;
    align-items: flex-start !important;
  }

  .mt-product-current-price {
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
</style>

<script>
  (function () {
    "use strict";

    var params = new URLSearchParams(location.search);
    var enabled = params.get("mt_promo_price") === "1";
    var percent = Number(params.get("mt_old_percent") || 0);
    var fixed = Number(params.get("mt_old_fixed") || 0);

    if (!enabled || (!(percent > 0) && !(fixed > 0))) {
      return;
    }

    function parsePrice(text) {
      var match = String(text || "").match(/\\d[\\d\\s\\u00a0]*(?:[.,]\\d{1,2})?/);

      if (!match) {
        return null;
      }

      var value = Number(match[0].replace(/[\\s\\u00a0]/g, "").replace(",", "."));

      return Number.isFinite(value) ? value : null;
    }

    function apply() {
      var selectors = [
        ".product-card__price",
        ".product-price__item",
        ".product-price__current",
        ".product-price__value",
        ".product-price",
        ".product__price",
        ".product-info__price",
        "[itemprop='price']:not(meta)"
      ];

      for (var i = 0; i < selectors.length; i += 1) {
        var nodes = document.querySelectorAll(selectors[i]);

        for (var j = 0; j < nodes.length; j += 1) {
          var price = nodes[j];
          var value = parsePrice(price.textContent);

          if (value === null || price.querySelector(".mt-product-old-price")) {
            continue;
          }

          var oldValue = percent > 0
            ? Math.floor((value * (1 + percent / 100)) / 10) * 10
            : Math.round((value + fixed) * 100) / 100;
          var fractionDigits = Number.isInteger(oldValue) ? 0 : 2;
          var oldPrice = document.createElement("span");

          oldPrice.className = "mt-product-old-price";
          oldPrice.textContent = new Intl.NumberFormat("uk-UA", {
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits
          }).format(oldValue) + " грн";

          price.classList.add("mt-product-current-price");
          price.parentNode.classList.add("mt-product-price-stack");
          price.parentNode.insertBefore(oldPrice, price);
          return true;
        }
      }

      return false;
    }

    apply();

    var observer = new MutationObserver(apply);
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  })();
</script>
<!-- MT GLOBAL PRODUCT PRICE END -->`;
}
