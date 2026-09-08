// Kept self-contained: the embed includes this factory without a bundler or React.
export function createPopupBlockRuntime(browser, helpers) {
  const document = browser.document;
  const styleFor = (node, device) => ({ ...node.style, ...(device === 'mobile' ? node.mobile : {}) });
  const containerTypes = ['container', 'form', 'product'];
  function applyStyle(element, s, container) {
    Object.assign(element.style, {
      display: container ? 'flex' : 'block', flexDirection: s.direction, flexWrap: s.wrap ? 'wrap' : 'nowrap',
      justifyContent: s.justify, alignItems: s.align, columnGap: s.gap + 'px', rowGap: s.rowGap + 'px',
      width: s.widthMode === 'fixed' ? s.width + 'px' : s.widthMode === 'percent' ? Math.min(100, s.width) + '%' : s.widthMode === 'fill' ? '100%' : 'auto',
      height: s.heightMode === 'fixed' ? s.height + 'px' : 'auto', minHeight: s.minHeight + 'px', minWidth: '0',
      maxWidth: s.maxWidth ? s.maxWidth + 'px' : '', flexGrow: String(s.grow), flexShrink: s.shrink ? '1' : '0',
      padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(v => v + 'px').join(' '),
      margin: [s.marginTop, s.marginRight, s.marginBottom, s.marginLeft].map(v => v + 'px').join(' '),
      background: s.background, color: s.color, borderRadius: s.radius + 'px',
      border: s.borderWidth + 'px ' + s.borderStyle + ' ' + s.borderColor,
      boxShadow: ({ none: 'none', soft: '0 4px 16px #29213b12', medium: '0 10px 35px #29213b20', large: '0 24px 60px #29213b25' })[s.shadow],
      opacity: String(s.opacity), fontSize: s.fontSize + 'px', fontWeight: String(s.fontWeight), fontFamily: s.fontFamily,
      lineHeight: String(s.lineHeight), letterSpacing: s.letterSpacing + 'px', textAlign: s.textAlign,
      fontStyle: s.italic ? 'italic' : 'normal', textDecoration: s.underline ? 'underline' : 'none', overflow: s.overflow
    });
  }
  function safeUrl(value, image = false) {
    if (!String(value || '').trim()) return '';
    try { const url = new URL(value, browser.location.href); return (image ? ['https:', 'http:'] : ['https:', 'http:', 'mailto:', 'tel:']).includes(url.protocol) ? url.href : ''; } catch { return ''; }
  }
  return {
    mount(payload, options) {
      const { campaign } = payload;
      const root = campaign.blockDocument?.root;
      if (!root) return null;
      const device = options.device;
      const cleanups = [];
      const timers = new Map();
      let expired = false;
      function prepare(node) {
        if (styleFor(node, device).hidden) return;
        if (node.type === 'countdown') {
          const timer = helpers.timer.start({ type: 'countdown', publicId: campaign.publicId + ':' + node.id, timerConfig: { mode: node.props.timerMode, durationMinutes: node.props.durationMinutes, deadlineAt: node.props.deadlineAt } }, options.preview);
          timers.set(node.id, timer);
          if (timer?.expired && node.props.hideOnExpire) expired = true;
        }
        node.children.forEach(prepare);
      }
      prepare(root);
      if (expired) return null;
      const host = document.createElement('div'); host.id = 'mt-popup-banner-root';
      Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '2147482990', pointerEvents: 'none' });
      const shadow = host.attachShadow({ mode: 'open' });
      const css = document.createElement('style');
      css.textContent = ':host{all:initial;font:16px/1.5 Inter,system-ui,-apple-system,Segoe UI,sans-serif;color:#252438}*,*:before,*:after{box-sizing:border-box}button,input,textarea,select{font:inherit;color:inherit}button,a,input,select,textarea{touch-action:manipulation}button,a{cursor:pointer}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #7964d7;outline-offset:3px}button:disabled{opacity:.55;cursor:wait}.surface{position:absolute;inset:0;display:flex;padding:16px;overflow:auto;align-items:center;justify-content:center}.card{position:relative;max-width:100%;max-height:100%;overflow:auto;pointer-events:auto}.close{position:sticky;top:6px;float:right;z-index:2;margin:6px 6px -36px 0;width:30px;height:30px;padding:0;border:1px solid #d7d7df;border-radius:50%;background:#fff;color:#242132;font:22px/1 Arial}.node{position:relative;box-sizing:border-box;overflow-wrap:anywhere}.action{width:100%;height:100%;display:block;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:inherit;text-decoration:none}.text{white-space:pre-wrap}.image{width:100%;height:100%;display:block}.field{display:flex;flex-direction:column;gap:6px}.field input:not([type=checkbox]),.field textarea,.field select{width:100%;min-width:0;min-height:42px;border:1px solid #dad7e6;border-radius:8px;padding:10px;background:#fff;color:#252237}.field input[type=checkbox]{width:18px;height:18px;margin:0 8px 0 0;vertical-align:middle}.coupon{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}.coupon button{background:transparent;border:0;color:inherit;font:inherit}.countdown{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}.countdown-cell{min-width:48px;padding:10px;background:#f2effa;border-radius:10px;text-align:center}.countdown-cell strong{display:block;font-size:1.5em;font-variant-numeric:tabular-nums}.countdown-cell span{font-size:11px}.status{font:14px/1.5 system-ui;white-space:pre-wrap}.error{color:#b42318}';
      shadow.append(css);
      const surface = document.createElement('div'); surface.className = 'surface';
      const modal = campaign.styles.layout !== 'corner';
      if (modal) { surface.style.background = 'rgba(18,16,28,.42)'; surface.style.pointerEvents = 'auto'; }
      if (campaign.styles.layout === 'bottom-sheet') surface.style.alignItems = 'flex-end';
      if (!modal) {
        const position = device === 'mobile' ? campaign.styles.mobilePosition : campaign.styles.desktopPosition;
        surface.style.alignItems = position?.startsWith('top') ? 'flex-start' : 'flex-end';
        surface.style.justifyContent = device === 'mobile' ? 'center' : position?.endsWith('left') ? 'flex-start' : 'flex-end';
      }
      const card = document.createElement('div'); card.className = 'card'; card.tabIndex = -1;
      card.setAttribute('role', modal ? 'dialog' : 'region'); card.setAttribute('aria-label', campaign.name || campaign.blockDocument.name || 'Пропозиція');
      if (modal) card.setAttribute('aria-modal', 'true');
      const rootStyle = styleFor(root, device);
      card.style.width = Math.min(1400, rootStyle.widthMode === 'fixed' ? rootStyle.width : campaign.styles.maxWidth || 640) + 'px';
      let disposed = false;
      const previousFocus = document.activeElement;
      if (modal && !options.preview) { const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; cleanups.push(() => { document.body.style.overflow = overflow; }); }
      const dispose = () => { if (disposed) return; disposed = true; cleanups.forEach(cleanup => cleanup()); host.remove(); if (document.activeElement === document.body && previousFocus?.isConnected && !options.preview) previousFocus.focus?.({ preventScroll: true }); };
      const close = (eventType = 'dismiss') => { dispose(); options.onClose(eventType); };
      const closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.className = 'close'; closeButton.textContent = '×'; closeButton.setAttribute('aria-label', 'Закрити банер'); closeButton.addEventListener('click', () => close()); card.append(closeButton);
      if (campaign.behavior.dismissible) surface.addEventListener('click', e => { if (e.target === surface) close(); });
      const keydown = e => {
        if (e.key === 'Escape' && campaign.behavior.dismissible) { e.stopPropagation(); close(); }
        if (e.key !== 'Tab' || !modal) return;
        const targets = [...card.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')].filter(el => el.getClientRects().length);
        const first = targets[0], last = targets.at(-1);
        if (e.shiftKey && (shadow.activeElement === first || shadow.activeElement === card)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && shadow.activeElement === last) { e.preventDefault(); first?.focus(); }
      };
      shadow.addEventListener('keydown', keydown);
      const track = (type, node, extra = {}) => options.onEvent(type, { blockId: node.id, ...extra });
      async function copy(value, button, node) {
        if (!value) { button.textContent = 'Код з’явиться після заповнення форми'; return; }
        let copied = false;
        try { await browser.navigator.clipboard.writeText(value); copied = true; } catch { /* Use selection when clipboard permission is unavailable. */ }
        if (!copied) {
          const field = document.createElement('textarea'); field.value = value; field.style.position = 'fixed'; field.style.opacity = '0'; shadow.append(field); field.select();
          try { copied = document.execCommand('copy'); } catch { /* Let the user copy the visible code. */ } field.remove();
        }
        button.textContent = copied ? 'Скопійовано' : 'Скопіюйте код вручну: ' + value;
        if (copied) track('copy', node);
      }
      function coupon(parent, code, node) {
        const row = document.createElement('div'); row.className = 'coupon';
        const text = document.createElement('strong'); text.textContent = code || 'Промокод після заповнення форми';
        const button = document.createElement('button'); button.type = 'button'; button.textContent = node.props.copyLabel || 'Скопіювати'; button.addEventListener('click', () => copy(code, button, node));
        row.append(text, button); parent.append(row);
      }
      function render(node, inheritedProduct = null) {
        const s = styleFor(node, device), p = node.props;
        if (s.hidden) return null;
        const product = node.type === 'product' ? payload.products?.find(item => item.productExternalId === p.productExternalId && String(item.modificationExternalId || '') === String(p.modificationExternalId || '')) : inheritedProduct;
        if (node.type === 'product' && !product) return null;
        const element = document.createElement(node.type === 'form' ? 'form' : 'div'); element.className = 'node'; element.dataset.blockId = node.id; element.dataset.blockType = node.type;
        applyStyle(element, s, containerTypes.includes(node.type));
        if (node === root) element.style.maxWidth = '100%';
        const money = value => value == null || value === '' ? '' : Number(value).toLocaleString('uk-UA') + ' ' + (product?.currency === 'UAH' ? '₴' : product?.currency || '');
        const bindings = { 'product.title': product?.title, 'product.variant': product?.article, 'product.price': money(product?.price), 'product.oldPrice': Number(product?.oldPrice) > Number(product?.price) ? money(product.oldPrice) : '', 'product.badge': Number(product?.oldPrice) > Number(product?.price) ? 'Вигідна ціна' : '', 'product.image': product?.imageUrl };
        if (node.type === 'text') { element.classList.add('text'); element.textContent = p.binding === 'none' ? p.text : bindings[p.binding] || ''; if (p.binding === 'product.oldPrice') element.style.textDecoration = 'line-through'; }
        else if (node.type === 'image') {
          const src = safeUrl(p.binding === 'product.image' ? product?.imageUrl : p.src, true);
          if (src) { const img = document.createElement('img'); img.className = 'image'; img.src = src; img.alt = p.alt || product?.title || ''; img.style.objectFit = p.imageFit; img.style.objectPosition = p.imagePosition; if (s.heightMode === 'auto') img.style.height = '180px'; element.append(img); }
        } else if (node.type === 'button') {
          const href = safeUrl(p.action === 'product' ? product?.pageUrl : p.href);
          const button = document.createElement(['link', 'product'].includes(p.action) && href ? 'a' : 'button'); button.className = 'action'; button.textContent = p.text || 'Кнопка';
          if (button.tagName === 'A') { button.href = href; if (p.newTab) { button.target = '_blank'; button.rel = 'noopener noreferrer'; } }
          else button.type = p.action === 'submit' ? 'submit' : 'button';
          button.addEventListener('click', async e => {
            if (button.dataset.fallback && product) { track('click', node, { action: 'product_fallback' }); browser.location.assign(safeUrl(product.pageUrl)); return; }
            if (p.action === 'close') close();
            else if (p.action === 'copy') await copy(p.couponSource === 'campaign' ? campaign.promoCode?.code : p.code, button, node);
            else if (p.action === 'cart' && product) {
              if (options.preview) { button.textContent = 'Тест: товар можна додати до кошика'; return; }
              button.disabled = true;
              try { const result = await helpers.nativeBuy(product, () => !disposed); if (disposed) return; if (result === 'added' || result === 'already') { button.textContent = 'У кошику'; track('click', node, { productExternalId: product.productExternalId }); } else { button.textContent = 'Відкрити товар'; button.dataset.fallback = 'true'; } }
              finally { button.disabled = false; }
            } else if (['link', 'product'].includes(p.action)) { if (options.preview) e.preventDefault(); else track('click', node, { action: p.action }); }
          }); element.append(button);
        } else if (node.type === 'coupon') coupon(element, p.couponSource === 'campaign' ? campaign.promoCode?.code : p.code, node);
        else if (node.type === 'countdown') {
          const timer = timers.get(node.id);
          if (timer && !timer.expired) cleanups.push(timer.mount(element, () => { if (p.hideOnExpire) close(null); }));
          else { element.textContent = '00 : 00 : 00 : 00'; element.setAttribute('role', 'timer'); }
        } else if (node.type === 'field') {
          element.classList.add('field'); const label = document.createElement('label'); const input = document.createElement(p.fieldType === 'textarea' ? 'textarea' : p.fieldType === 'select' ? 'select' : 'input');
          input.id = 'mt-block-' + node.id; input.name = node.id; input.required = p.required; input.setAttribute('aria-label', p.text || node.name); label.htmlFor = input.id; label.textContent = (p.text || node.name) + (p.required ? ' *' : '');
          if (input.tagName === 'INPUT') input.type = p.fieldType === 'phone' ? 'tel' : p.fieldType;
          if (p.fieldType === 'phone') input.pattern = '[+0-9\\(\\) .\\-]{7,25}';
          if (p.fieldType === 'select') for (const value of ['', ...new Set(p.options.split('\n').map(v => v.trim()).filter(Boolean))]) { const option = document.createElement('option'); option.value = value; option.textContent = value || p.placeholder || 'Оберіть варіант'; input.append(option); }
          else { input.placeholder = p.placeholder; if (p.fieldType !== 'checkbox') input.maxLength = 2000; }
          if (p.fieldType === 'checkbox') { label.prepend(input); element.append(label); } else element.append(label, input);
        } else if (containerTypes.includes(node.type)) {
          for (const child of node.children) { const rendered = render(child, product); if (rendered) element.append(rendered); }
          if (node.type === 'form') {
            const status = document.createElement('div'); status.className = 'status'; status.setAttribute('role', 'status'); element.append(status);
            element.addEventListener('submit', async e => {
              e.preventDefault(); if (element.dataset.sending) return;
              const values = {}; for (const input of element.querySelectorAll('input,textarea,select')) values[input.name] = input.type === 'checkbox' ? input.checked : input.value;
              element.dataset.sending = 'true'; const buttons = [...element.querySelectorAll('[type=submit]')]; buttons.forEach(b => { b.disabled = true; }); status.textContent = 'Надсилання…'; status.classList.remove('error');
              try {
                const response = options.preview ? { successMessage: p.successMessage, promoCode: p.reward === 'promo_code' ? campaign.promoCode : null } : await options.submit({ formId: node.id, revision: campaign.revision, device, values });
                if (disposed) return;
                element.replaceChildren(status); status.textContent = response.successMessage || p.successMessage;
                if (response.promoCode?.code) coupon(element, response.promoCode.code, node);
              } catch (error) { status.textContent = error.message || 'Не вдалося надіслати форму. Спробуйте ще раз.'; status.classList.add('error'); }
              finally { delete element.dataset.sending; buttons.forEach(b => { b.disabled = false; }); }
            });
          }
        }
        return element;
      }
      const banner = render(root); if (!banner) { dispose(); return null; }
      card.append(banner); surface.append(card); shadow.append(surface); document.body.append(host);
      if (!options.preview && campaign.behavior.autoCloseSeconds > 0) cleanups.push((id => () => browser.clearTimeout(id))(browser.setTimeout(() => close(), campaign.behavior.autoCloseSeconds * 1000)));
      if (!options.preview && modal) card.focus({ preventScroll: true });
      return { host, dispose };
    }
  };
}
