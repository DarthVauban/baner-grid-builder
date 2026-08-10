const EMBED_STYLES = `.mt-banner-grid {
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 500px)) !important;
  gap: 24px !important;
  justify-content: space-between !important;
  width: 100% !important;
  box-sizing: border-box !important;
}

.mt-banner-grid .mt-banner-item {
  display: block !important;
  width: 100% !important;
  max-width: 500px !important;
  margin: 0 !important;
  padding: 0 !important;
  box-sizing: border-box !important;
}

.mt-banner-grid .mt-banner-card {
  display: grid !important;
  grid-template-rows: auto 100px !important;
  width: 100% !important;
  max-width: 500px !important;
  height: auto !important;
  max-height: 382px !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  border: 0 !important;
  border-radius: 10px !important;
  background: #000 !important;
  color: #fff !important;
  text-decoration: none !important;
  box-sizing: border-box !important;
}

.mt-banner-grid .mt-banner-card--disabled {
  cursor: default !important;
  filter: grayscale(1) !important;
  opacity: .58 !important;
  pointer-events: none !important;
}

.mt-banner-grid .mt-banner-media {
  display: block !important;
  width: 100% !important;
  height: auto !important;
  aspect-ratio: 16 / 9 !important;
  overflow: hidden !important;
  background: #111 !important;
}

.mt-banner-grid .mt-banner-img {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  border: 0 !important;
  object-fit: cover !important;
  object-position: center !important;
}

.mt-banner-grid .mt-banner-info {
  display: block !important;
  width: 100% !important;
  height: 100px !important;
  padding: 9px 18px !important;
  overflow: hidden !important;
  background: #000 !important;
  box-sizing: border-box !important;
}

.mt-banner-grid .mt-banner-title {
  display: -webkit-box !important;
  overflow: hidden !important;
  margin: 0 !important;
  color: #fff !important;
  font-family: Arial, sans-serif !important;
  font-size: 20px !important;
  font-weight: 900 !important;
  line-height: 20px !important;
  letter-spacing: -.04em !important;
  -webkit-box-orient: vertical !important;
  -webkit-line-clamp: 2 !important;
}

.mt-banner-grid .mt-banner-title-accent {
  color: #ffe001 !important;
}

.mt-banner-grid .mt-banner-date {
  display: inline-flex !important;
  align-items: center !important;
  min-height: 30px !important;
  margin: 10px 0 0 !important;
  padding: 6px 12px !important;
  border-radius: 6px !important;
  background: #ffe001 !important;
  color: #000 !important;
  font-family: Arial, sans-serif !important;
  font-size: 14px !important;
  font-weight: 800 !important;
  line-height: 18px !important;
  box-sizing: border-box !important;
}

@media (max-width: 1279px) {
  .mt-banner-grid {
    grid-template-columns: repeat(2, minmax(0, 500px)) !important;
  }
}

@media (max-width: 768px) {
  .mt-banner-grid {
    grid-template-columns: minmax(0, 500px) !important;
    gap: 16px !important;
  }
}`;

function publicHttpUrl(value, origin) {
  const source = String(value || '').trim();
  if (!source) return '';
  try {
    const parsed = new URL(source, origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

export function buildBannerGridEmbedPayload(row, origin) {
  const banners = Array.isArray(row?.banners) ? row.banners : [];
  return {
    id: String(row?.id || ''),
    banners: banners.map((banner) => ({
      title: String(banner?.title || '').trim(),
      endDate: String(banner?.endDate || '').trim(),
      endTime: String(banner?.endTime || '').trim(),
      imageUrl: publicHttpUrl(banner?.imageUrl, origin),
      targetUrl: publicHttpUrl(banner?.targetUrl, origin),
      disableWhenExpired: Boolean(banner?.disableWhenExpired)
    })).filter((banner) => banner.title && banner.endDate && banner.imageUrl && banner.targetUrl)
  };
}

export function bannerGridEmbedScript(row, origin) {
  const payload = buildBannerGridEmbedPayload(row, origin);
  return `(function () {
  "use strict";

  var sourceScript = document.currentScript;
  if (!sourceScript) return;

  var payload = ${JSON.stringify(payload)};
  var styleId = "mt-banner-grid-embed-styles";

  function installStyles() {
    if (document.getElementById(styleId)) return;
    var style = document.createElement("style");
    style.id = styleId;
    style.type = "text/css";
    style.textContent = ${JSON.stringify(EMBED_STYLES)};
    (document.head || document.documentElement).appendChild(style);
  }

  function endTime(card) {
    var date = (card.getAttribute("data-mt-end-date") || "").split("-").map(Number);
    var time = (card.getAttribute("data-mt-end-time") || "23:59").split(":").map(Number);
    var result = new Date(date[0], date[1] - 1, date[2], time[0], time[1], 59, 999).getTime();
    return Number.isFinite(result) ? result : 0;
  }

  function dayWord(value) {
    var absolute = Math.abs(value);
    var lastTwo = absolute % 100;
    var last = absolute % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return "днів";
    if (last === 1) return "день";
    if (last >= 2 && last <= 4) return "дні";
    return "днів";
  }

  function appendTitle(element, title) {
    var parts = String(title).split(/(-\\s*\\d+(?:[.,]\\d+)?\\s*%)/g);
    for (var index = 0; index < parts.length; index += 1) {
      if (/^-\\s*\\d+(?:[.,]\\d+)?\\s*%$/.test(parts[index])) {
        var accent = document.createElement("span");
        accent.className = "mt-banner-title-accent";
        accent.textContent = parts[index];
        element.appendChild(accent);
      } else if (parts[index]) {
        element.appendChild(document.createTextNode(parts[index]));
      }
    }
  }

  function createBanner(banner) {
    var item = document.createElement("div");
    item.className = "mt-banner-item";

    var card = document.createElement("a");
    card.className = "mt-banner-card";
    card.href = banner.targetUrl;
    card.setAttribute("data-mt-end-date", banner.endDate);
    card.setAttribute("data-mt-end-time", banner.endTime || "23:59");
    if (banner.disableWhenExpired) card.setAttribute("data-mt-disable-expired", "true");

    var media = document.createElement("span");
    media.className = "mt-banner-media";
    var image = document.createElement("img");
    image.className = "mt-banner-img";
    image.src = banner.imageUrl;
    image.alt = banner.title;
    image.loading = "lazy";
    media.appendChild(image);

    var info = document.createElement("span");
    info.className = "mt-banner-info";
    var title = document.createElement("span");
    title.className = "mt-banner-title";
    appendTitle(title, banner.title);
    var date = document.createElement("span");
    date.className = "mt-banner-date";
    info.appendChild(title);
    info.appendChild(date);
    card.appendChild(media);
    card.appendChild(info);
    item.appendChild(card);
    return item;
  }

  function mount() {
    installStyles();
    var containerId = sourceScript.getAttribute("data-container") || "";
    var container = containerId ? document.getElementById(containerId) : null;
    if (!container) {
      container = document.createElement("div");
      var parent = sourceScript.parentNode;
      if (parent && parent !== document.head) parent.insertBefore(container, sourceScript.nextSibling);
      else (document.body || document.documentElement).appendChild(container);
    }

    var grid = document.createElement("div");
    grid.className = "mt-banner-grid";
    grid.setAttribute("data-mt-grid-id", payload.id);
    for (var index = 0; index < payload.banners.length; index += 1) {
      grid.appendChild(createBanner(payload.banners[index]));
    }
    container.appendChild(grid);

    function refresh() {
      var cards = grid.querySelectorAll(".mt-banner-card[data-mt-end-date]");
      for (var cardIndex = 0; cardIndex < cards.length; cardIndex += 1) {
        var card = cards[cardIndex];
        var left = endTime(card) - Date.now();
        var label = card.querySelector(".mt-banner-date");
        var expired = left < 0;
        if (label) {
          if (expired) label.textContent = "Акція завершена";
          else if (left >= 86400000) {
            var days = Math.floor(left / 86400000);
            label.textContent = "До закінчення акції " + days + " " + dayWord(days);
          } else {
            var minutes = Math.max(0, Math.floor(left / 60000));
            label.textContent = "До закінчення акції " + Math.floor(minutes / 60) + " год " + String(minutes % 60).padStart(2, "0") + " хв";
          }
        }
        if (expired && card.getAttribute("data-mt-disable-expired") === "true") {
          card.classList.add("mt-banner-card--disabled");
          card.removeAttribute("href");
          card.setAttribute("aria-disabled", "true");
          card.setAttribute("tabindex", "-1");
        }
      }
    }

    refresh();
    window.setInterval(refresh, 60000);
  }

  if (document.readyState === "loading" && sourceScript.parentNode === document.head) {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();`;
}
