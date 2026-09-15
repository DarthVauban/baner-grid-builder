function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</gu, '\\u003c')
    .replace(/\u2028/gu, '\\u2028')
    .replace(/\u2029/gu, '\\u2029');
}

export function checkoutTelegramEmbedScript(config) {
  return `(() => {
  const config = ${safeJson(config)};
  const marker = 'data-mt-checkout-telegram';
  const styleId = 'mt-checkout-telegram-style-v1';

  if (!/^\\/checkout\\/complete\\/[^/]+\\/?$/u.test(window.location.pathname)) return;

  function ensureStyle() {
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = \`
      [data-mt-checkout-telegram="v1"] {
        --mt-checkout-telegram-button: ${config.buttonBackgroundColor};
        --mt-checkout-telegram-button-hover: ${config.buttonHoverBackgroundColor};
        --mt-checkout-telegram-text: ${config.buttonTextColor};
        --mt-checkout-telegram-border: ${config.buttonBorderColor};
        --mt-checkout-telegram-radius: ${config.buttonBorderRadius}px;
        --mt-checkout-telegram-font-size: ${config.buttonFontSize}px;
        --mt-checkout-telegram-qr-size: ${config.qrSize}px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        width: min(100%, ${Math.max(280, config.qrSize + 48)}px);
        margin: 0 auto;
        padding: 30px 18px;
      }
      [data-mt-checkout-telegram-surface="mobile"] {
        --mt-checkout-telegram-font-size: ${config.mobileButtonFontSize}px;
        --mt-checkout-telegram-qr-size: ${config.mobileQrSize}px;
        width: min(100%, ${Math.max(280, config.mobileQrSize + 48)}px);
      }
      section.checkout.__success[data-mt-checkout-telegram-layout="v1"] {
        position: relative;
      }
      section.checkout.__success > .mt-checkout-telegram__desktop-slot {
        position: absolute;
        display: grid;
        place-items: start center;
      }
      [data-mt-checkout-telegram="v1"] *, [data-mt-checkout-telegram="v1"] *::before, [data-mt-checkout-telegram="v1"] *::after {
        box-sizing: border-box;
      }
      [data-mt-checkout-telegram="v1"] .mt-checkout-telegram__qr-link {
        display: block;
        max-width: 100%;
        border-radius: 8px;
        line-height: 0;
      }
      [data-mt-checkout-telegram="v1"] .mt-checkout-telegram__qr {
        display: block;
        width: var(--mt-checkout-telegram-qr-size);
        max-width: 100%;
        height: auto;
      }
      [data-mt-checkout-telegram="v1"] .mt-checkout-telegram__button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--mt-checkout-telegram-qr-size);
        max-width: 100%;
        min-height: 48px;
        margin-top: 18px;
        padding: 12px 18px;
        border: 1px solid var(--mt-checkout-telegram-border);
        border-radius: var(--mt-checkout-telegram-radius);
        background: var(--mt-checkout-telegram-button);
        color: var(--mt-checkout-telegram-text) !important;
        font-family: inherit;
        font-size: var(--mt-checkout-telegram-font-size);
        font-weight: 700;
        line-height: 1.25;
        text-align: center;
        text-decoration: none !important;
        transition: background-color 160ms ease, border-color 160ms ease, transform 160ms ease;
      }
      [data-mt-checkout-telegram="v1"] .mt-checkout-telegram__button:hover,
      [data-mt-checkout-telegram="v1"] .mt-checkout-telegram__button:focus-visible {
        background: var(--mt-checkout-telegram-button-hover);
        border-color: var(--mt-checkout-telegram-button-hover);
      }
      [data-mt-checkout-telegram="v1"] .mt-checkout-telegram__button:active { transform: translateY(1px); }
      @media (max-width: 767px) {
        [data-mt-checkout-telegram="v1"] { padding: 22px 12px 8px; }
      }
    \`;
    document.head.appendChild(style);
  }

  function createCard(surface) {
    const isMobile = surface === 'mobile';
    const qrSize = isMobile ? config.mobileQrSize : config.qrSize;
    const card = document.createElement('section');
    card.setAttribute(marker, 'v1');
    card.setAttribute('data-mt-checkout-telegram-surface', surface);
    card.setAttribute('aria-label', config.buttonText);

    const qrLink = document.createElement('a');
    qrLink.className = 'mt-checkout-telegram__qr-link';
    qrLink.href = config.telegramUrl;
    qrLink.target = '_blank';
    qrLink.rel = 'noopener noreferrer';
    qrLink.setAttribute('aria-label', config.buttonText);

    const qr = document.createElement('img');
    qr.className = 'mt-checkout-telegram__qr';
    qr.src = isMobile ? config.mobileQrCodeDataUrl : config.qrCodeDataUrl;
    qr.width = qrSize;
    qr.height = qrSize;
    qr.alt = 'QR-код для переходу в Telegram';
    qr.decoding = 'async';
    qrLink.appendChild(qr);

    const button = document.createElement('a');
    button.className = 'mt-checkout-telegram__button';
    button.href = config.telegramUrl;
    button.target = '_blank';
    button.rel = 'noopener noreferrer';
    button.textContent = config.buttonText;

    card.append(qrLink, button);
    return card;
  }

  function layoutDesktopSlot(root, main, slot) {
    const rootRect = root.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    slot.style.top = Math.max(0, Math.round(mainRect.top - rootRect.top)) + 'px';
    slot.style.left = Math.max(0, Math.round(mainRect.right - rootRect.left)) + 'px';
    slot.style.width = Math.max(0, Math.round(rootRect.right - mainRect.right)) + 'px';
  }

  function mountDesktop() {
    const root = document.querySelector('section.checkout.__success');
    const main = root && root.querySelector(':scope > .checkout-main');
    if (!root || !main) return false;
    if (root.querySelector('[' + marker + '="v1"]')) return true;
    const rootRect = root.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    if (rootRect.right - mainRect.right < 260) return false;

    const slot = document.createElement('div');
    slot.className = 'mt-checkout-telegram__desktop-slot';
    slot.setAttribute('aria-hidden', 'false');
    slot.appendChild(createCard('desktop'));
    root.setAttribute('data-mt-checkout-telegram-layout', 'v1');
    root.appendChild(slot);
    layoutDesktopSlot(root, main, slot);
    window.addEventListener('resize', () => layoutDesktopSlot(root, main, slot), { passive: true });
    return true;
  }

  function mountMobile() {
    const success = document.querySelector('.checkout-success');
    const root = success && success.parentElement;
    if (!success || !root) return false;
    if (root.querySelector('[' + marker + '="v1"]')) return true;
    success.insertAdjacentElement('afterend', createCard('mobile'));
    return true;
  }

  function mount() {
    ensureStyle();
    mountDesktop() || mountMobile();
  }

  mount();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  }
})();`;
}
