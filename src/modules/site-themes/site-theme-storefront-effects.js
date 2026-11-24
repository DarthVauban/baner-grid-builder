export function mountSiteThemeCornerRibbons(host, config, viewport, backgroundImage, origin) {
  const layout = config[viewport];
  if (!config.opacity || layout.placement === 'hidden') return;

  const document = host.ownerDocument;
  const layer = document.createElement('div');
  layer.dataset.mtSiteThemeRibbons = '';
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, {
    position: 'absolute', inset: '0 0 auto', height: '0', zIndex: '10', pointerEvents: 'none'
  });

  const image = backgroundImage(config.imageUrl, origin);
  const corners = layout.placement === 'both' ? ['left', 'right'] : [layout.placement];
  for (const corner of corners) {
    const ribbon = document.createElement('div');
    ribbon.dataset.mtSiteThemeRibbon = corner;
    Object.assign(ribbon.style, {
      position: 'absolute',
      top: '0',
      [corner]: '0',
      width: `min(${layout.size}px, 48%)`,
      aspectRatio: '1 / 1',
      overflow: 'hidden',
      opacity: String(config.opacity / 100),
      transform: corner === 'right' ? 'scaleX(-1)' : '',
      backgroundImage: image,
      backgroundSize: 'contain',
      backgroundPosition: 'top left',
      backgroundRepeat: 'no-repeat'
    });
    if (!image) {
      const band = document.createElement('div');
      Object.assign(band.style, {
        position: 'absolute',
        left: '-33%',
        top: '18%',
        width: '145%',
        height: '22%',
        transform: 'rotate(-45deg)',
        background: 'linear-gradient(180deg, #8d5e18 0%, #ffe6a0 10%, #c28628 17%, #251b10 20%, #101010 54%, #332410 79%, #ffe39a 85%, #a36e21 100%)',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)'
      });
      ribbon.append(band);
    }
    layer.append(ribbon);
  }

  host.append(layer);
  return () => layer.remove();
}

export function mountSiteThemeConfetti(host, config, viewport, themeId, preview = false) {
  const document = host.ownerDocument;
  const browser = document.defaultView;
  if (!browser || typeof host.animate !== 'function') return;
  if (viewport === 'desktop' ? !config.showDesktop : !config.showMobile) return;

  const motion = browser.matchMedia('(prefers-reduced-motion: reduce)');
  const storageKey = !preview && config.frequency === 'session' ? `mt-site-theme-confetti:${themeId}` : '';
  const layer = document.createElement('div');
  layer.dataset.mtSiteThemeConfetti = '';
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, {
    position: 'absolute', inset: '0 0 auto', height: 'min(60vh, 480px)',
    zIndex: '11', pointerEvents: 'none', overflow: 'hidden'
  });

  let timer;
  const animations = [];

  function dispose() {
    browser.clearTimeout(timer);
    document.removeEventListener('visibilitychange', schedule);
    motion.removeEventListener('change', schedule);
    animations.forEach((animation) => animation.cancel());
    layer.remove();
  }

  function play() {
    if (motion.matches || document.hidden) return;
    document.removeEventListener('visibilitychange', schedule);
    if (!host.isConnected) {
      dispose();
      return;
    }
    if (storageKey) {
      try {
        if (browser.sessionStorage.getItem(storageKey)) {
          dispose();
          return;
        }
        browser.sessionStorage.setItem(storageKey, '1');
      } catch { /* Session storage may be unavailable. */ }
    }

    host.append(layer);
    const { clientWidth, clientHeight } = layer;
    for (let index = 0; index < config.count; index += 1) {
      const fromLeft = index % 2 === 0;
      const direction = fromLeft ? 1 : -1;
      const distance = direction * Math.min(clientWidth * 0.42, 370) * (0.25 + Math.random() * 0.75);
      const size = 4 + Math.random() * 6;
      const rotation = direction * (220 + Math.random() * 460);
      const delay = Math.random() * config.durationMs * 0.13;
      const particle = document.createElement('span');
      Object.assign(particle.style, {
        position: 'absolute', top: '-10px', [fromLeft ? 'left' : 'right']: '2%',
        width: `${size}px`, height: `${size * 0.7}px`,
        borderRadius: index % 3 === 0 ? '50%' : '1px',
        backgroundColor: index % 4 < 2 ? config.primaryColor : config.secondaryColor
      });
      layer.append(particle);
      animations.push(particle.animate([
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 0 },
        { transform: `translate(${distance * 0.68}px, ${clientHeight * 0.27}px) rotate(${rotation * 0.42}deg)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${distance}px, ${clientHeight + 14}px) rotate(${rotation}deg)`, opacity: 0 }
      ], {
        delay,
        duration: (config.durationMs - delay) * (0.76 + Math.random() * 0.24),
        easing: 'cubic-bezier(0.22, 0.48, 0.4, 1)',
        fill: 'both'
      }));
    }
    timer = browser.setTimeout(dispose, config.durationMs);
  }

  function schedule() {
    browser.clearTimeout(timer);
    if (motion.matches) {
      if (layer.isConnected) dispose();
      return;
    }
    if (document.hidden) return;
    if (preview) play();
    else timer = browser.setTimeout(play, config.delayMs);
  }

  document.addEventListener('visibilitychange', schedule);
  motion.addEventListener('change', schedule);
  schedule();
  return dispose;
}
