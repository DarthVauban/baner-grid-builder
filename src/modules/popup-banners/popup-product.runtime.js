// Serialized into the public embed. Keep this function self-contained.
export function createProductPopupRuntime(document) {
  const css = `
    .backdrop.is-product-popup{align-items:center;justify-content:center;padding:18px}
    .card.is-product-popup{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);margin:0;box-sizing:border-box;overscroll-behavior:contain;isolation:isolate}
    .product-popup-media{display:block;min-width:0;min-height:440px;align-self:stretch;background:#f4f1ff}
    .product-popup-image{display:block;width:100%;height:100%;min-height:440px;object-fit:cover}
    .product-popup-placeholder{display:grid;place-items:center;min-height:440px;padding:30px;box-sizing:border-box;color:#667085;text-align:center;background:#f4f1ff}
    .product-popup-content{display:flex;min-width:0;flex-direction:column;justify-content:center;box-sizing:border-box}
    .product-popup-element{box-sizing:border-box;max-width:100%;margin:0;line-height:1.25;overflow-wrap:anywhere;white-space:pre-line;letter-spacing:normal;text-transform:none}
    .product-popup-price-block{display:grid;gap:8px}
    .product-popup-savings{align-self:flex-start}
    .product-popup-buy{display:block;width:100%;min-height:44px;cursor:pointer}
    .product-popup-buy:disabled{opacity:.6;cursor:wait}
    .product-popup-details{display:block;text-decoration:none;min-height:36px}
    .product-popup-details:hover{text-decoration:underline}
    .card.is-product-popup .close{width:auto;min-width:38px;height:auto;min-height:38px;line-height:1;top:12px;right:12px}
    .card.is-product-popup :is(button,a):focus-visible{outline:3px solid var(--accent);outline-offset:3px}
    @media(max-width:640px){
      .backdrop.is-product-popup{padding:12px}
      .card.is-product-popup{grid-template-columns:minmax(0,1fr);max-height:calc(100dvh - 24px);border-radius:var(--radius);margin:0}
      .product-popup-media{aspect-ratio:1;min-height:0;align-self:start}
      .product-popup-image{aspect-ratio:1;height:auto;min-height:0;object-fit:cover}
      .product-popup-placeholder{aspect-ratio:1;min-height:0}
      .card.is-product-popup .product-popup-element,.card.is-product-popup .close{font-size:var(--product-font-mobile)!important}
      .product-popup-content{padding:var(--product-padding-mobile)!important;gap:var(--product-gap-mobile)!important}
    }
  `;
  const rgba = (hex, opacity) => {
    const value = /^#[0-9a-f]{6}$/iu.test(hex || '') ? hex.slice(1) : 'ffffff';
    return 'rgba(' + [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16)).join(',') + ',' + Math.max(0, Math.min(100, Number(opacity) || 0)) / 100 + ')';
  };
  const number = (value) => Number(String(value || '').replace(/\s/gu, '').replace(',', '.'));
  const money = (value, currency) => {
    const amount = number(value);
    if (!Number.isFinite(amount) || amount <= 0) return '';
    return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(amount)
      + ' ' + (currency === 'UAH' ? '₴' : currency || '₴');
  };
  function styleElement(node, value = {}) {
    node.style.setProperty('--product-font-desktop', value.fontSize + 'px');
    node.style.setProperty('--product-font-mobile', (value.fontSizeMobile || value.fontSize) + 'px');
    const fonts = { Inter: 'Inter,system-ui,sans-serif', Arial: 'Arial,sans-serif', Georgia: 'Georgia,serif', 'system-ui': 'system-ui,sans-serif' };
    Object.assign(node.style, {
      color: value.color, backgroundColor: rgba(value.backgroundColor, value.backgroundOpacity),
      fontSize: 'var(--product-font-desktop)', fontWeight: String(value.fontWeight), fontFamily: fonts[value.fontFamily] || fonts.Inter,
      textAlign: value.textAlign, borderColor: value.borderColor, borderStyle: 'solid', borderWidth: value.borderWidth + 'px',
      borderRadius: value.borderRadius + 'px', padding: value.paddingY + 'px ' + value.paddingX + 'px'
    });
  }
  function render({ card, backdrop, campaign, product, imageUrl, onBuy, onDetails }) {
    const config = campaign.productPopup;
    const elements = config.elements;
    const node = (tag, key, text) => {
      const item = document.createElement(tag);
      item.className = 'product-popup-element product-popup-' + key;
      item.textContent = text;
      styleElement(item, elements[key]);
      return item;
    };
    backdrop.classList.add('is-product-popup');
    backdrop.style.backgroundColor = rgba(config.overlayColor, config.overlayOpacity);
    card.classList.add('is-product-popup');
    card.style.border = config.borderWidth + 'px solid ' + config.borderColor;
    const closeButton = card.querySelector('.close');
    if (closeButton) styleElement(closeButton, elements.closeButton);
    if (campaign.content.imageUrl) {
      const picture = document.createElement('picture'); picture.className = 'product-popup-media';
      if (config.mobileImageUrl) {
        const source = document.createElement('source'); source.media = '(max-width:640px)';
        source.srcset = imageUrl(config.mobileImageUrl); picture.append(source);
      }
      const image = document.createElement('img'); image.className = 'product-popup-image';
      image.src = imageUrl(campaign.content.imageUrl); image.alt = ''; picture.append(image); card.append(picture);
    } else {
      const placeholder = document.createElement('div'); placeholder.className = 'product-popup-placeholder';
      placeholder.textContent = 'Завантажте зображення 880 × 1000 px'; card.append(placeholder);
    }
    const content = document.createElement('div'); content.className = 'product-popup-content';
    content.style.padding = config.contentPadding + 'px'; content.style.gap = config.contentGap + 'px';
    content.style.setProperty('--product-padding-mobile', config.contentPaddingMobile + 'px');
    content.style.setProperty('--product-gap-mobile', config.contentGapMobile + 'px');
    if (campaign.content.eyebrow) content.append(node('p', 'eyebrow', campaign.content.eyebrow));
    const heading = node('h2', 'heading', campaign.content.title || 'Спеціальна пропозиція');
    heading.id = 'mt-popup-title-' + campaign.publicId;
    card.setAttribute('aria-labelledby', heading.id); content.append(heading);
    content.append(node('p', 'productTitle', config.titleOverride || product?.title || 'Оберіть товар із каталогу'));
    const prices = document.createElement('div'); prices.className = 'product-popup-price-block';
    const oldPrice = config.oldPriceSource === 'manual' ? config.manualOldPrice : product?.oldPrice;
    const validDiscount = number(oldPrice) > number(product?.price) && number(product?.price) > 0;
    if (config.showOldPrice && validDiscount) prices.append(node('del', 'oldPrice', money(oldPrice, product?.currency)));
    prices.append(node('strong', 'price', money(product?.price, product?.currency) || 'Ціна з каталогу'));
    content.append(prices);
    if (config.showSavings && validDiscount) {
      const saving = node('span', 'savings', [config.savingsLabel, money((number(oldPrice) - number(product.price)).toFixed(2), product.currency)].filter(Boolean).join(' '));
      saving.style.alignSelf = { left: 'flex-start', center: 'center', right: 'flex-end' }[elements.savings.textAlign];
      content.append(saving);
    }
    const buy = node('button', 'buyButton', campaign.content.primaryLabel || 'Додати до кошика');
    buy.classList.add('product-popup-buy'); buy.type = 'button'; buy.disabled = !product;
    buy.addEventListener('click', () => onBuy(buy)); content.append(buy);
    if (product?.pageUrl) {
      const details = node('a', 'detailsButton', campaign.content.secondaryLabel || 'Детальніше');
      details.classList.add('product-popup-details'); details.href = product.pageUrl;
      details.addEventListener('click', onDetails); content.append(details);
    }
    card.append(content);
    return buy;
  }
  return { css, render };
}
