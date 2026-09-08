export const defaultTimerConfig = { mode: 'duration', deadlineAt: null, durationMinutes: 15 };

export function normalizeTimerConfig(value) {
  const source = value && typeof value === 'object' ? value : {};
  const deadline = source.deadlineAt ? Date.parse(source.deadlineAt) : NaN;
  return {
    mode: source.mode === 'deadline' ? 'deadline' : 'duration',
    deadlineAt: Number.isFinite(deadline) ? new Date(deadline).toISOString() : null,
    durationMinutes: Math.min(43200, Math.max(1, Math.floor(Number(source.durationMinutes) || 15)))
  };
}

export function isTimerExpired(config, now = Date.now()) {
  return config.mode === 'deadline' && (!config.deadlineAt || Date.parse(config.deadlineAt) <= now);
}

// This self-contained function is embedded verbatim in the storefront script.
// Pass the browser explicitly so the same runtime can be exercised in tests.
export function createPopupTimerRuntime(browser) {
  const document = browser.document;
  const memory = new Map();
  let clockOffset = 0;
  const now = () => browser.Date.now() + clockOffset;
  const read = (key) => {
    for (const name of ['localStorage', 'sessionStorage']) {
      try {
        const value = Number(browser[name].getItem(key));
        if (Number.isFinite(value) && value > 0) return value;
      } catch { /* Storage can be unavailable in private or embedded contexts. */ }
    }
    return memory.get(key) || null;
  };
  const write = (key, value) => {
    memory.set(key, value);
    for (const name of ['localStorage', 'sessionStorage']) {
      try { browser[name].setItem(key, String(value)); } catch { /* Keep the in-page fallback. */ }
    }
  };
  return {
    storage(name) {
      return {
        getItem(key) {
          try { return browser[name].getItem(key); } catch { return memory.get(key) ?? null; }
        },
        setItem(key, value) {
          memory.set(key, String(value));
          try { browser[name].setItem(key, String(value)); } catch { /* Keep the in-page fallback. */ }
        }
      };
    },
    sync(serverNow) {
      const timestamp = Date.parse(serverNow);
      if (Number.isFinite(timestamp)) clockOffset = timestamp - browser.Date.now();
    },
    start(campaign, preview) {
      if (campaign.type !== 'countdown') return null;
      const config = campaign.timerConfig || {};
      const duration = Number(config.durationMinutes) * 60000;
      // Copy/design revisions must not grant a visitor a fresh offer.
      const key = 'mt-popup-timer:' + campaign.publicId + ':duration:' + config.durationMinutes;
      let deadline = config.mode === 'deadline' ? Date.parse(config.deadlineAt)
        : (!preview && read(key)) || now() + duration;
      if (!Number.isFinite(deadline) || deadline <= now() || !(duration > 0)) return { expired: true };
      if (config.mode === 'duration' && !preview) write(key, deadline);
      return {
        expired: false,
        mount(container, onExpire) {
          const timer = document.createElement('div');
          timer.className = 'countdown';
          timer.setAttribute('role', 'timer');
          timer.setAttribute('aria-live', 'off');
          const labels = ['Дні', 'Години', 'Хвилини', 'Секунди'];
          const digits = labels.map((label) => {
            const cell = document.createElement('div'); cell.className = 'countdown-cell';
            const digit = document.createElement('strong');
            const caption = document.createElement('span'); caption.textContent = label;
            cell.append(digit, caption); timer.append(cell);
            return digit;
          });
          container.append(timer);
          let disposed = false;
          let interval;
          const dispose = () => {
            disposed = true;
            browser.clearInterval(interval);
            document.removeEventListener('visibilitychange', tick);
            browser.removeEventListener('pageshow', tick);
            browser.removeEventListener('storage', tick);
          };
          const tick = () => {
            if (disposed) return;
            if (config.mode === 'duration' && !preview) {
              const stored = read(key);
              if (stored) deadline = Math.min(deadline, stored);
            }
            const remaining = Math.max(0, Math.ceil((deadline - now()) / 1000));
            const values = [Math.floor(remaining / 86400), Math.floor(remaining / 3600) % 24,
              Math.floor(remaining / 60) % 60, remaining % 60];
            values.forEach((value, index) => { digits[index].textContent = String(value).padStart(2, '0'); });
            timer.setAttribute('aria-label', 'До завершення: ' + values.map((value, index) => value + ' ' + labels[index].toLowerCase()).join(', '));
            if (!remaining) { dispose(); onExpire(); }
          };
          interval = browser.setInterval(tick, 250);
          document.addEventListener('visibilitychange', tick);
          browser.addEventListener('pageshow', tick);
          browser.addEventListener('storage', tick);
          tick();
          return dispose;
        }
      };
    }
  };
}
