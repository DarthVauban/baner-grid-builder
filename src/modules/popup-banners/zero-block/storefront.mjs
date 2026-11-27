import { mountPopupOverlay } from './renderer.mjs';
import { createRuleState } from './rule-state.mjs';
import { evaluateRules, recordImpression } from './rules.mjs';

export function createZeroBlockRuntime(apiOrigin, { legacyPriority, showLegacy, hideLegacy, pageUrl, onEvent }) {
  let storage;
  try {
    storage = window.localStorage;
    storage.getItem('mt-zero-block-storage');
  } catch { storage = null; }
  let data;
  let ruleState;
  let page;
  let exitIntent = false;
  let visibleMs = 0;
  let lastTick = performance.now();
  let hidden = document.hidden;
  let lastActivity = 0;
  let active;
  let serverOffset = 0;
  const dismissed = new Set();
  const now = () => Date.now() + serverOffset;

  function mobile() {
    return innerWidth < 768;
  }

  function elapsed() {
    const time = performance.now();
    if (!hidden) visibleMs += Math.max(0, time - lastTick);
    lastTick = time;
    hidden = document.hidden;
  }

  function context(candidate) {
    const time = now();
    const range = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0) - innerHeight;
    return {
      ...ruleState?.context(candidate.id, time), now: time, url: location.href, visibleMs,
      viewportWidth: innerWidth, device: mobile() ? 'mobile' : 'desktop',
      scrollPercent: range <= 0 ? 100 : Math.max(0, Math.min(100, Math.floor(scrollY / range * 100))),
      storage, shopId: data.shopId, campaignId: candidate.id, timezone: candidate.timezone || data.timezone, exitIntent,
      active: active?.id === candidate.id && active?.versionId === candidate.versionId
    };
  }

  function close(userDismissed = false) {
    if (!active) return;
    const { id, overlay } = active;
    active = null;
    if (userDismissed) {
      dismissed.add(id);
      onEvent(id, 'dismiss');
    }
    overlay.destroy();
  }

  function complete(candidate, action) {
    if (candidate.rules.rules.some((rule) => rule.type === 'suppression' && rule.actions?.includes(action))) {
      ruleState?.complete(candidate.id, action, now());
    }
    if (action === 'copy_promo') onEvent(candidate.id, 'copy');
  }

  function show(candidate) {
    const host = document.createElement('div');
    host.dataset.mtZeroBlock = candidate.id;
    document.body.append(host);
    const retries = new Map();
    const submit = async (formId, values) => {
      const payload = JSON.stringify(values);
      const prior = retries.get(formId);
      const requestKey = prior?.payload === payload ? prior.requestKey : crypto.randomUUID();
      retries.set(formId, { payload, requestKey });
      const response = await fetch(new URL(`/api/public/popup-banners/zero-block/${candidate.id}/submit`, apiOrigin), {
        method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: candidate.versionId, formId, values, requestKey, pageUrl: pageUrl(location.href) })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message || 'Заявку не прийнято. Спробуйте ще раз.');
      const rewardType = candidate.document.elements.find((item) => item.type === 'form'
        && item.content.formId === formId)?.content.flow?.reward.type;
      if (!result.data?.submissionId || (rewardType && result.data.reward?.type !== rewardType)) {
        throw new Error('Відповідь сервера не підтверджена. Повторіть надсилання.');
      }
      retries.delete(formId);
      complete(candidate, 'submit');
      return result.data;
    };
    const legacyResponsive = candidate.document.laptop || candidate.document.tablet || candidate.document.mobileLandscape;
    let overlay;
    try {
      const documentModel = { ...candidate.document, shopId: data.shopId, widgetId: candidate.id };
      overlay = mountPopupOverlay(host, documentModel, {
        apiBase: apiOrigin, products: candidate.products, suspended: true,
        ...(legacyResponsive ? {} : { device: mobile() ? 'mobile' : 'desktop' }),
        onSubmit: submit, onClose: () => close(true), onActionSuccess: (action) => complete(candidate, action)
      });
      if (!recordImpression(candidate.rules, context(candidate))) {
        overlay.destroy();
        return false;
      }
      close();
      hideLegacy();
      overlay.activate();
      active = { id: candidate.id, versionId: candidate.versionId, overlay, device: mobile() ? 'mobile' : 'desktop',
        legacyResponsive, products: candidate.products };
      onEvent(candidate.id, 'impression');
      return true;
    } catch {
      overlay?.destroy();
      host.remove();
      return false;
    }
  }

  function evaluate() {
    elapsed();
    if (!data || hidden || page !== location.href) return false;
    const minimumPriority = legacyPriority();
    for (const candidate of data.campaigns) {
      if (candidate.priority < minimumPriority) break;
      if (dismissed.has(candidate.id) || !evaluateRules(candidate.rules, context(candidate))) continue;
      if (active?.id === candidate.id && active.versionId === candidate.versionId) {
        if (active.products !== candidate.products) {
          active.products = candidate.products;
          active.overlay.updateProducts(candidate.products);
        }
        const device = mobile() ? 'mobile' : 'desktop';
        if (!active.legacyResponsive && device !== active.device) {
          active.device = device;
          active.overlay.setDevice(device);
        }
        return true;
      }
      if (show(candidate)) return true;
    }
    close();
    showLegacy();
    return false;
  }

  function activity() {
    if (!ruleState || hidden) return;
    const time = now();
    if (time - lastActivity >= 15_000) {
      ruleState.touch(time);
      lastActivity = time;
    }
  }

  function change(event) {
    if (['scroll', 'pageshow', 'visibilitychange'].includes(event.type)) activity();
    evaluate();
  }
  function onExit(event) {
    if (document.hidden || mobile() || innerWidth < 768 || event.relatedTarget || event.clientY > 0
      || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    exitIntent = true;
    activity();
    evaluate();
  }
  const events = ['scroll', 'resize', 'pageshow', 'storage'];
  events.forEach((event) => window.addEventListener(event, change, { passive: true }));
  document.addEventListener('visibilitychange', change);
  document.addEventListener('pointerdown', activity, { passive: true });
  document.addEventListener('keydown', activity);
  document.addEventListener('mouseout', onExit);
  setInterval(() => evaluate(), 250);

  return {
    navigate(url) {
      if (url === page) return;
      close();
      page = url;
      visibleMs = 0;
      lastTick = performance.now();
      exitIntent = false;
      dismissed.clear();
      if (ruleState) {
        ruleState.visit(url, now());
        lastActivity = now();
      }
    },
    update(next, serverNow) {
      const server = Date.parse(serverNow);
      if (Number.isFinite(server)) serverOffset = server - Date.now();
      if (data?.shopId !== next?.shopId) {
        ruleState = next ? createRuleState({ storage, shopId: next.shopId }) : null;
        if (page) ruleState?.visit(page, now());
        lastActivity = now();
      }
      if (!next) close();
      data = next;
    },
    evaluate
  };
}
