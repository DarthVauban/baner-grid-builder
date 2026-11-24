export function promoBarBackgroundImage(value, origin) {
  if (!value || /[\\\u0000-\u0020]/u.test(value)) return '';
  const uploaded = /^\/media\/catalog\/library\/[a-z0-9_.-]+\.webp$/iu.test(value);
  if (!uploaded && !/^https:\/\//iu.test(value)) return '';
  if (uploaded && !origin) return `url(${JSON.stringify(value)})`;

  try {
    const url = new URL(value, origin);
    if (url.username || url.password) return '';
    return `url(${JSON.stringify(url.href)})`;
  } catch {
    return '';
  }
}

export function mountPromoBarMarquee(viewport, message, speed) {
  const document = viewport.ownerDocument;
  const browser = document.defaultView;
  if (!browser || !browser.ResizeObserver || typeof viewport.animate !== 'function') return;

  const motion = browser.matchMedia('(prefers-reduced-motion: reduce)');
  const track = document.createElement('span');
  track.dataset.mtSitePromoTrack = '';
  track.setAttribute('aria-hidden', 'true');
  Object.assign(track.style, { display: 'flex', width: 'max-content', direction: 'ltr' });

  const segment = message.cloneNode(true);
  Object.assign(segment.style, {
    flex: 'none',
    whiteSpace: 'nowrap',
    paddingInlineEnd: '48px'
  });
  track.append(segment);

  let animation;
  let stepWidth = 0;
  let pauseForPointer = false;
  let pauseForFocus = viewport === document.activeElement;

  function updatePlayback() {
    if (pauseForPointer || pauseForFocus) animation?.pause();
    else animation?.play();
  }

  function reset() {
    animation?.cancel();
    animation = undefined;
    track.remove();
    message.style.position = '';
    message.style.clipPath = '';
    viewport.removeAttribute('tabindex');
  }

  function update() {
    if (!viewport.isConnected) {
      dispose();
      return;
    }
    if (motion.matches || !viewport.clientWidth) {
      reset();
      return;
    }

    if (track.parentNode !== viewport) viewport.append(track);
    const width = segment.getBoundingClientRect().width;
    if (!width) {
      reset();
      return;
    }

    // Cover the visible area even after the leading repeat leaves the viewport.
    const count = Math.ceil(viewport.clientWidth / width) + 1;
    while (track.childElementCount < count) track.append(segment.cloneNode(true));
    while (track.childElementCount > count) track.lastElementChild.remove();
    message.style.position = 'absolute';
    message.style.clipPath = 'inset(50%)';
    viewport.tabIndex = 0;

    if (animation && stepWidth === width) return;
    stepWidth = width;
    animation?.cancel();
    animation = track.animate(
      [{ transform: 'translateX(0)' }, { transform: `translateX(-${width}px)` }],
      { duration: width / speed * 1000, iterations: Infinity, easing: 'linear' }
    );
    updatePlayback();
  }

  function onPointerEnter(event) {
    if (event.pointerType !== 'mouse') return;
    pauseForPointer = true;
    updatePlayback();
  }

  function onPointerLeave() {
    pauseForPointer = false;
    updatePlayback();
  }

  function onFocus() {
    pauseForFocus = true;
    updatePlayback();
  }

  function onBlur() {
    pauseForFocus = false;
    updatePlayback();
  }

  const observer = new browser.ResizeObserver(update);
  function dispose() {
    observer.disconnect();
    motion.removeEventListener('change', update);
    viewport.removeEventListener('pointerenter', onPointerEnter);
    viewport.removeEventListener('pointerleave', onPointerLeave);
    viewport.removeEventListener('focus', onFocus);
    viewport.removeEventListener('blur', onBlur);
    reset();
  }

  observer.observe(viewport);
  observer.observe(segment);
  motion.addEventListener('change', update);
  viewport.addEventListener('pointerenter', onPointerEnter);
  viewport.addEventListener('pointerleave', onPointerLeave);
  viewport.addEventListener('focus', onFocus);
  viewport.addEventListener('blur', onBlur);
  update();
  return dispose;
}
