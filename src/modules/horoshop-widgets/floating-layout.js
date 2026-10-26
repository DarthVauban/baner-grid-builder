// Self-contained because both standalone embeds include this function's source.
export function createFloatingWidgetLayoutRuntime(browserWindow) {
  if (browserWindow.__mtFloatingWidgetLayoutV1) return browserWindow.__mtFloatingWidgetLayoutV1;

  const listeners = new Set();
  let promo = null;
  let supportOpen = false;

  function sync() {
    let bottomInset = 0;
    if (promo) {
      promo.position();
      const mobile = promo.isMobile();
      const suspended = mobile && supportOpen;
      promo.host.style.visibility = suspended ? 'hidden' : promo.visibility;
      promo.host.inert = suspended || promo.inert;
      if (mobile && !suspended && promo.isBottom() && promo.host.isConnected) {
        const rect = promo.host.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < browserWindow.innerHeight) {
          bottomInset = Math.ceil(browserWindow.innerHeight - rect.top + 12);
        }
      }
    }
    for (const listener of listeners) listener(bottomInset);
  }

  const runtime = {
    registerPromo(host, options) {
      const entry = { ...options, host, visibility: host.style.visibility, inert: host.inert };
      promo = entry;
      const observer = browserWindow.ResizeObserver ? new browserWindow.ResizeObserver(sync) : null;
      observer?.observe(host);
      sync();
      return () => {
        observer?.disconnect();
        host.style.visibility = entry.visibility;
        host.inert = entry.inert;
        if (promo === entry) promo = null;
        sync();
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      sync();
      return () => listeners.delete(listener);
    },
    setSupportOpen(open) {
      supportOpen = open === true;
      sync();
    }
  };

  browserWindow.addEventListener('resize', sync);
  browserWindow.visualViewport?.addEventListener('resize', sync);
  browserWindow.__mtFloatingWidgetLayoutV1 = runtime;
  return runtime;
}
