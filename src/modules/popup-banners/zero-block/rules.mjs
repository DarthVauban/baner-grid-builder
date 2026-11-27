// Version 1 is the shared rule engine for the test template and future widget renderers.
export const RULE_SCHEMA_VERSION = 1;
export const DEFAULT_POPUP_TIMEZONE = 'Europe/Kyiv';
export const FUTURE_RULE_TYPES = Object.freeze(['product', 'brand', 'out_of_stock', 'sticker']);
const FREQUENCY_TYPES = new Set(['frequency', 'daily_frequency', 'session_frequency']);
const TYPES = new Set(['url', 'datetime', 'device', 'delay', 'scroll', ...FREQUENCY_TYPES, 'visitor', 'utm', 'pageviews', 'exit_intent', 'weekly', 'suppression']);
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];
const ACTIONS = ['submit', 'copy_promo'];
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const isTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const validActions = value => Array.isArray(value) && value.length > 0 && value.length <= ACTIONS.length && new Set(value).size === value.length && value.every(action => ACTIONS.includes(action));
const validLimit = value => Number.isInteger(value) && value >= 1 && value <= 100;
const validFrequency = rule => validLimit(rule.max) &&
  (rule.type !== 'frequency' || Number.isInteger(rule.days) && rule.days >= 1 && rule.days <= 30) &&
  (rule.type !== 'session_frequency' || rule.dailyMax === undefined || validLimit(rule.dailyMax));
const validWeekly = rule => Array.isArray(rule.days) && rule.days.length > 0 && rule.days.length <= 7 && new Set(rule.days).size === rule.days.length && rule.days.every(day => Number.isInteger(day) && day >= 1 && day <= 7) && typeof rule.allDay === 'boolean' && isTime(rule.start) && isTime(rule.end) && (rule.allDay || rule.start !== rule.end);

function utmParams(value) {
  if (!isRecord(value)) throw new Error('Вкажіть параметри UTM');
  const keys = Object.keys(value);
  if (!keys.length || keys.some(key => !UTM_KEYS.includes(key))) throw new Error('UTM: дозволені source, medium і campaign');
  const result = {};
  for (const key of keys) {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].trim().length > 200) throw new Error('UTM: непорожнє точне значення до 200 символів');
    result[key] = value[key].trim();
  }
  return result;
}

function path(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('?') || value.includes('#') || value.length > 500) throw new Error('Шлях має починатися з / і не містити query/hash');
  const clean = value.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  if (clean.includes('..') || /[<>"'\\]/.test(clean)) throw new Error('Некоректний шлях');
  return clean;
}

export function validateRuleSet(input) {
  if (!input || input.schemaVersion !== RULE_SCHEMA_VERSION || !Array.isArray(input.rules) || input.rules.length > 12) throw new Error('Непідтримувана версія або набір умов');
  const seen = new Set();
  const rules = input.rules.map((rule) => {
    const key = FREQUENCY_TYPES.has(rule?.type) ? 'frequency' : rule?.type;
    if (!rule || !TYPES.has(rule.type) || seen.has(key)) throw new Error('Непідтримувана або повторна умова');
    seen.add(key);
    switch (rule.type) {
      case 'url': {
        if (!Array.isArray(rule.include) || !Array.isArray(rule.exclude) || rule.include.length > 20 || rule.exclude.length > 20) throw new Error('Забагато URL-шляхів');
        return { type: 'url', include: rule.include.map(path), exclude: rule.exclude.map(path) };
      }
      case 'datetime': {
        const start = rule.start == null || rule.start === '' ? null : rule.start;
        const end = rule.end == null || rule.end === '' ? null : rule.end;
        for (const value of [start, end]) if (value !== null && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(value) || !Number.isFinite(Date.parse(value)))) throw new Error('Некоректна дата й час');
        if (!start && !end) throw new Error('Вкажіть часову межу');
        if (start && end && Date.parse(start) >= Date.parse(end)) throw new Error('Завершення має бути пізніше початку');
        return { type: 'datetime', start, end };
      }
      case 'device':
        if (!['mobile', 'desktop'].includes(rule.value)) throw new Error('Некоректний тип пристрою');
        return { type: 'device', value: rule.value };
      case 'delay':
        if (!Number.isInteger(rule.seconds) || rule.seconds < 0 || rule.seconds > 3600) throw new Error('Затримка: 0–3600 секунд');
        return { type: 'delay', seconds: rule.seconds };
      case 'scroll':
        if (!Number.isInteger(rule.percent) || rule.percent < 0 || rule.percent > 100) throw new Error('Прокрутка: 0–100%');
        return { type: 'scroll', percent: rule.percent };
      case 'frequency':
        if (!validFrequency(rule)) throw new Error('Частота: 1–100 показів за 1–30 днів');
        return { type: 'frequency', max: rule.max, days: rule.days };
      case 'daily_frequency':
        if (!validLimit(rule.max)) throw new Error('Денний ліміт: 1–100 показів');
        return { type: 'daily_frequency', max: rule.max };
      case 'session_frequency':
        if (!validFrequency(rule)) throw new Error('Частота: 1–100 показів за сесію або день');
        return { type: 'session_frequency', max: rule.max, ...(rule.dailyMax === undefined ? {} : { dailyMax: rule.dailyMax }) };
      case 'visitor':
        if (!['new', 'returning'].includes(rule.value)) throw new Error('Оберіть нових або повторних відвідувачів');
        return { type: 'visitor', value: rule.value };
      case 'utm': return { type: 'utm', params: utmParams(rule.params) };
      case 'pageviews':
        if (!Number.isInteger(rule.min) || rule.min < 1 || rule.min > 100) throw new Error('Перегляди: 1–100 різних сторінок');
        return { type: 'pageviews', min: rule.min };
      case 'exit_intent': return { type: 'exit_intent' };
      case 'weekly':
        if (!validWeekly(rule)) throw new Error('Оберіть дні тижня та коректний проміжок часу');
        return { type: 'weekly', days: [...rule.days].sort((a, b) => a - b), allDay: rule.allDay, start: rule.start, end: rule.end };
      case 'suppression':
        if (!validActions(rule.actions)) throw new Error('Оберіть хоча б одну успішну дію');
        return { type: 'suppression', actions: [...rule.actions] };
      default: throw new Error('Непідтримувана умова');
    }
  });
  return { schemaVersion: RULE_SCHEMA_VERSION, rules };
}

function matchesPath(actual, expected) { return expected === '/' || actual === expected || actual.startsWith(`${expected}/`); }

export function impressionKey(shopId, campaignId) { return `kk:v1:${shopId}:${campaignId}`; }

function dailyEntries(context, entries) {
  if (typeof context.timezone !== 'string') throw new Error('Невідомий часовий пояс');
  // Comparing shop-local dates handles midnight and both 23/25-hour DST days.
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: context.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = format.format(context.now);
  return entries.filter(item => Number.isFinite(item) && item <= context.now && format.format(item) === today);
}

function frequencyWindow(rule, context, entries) {
  if (rule.type === 'session_frequency') {
    const { visitStartedAt, now } = context;
    if (!Number.isSafeInteger(visitStartedAt) || visitStartedAt < 0 || !Number.isSafeInteger(now) || visitStartedAt > now ||
        !entries.every(item => Number.isSafeInteger(item) && item >= 0 && item <= 8640000000000000)) throw new Error('Невідомі дані сесії');
    const history = entries.filter(item => item <= now);
    const sessionAvailable = history.filter(item => item >= visitStartedAt).length < rule.max;
    return { history, available: sessionAvailable && (rule.dailyMax === undefined || dailyEntries(context, history).length < rule.dailyMax) };
  }
  const history = rule.type === 'daily_frequency' ? dailyEntries(context, entries) :
    entries.filter(item => typeof item === 'number' && item <= context.now && item > context.now - rule.days * 86400000);
  return { history, available: history.length < rule.max };
}

function matchesWeekly(rule, context) {
  if (!validWeekly(rule) || typeof context.timezone !== 'string' || !context.timezone || !Number.isFinite(context.now)) return false;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: context.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(context.now).map(part => [part.type, part.value]));
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1;
  if (rule.allDay) return rule.days.includes(day);
  const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const current = Number(parts.hour) * 60 + Number(parts.minute), start = minutes(rule.start), end = minutes(rule.end);
  return start < end ? rule.days.includes(day) && current >= start && current < end :
    rule.days.includes(day) && current >= start || rule.days.includes(day === 1 ? 7 : day - 1) && current < end;
}

export function evaluateRules(input, context) {
  if (!input || input.schemaVersion !== RULE_SCHEMA_VERSION || !Array.isArray(input.rules)) return false;
  for (const rule of input.rules) {
    try {
      let matches = false;
      switch (rule.type) {
        case 'url': {
          const actual = new URL(context.url).pathname.replace(/\/$/, '') || '/';
          matches = (rule.include.length === 0 || rule.include.some((item) => matchesPath(actual, item))) && !rule.exclude.some((item) => matchesPath(actual, item));
          break;
        }
        case 'datetime': matches = (!rule.start || context.now >= Date.parse(rule.start)) && (!rule.end || context.now < Date.parse(rule.end)); break;
        case 'device': matches = (context.device ?? (context.viewportWidth < 768 ? 'mobile' : 'desktop')) === rule.value; break;
        case 'delay': matches = context.visibleMs >= rule.seconds * 1000; break;
        case 'scroll': matches = context.scrollPercent >= rule.percent; break;
        case 'frequency':
        case 'daily_frequency':
        case 'session_frequency': {
          if (!validFrequency(rule)) break;
          if (context.active === true) { matches = true; break; }
          if (!context.storage || !context.shopId || !context.campaignId) break;
          const raw = context.storage.getItem(impressionKey(context.shopId, context.campaignId));
          const entries = raw === null ? [] : JSON.parse(raw);
          if (!Array.isArray(entries)) break;
          matches = frequencyWindow(rule, context, entries).available;
          break;
        }
        case 'visitor': matches = ['new', 'returning'].includes(rule.value) && context.visitorType === rule.value; break;
        case 'utm': {
          const params = utmParams(rule.params);
          matches = isRecord(context.utm) && Object.entries(params).every(([key, value]) => context.utm[key] === value);
          break;
        }
        case 'pageviews': matches = Number.isInteger(rule.min) && rule.min >= 1 && rule.min <= 100 && Number.isSafeInteger(context.pageViews) && context.pageViews >= rule.min; break;
        case 'exit_intent': matches = context.exitIntent === true && Number.isFinite(context.viewportWidth) && context.viewportWidth >= 768; break;
        case 'weekly': matches = matchesWeekly(rule, context); break;
        case 'suppression': matches = validActions(rule.actions) && (context.active === true || Array.isArray(context.completedActions) && context.completedActions.every(action => ACTIONS.includes(action)) && !rule.actions.some(action => context.completedActions.includes(action))); break;
        default: return false;
      }
      if (!matches) return false;
    } catch { return false; }
  }
  return true;
}

export function recordImpression(input, context) {
  const rule = input?.rules?.find(item => FREQUENCY_TYPES.has(item.type));
  if (!rule) return true;
  if (!validFrequency(rule)) return false;
  try {
    const key = impressionKey(context.shopId, context.campaignId);
    const raw = context.storage.getItem(key);
    const entries = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(entries)) return false;
    const { history, available } = frequencyWindow(rule, context, entries);
    if (!available) return false;
    history.push(context.now);
    // All caps stop at 100. Keep the most recent impressions even across sessions.
    context.storage.setItem(key, JSON.stringify(history.slice(-100)));
    return true;
  } catch { return false; }
}
