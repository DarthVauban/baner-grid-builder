// Storefront-only browser facts. Importing/constructing never writes storage.
export const VISIT_IDLE_MS = 30 * 60 * 1000;
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];
const ACTIONS = ['submit', 'copy_promo'];
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const timestamp = value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
const identity = value => typeof value === 'string' && value.length > 0 && value.length <= 200;
const validUtm = value => isRecord(value) && Object.keys(value).every(key => UTM_KEYS.includes(key) && typeof value[key] === 'string' && value[key].length > 0 && value[key].length <= 200);
const validPath = value => typeof value === 'string' && value.startsWith('/') && value.length <= 1000 && !/[?#]/.test(value) && (value === '/' || !value.endsWith('/'));

export function visitKey(shopId) { return `kk:rules:v1:${encodeURIComponent(shopId)}:visit`; }
export function actionKey(shopId, campaignId, action) { return `kk:rules:v1:${encodeURIComponent(shopId)}:actions:${encodeURIComponent(campaignId)}:${action}`; }

function navigation(url) {
  if (typeof url !== 'string') throw new Error('Unknown navigation');
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Unknown navigation');
  const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  if (!validPath(pathname)) throw new Error('Unknown page');
  const utm = {};
  const tagged = UTM_KEYS.some(key => parsed.searchParams.has(key));
  for (const key of UTM_KEYS) {
    const value = parsed.searchParams.get(key);
    // Oversized input is omitted, never truncated into an otherwise valid match.
    if (value && value.length <= 200) utm[key] = value;
  }
  return { pathname, tagged, utm };
}

function validVisit(value, now) {
  return isRecord(value) && Object.keys(value).every(key => ['schemaVersion', 'visitorType', 'startedAt', 'lastActivityAt', 'paths', 'utm'].includes(key)) && value.schemaVersion === 1 && ['new', 'returning'].includes(value.visitorType) &&
    timestamp(value.startedAt) && timestamp(value.lastActivityAt) && value.startedAt <= value.lastActivityAt && value.lastActivityAt <= now &&
    Array.isArray(value.paths) && value.paths.length > 0 && value.paths.length <= 100 && new Set(value.paths).size === value.paths.length && value.paths.every(validPath) && validUtm(value.utm);
}

function validCompleted(value, action, now) {
  return isRecord(value) && Object.keys(value).every(key => ['schemaVersion', 'action', 'completedAt'].includes(key)) &&
    value.schemaVersion === 1 && value.action === action && timestamp(value.completedAt) && value.completedAt <= now;
}

/** Shared across tabs through localStorage; no page-memory replacement for lost facts. */
export function createRuleState({ storage, shopId } = {}) {
  let lastNavigation = null;
  let writeFailed = false;
  const usable = identity(shopId) && storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function';
  function read(key, validate, now) {
    if (!usable || !timestamp(now)) throw new Error('Unknown browser facts');
    const raw = storage.getItem(key);
    if (raw === null) return null;
    if (typeof raw !== 'string' || raw.length > 110000) throw new Error('Invalid browser facts');
    const parsed = JSON.parse(raw);
    if (!validate(parsed, now)) throw new Error('Invalid browser facts');
    return parsed;
  }
  function write(key, value) {
    const serialized = JSON.stringify(value);
    storage.setItem(key, serialized);
    if (storage.getItem(key) !== serialized) throw new Error('Browser facts were not persisted');
  }
  function writeVisit(current, now, explicitNavigation) {
    const previous = read(visitKey(shopId), validVisit, now);
    const expired = previous && now - previous.lastActivityAt >= VISIT_IDLE_MS;
    const next = !previous || expired ? {
      schemaVersion: 1, visitorType: previous ? 'returning' : 'new', startedAt: now, lastActivityAt: now,
      paths: [current.pathname], utm: current.tagged ? { ...current.utm } : {},
    } : {
      ...previous, lastActivityAt: now,
      paths: previous.paths.includes(current.pathname) || previous.paths.length === 100 ? previous.paths : [...previous.paths, current.pathname],
      utm: explicitNavigation && current.tagged ? { ...current.utm } : previous.utm,
    };
    write(visitKey(shopId), next);
  }
  return {
    visit(url, now) {
      lastNavigation = null;
      try {
        const current = navigation(url);
        writeVisit(current, now, true);
        lastNavigation = current;
        writeFailed = false;
        return true;
      } catch { writeFailed = true; return false; }
    },
    touch(now) {
      if (!lastNavigation) return false;
      try { writeVisit(lastNavigation, now, false); writeFailed = false; return true; }
      catch { writeFailed = true; return false; }
    },
    context(campaignId, now) {
      if (writeFailed || !identity(campaignId)) return {};
      try {
        const visit = read(visitKey(shopId), validVisit, now);
        const completed = ACTIONS.filter(action => read(actionKey(shopId, campaignId, action), (value, time) => validCompleted(value, action, time), now));
        return {
          ...(visit && now - visit.lastActivityAt < VISIT_IDLE_MS ? {
            visitStartedAt: visit.startedAt, visitorType: visit.visitorType, utm: { ...visit.utm }, pageViews: visit.paths.length,
          } : {}),
          completedActions: completed,
        };
      } catch { return {}; }
    },
    complete(campaignId, action, now) {
      if (!identity(campaignId) || !ACTIONS.includes(action)) return false;
      try {
        const key = actionKey(shopId, campaignId, action);
        read(key, (value, time) => validCompleted(value, action, time), now);
        // Independent keys cannot overwrite a simultaneous success of the other action.
        write(key, { schemaVersion: 1, action, completedAt: now });
        writeFailed = false;
        return true;
      } catch { writeFailed = true; return false; }
    },
  };
}
