import { promoBarStyleDefaults } from './site-theme-promo-bar.js';
import { mountPromoBarGoldGlint, mountPromoBarMarquee, promoBarBackgroundImage } from './site-theme-presentation.js';
import { mountSiteThemeConfetti, mountSiteThemeCornerRibbons } from './site-theme-storefront-effects.js';

export const siteThemeEmbedPath = '/api/public/site-themes/embed.js?v=7';

function installSiteTheme(browser, configPath, defaults, backgroundImage, mountMarquee, mountGoldGlint, mountRibbons, mountConfetti) {
  const { document, location, navigator } = browser;
  const scriptUrl = document.currentScript?.src;
  if (!scriptUrl) return;

  const selector = '[data-mt-site-promo-bar]';
  const mountedSelector = `${selector}, [data-mt-site-theme-effects]`;
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

  function alignMobileHeader(bar) {
    const header = document.querySelector('header#header.header');
    if (!header) return;
    const style = browser.getComputedStyle(header);
    if (style.position !== 'fixed' || style.top !== '0px') return;

    const originalTop = header.style.getPropertyValue('top');
    const originalPriority = header.style.getPropertyPriority('top');
    let appliedTop = '';
    let frame = 0;

    function restore() {
      if (appliedTop && header.style.getPropertyValue('top') === appliedTop) {
        header.style.setProperty('top', originalTop, originalPriority);
      }
      appliedTop = '';
    }

    function update() {
      frame = 0;
      if (!bar.isConnected || !header.isConnected) {
        observer?.disconnect();
        browser.removeEventListener('scroll', schedule);
        browser.removeEventListener('resize', schedule);
        restore();
        return;
      }

      // The native fixed header already has its own space reserved in the page.
      // Offset it only by the portion of the in-flow promo strip still visible.
      const rect = bar.getBoundingClientRect();
      const offset = Math.max(0, Math.min(rect.height, rect.bottom));
      if (offset === 0) {
        restore();
        return;
      }
      const top = `${offset}px`;
      if (header.style.getPropertyValue('top') !== top) header.style.setProperty('top', top, originalPriority);
      appliedTop = header.style.getPropertyValue('top');
    }

    function schedule() {
      if (!frame) frame = browser.requestAnimationFrame(update);
    }

    const observer = browser.ResizeObserver ? new browser.ResizeObserver(schedule) : null;
    observer?.observe(bar, { box: 'border-box' });
    browser.addEventListener('scroll', schedule, { passive: true });
    browser.addEventListener('resize', schedule);
    update();
  }

  function mountBar(config) {
    if (document.querySelector(selector) || !config) return;
    if (isMobile ? !config.showMobile : !config.showDesktop) return;

    const bar = document.createElement('aside');
    bar.dataset.mtSitePromoBar = '';
    bar.setAttribute('aria-label', 'Промоакція');
    Object.assign(bar.style, {
      display: 'block',
      position: 'relative',
      isolation: 'isolate',
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
      position: 'relative',
      zIndex: '1',
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
    const scrollTop = browser.scrollY;
    document.body.prepend(bar);
    const barHeight = bar.getBoundingClientRect().height;
    // Undo scroll anchoring when prepending the bar would push it out of view near the top.
    if (scrollTop >= 0 && scrollTop < barHeight && Math.abs(browser.scrollY - scrollTop - barHeight) < 1) {
      browser.scrollTo({ top: scrollTop, behavior: 'instant' });
    }
    if (isMobile) alignMobileHeader(bar);
    if (marquee) mountMarquee(messageContainer, message, config.marqueeSpeed ?? defaults.marqueeSpeed);
    if (config.goldGlint) mountGoldGlint(bar, config.goldGlint);
  }

  async function start() {
    if (document.querySelector(mountedSelector)) return;
    try {
      const response = await browser.fetch(configUrl, { credentials: 'omit' });
      if (!response.ok) return;
      const { data } = await response.json();
      if (!data || document.querySelector(mountedSelector)) return;
      mountBar(data.promoBar);
      const { cornerRibbons, confetti } = data.storefrontEffects;
      if (!cornerRibbons && !confetti) return;
      const host = document.createElement('div');
      host.dataset.mtSiteThemeEffects = '';
      host.setAttribute('aria-hidden', 'true');
      Object.assign(host.style, { position: 'absolute', inset: '0 0 auto', height: '0', zIndex: '1000', pointerEvents: 'none' });
      document.body.append(host);
      const viewport = isMobile ? 'mobile' : 'desktop';
      if (cornerRibbons) mountRibbons(host, cornerRibbons, viewport, backgroundImage, configUrl.origin);
      if (confetti) mountConfetti(host, confetti, viewport, data.themeId);
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
  return `(${installSiteTheme.toString()})(
    window, '/api/public/site-themes/appearance', ${JSON.stringify(promoBarStyleDefaults)},
    ${promoBarBackgroundImage.toString()}, ${mountPromoBarMarquee.toString()}, ${mountPromoBarGoldGlint.toString()},
    ${mountSiteThemeCornerRibbons.toString()}, ${mountSiteThemeConfetti.toString()}
  );`;
}
