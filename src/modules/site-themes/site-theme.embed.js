import { promoBarStyleDefaults } from './site-theme-promo-bar.js';
import { mountPromoBarMarquee, promoBarBackgroundImage } from './site-theme-presentation.js';

export const siteThemeEmbedPath = '/api/public/site-themes/embed.js?v=3';

function installSiteThemePromoBar(browser, configPath, defaults, backgroundImage, mountMarquee) {
  const { document, location, navigator } = browser;
  const scriptUrl = document.currentScript?.src;
  if (!scriptUrl) return;

  const selector = '[data-mt-site-promo-bar]';
  const configUrl = new URL(configPath, scriptUrl);
  const isMobile = navigator.userAgentData?.mobile === true
    || /Android|iPhone|iPad|iPod|Mobile/iu.test(navigator.userAgent)
    || browser.matchMedia('(max-width: 767px) and (pointer: coarse)').matches;

  function safeLink(value) {
    if (!value) return null;
    try {
      const url = new URL(value, location.origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function mountBar(config) {
    if (document.querySelector(selector) || !config) return;
    if (isMobile ? !config.showMobile : !config.showDesktop) return;

    const bar = document.createElement('aside');
    bar.dataset.mtSitePromoBar = '';
    bar.setAttribute('aria-label', 'Промоакція');
    Object.assign(bar.style, {
      display: 'block',
      width: '100%',
      margin: '0',
      boxSizing: 'border-box',
      backgroundColor: config.backgroundColor,
      backgroundImage: backgroundImage(config.backgroundImageUrl, configUrl.origin),
      backgroundPosition: 'center',
      backgroundSize: 'cover',
      backgroundRepeat: 'no-repeat',
      color: config.textColor,
      font: 'inherit',
      lineHeight: '1.4'
    });

    const inner = document.createElement('div');
    inner.dataset.mtSitePromoInner = '';
    Object.assign(inner.style, {
      boxSizing: 'border-box',
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: { left: 'flex-start', center: 'center', right: 'flex-end' }[config.alignment],
      gap: '8px 12px',
      maxWidth: '1440px',
      margin: '0 auto',
      padding: `${config.paddingY}px ${config.paddingX}px`,
      textAlign: config.alignment
    });

    const message = document.createElement('span');
    message.textContent = config.text;
    Object.assign(message.style, {
      minWidth: '0',
      overflowWrap: 'anywhere',
      whiteSpace: 'pre-wrap',
      fontSize: `${config.textFontSize ?? defaults.textFontSize}px`,
      fontWeight: String(config.textFontWeight ?? defaults.textFontWeight)
    });
    const marquee = config.mode === 'marquee';
    const messageContainer = marquee ? document.createElement('div') : inner;
    if (marquee) {
      messageContainer.dataset.mtSitePromoMarquee = '';
      Object.assign(messageContainer.style, { flex: '1 1 100%', minWidth: '0', position: 'relative', overflow: 'hidden' });
      inner.append(messageContainer);
    }
    messageContainer.append(message);

    const href = marquee ? null : safeLink(config.buttonUrl);
    if (config.buttonText && href) {
      const button = document.createElement('a');
      button.textContent = config.buttonText;
      button.href = href;
      Object.assign(button.style, {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        minHeight: '36px',
        maxWidth: '100%',
        padding: `${config.buttonPaddingY ?? defaults.buttonPaddingY}px ${config.buttonPaddingX ?? defaults.buttonPaddingX}px`,
        borderRadius: '6px',
        backgroundColor: config.buttonColor,
        color: config.buttonTextColor,
        fontSize: `${config.buttonFontSize ?? defaults.buttonFontSize}px`,
        fontWeight: String(config.buttonFontWeight ?? defaults.buttonFontWeight),
        overflowWrap: 'anywhere',
        textDecoration: 'none'
      });
      inner.append(button);
    }

    bar.append(inner);
    document.body.prepend(bar);
    if (marquee) mountMarquee(messageContainer, message, config.marqueeSpeed ?? defaults.marqueeSpeed);
  }

  async function start() {
    if (document.querySelector(selector)) return;
    try {
      const response = await browser.fetch(configUrl, { credentials: 'omit' });
      if (!response.ok) return;
      const { data } = await response.json();
      mountBar(data);
    } catch {
      return;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    void start();
  }
}

export function siteThemeEmbedScript() {
  return `(${installSiteThemePromoBar.toString()})(
    window, '/api/public/site-themes/promo-bar', ${JSON.stringify(promoBarStyleDefaults)},
    ${promoBarBackgroundImage.toString()}, ${mountPromoBarMarquee.toString()}
  );`;
}
