import { createHash, randomBytes } from 'node:crypto';
import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';

export const supportChatToolId = 'online_support';
export const supportWorkingDayKeys = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
];

const defaultWorkingHoursSchedule = {
  monday: { enabled: true, start: '09:00', end: '18:00' },
  tuesday: { enabled: true, start: '09:00', end: '18:00' },
  wednesday: { enabled: true, start: '09:00', end: '18:00' },
  thursday: { enabled: true, start: '09:00', end: '18:00' },
  friday: { enabled: true, start: '09:00', end: '18:00' },
  saturday: { enabled: false, start: '10:00', end: '17:00' },
  sunday: { enabled: false, start: '10:00', end: '17:00' }
};

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/u;

export function normalizeSupportWorkingHoursSchedule(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(supportWorkingDayKeys.map((day) => {
    const fallback = defaultWorkingHoursSchedule[day];
    const entry = source[day] && typeof source[day] === 'object' ? source[day] : {};
    const start = timePattern.test(String(entry.start || '')) ? String(entry.start) : fallback.start;
    const end = timePattern.test(String(entry.end || '')) ? String(entry.end) : fallback.end;
    const enabled = Object.hasOwn(entry, 'enabled') ? entry.enabled === true : fallback.enabled;
    return [day, { enabled, start, end }];
  }));
}

export function isValidSupportTimezone(value) {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: String(value || '') }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function isWithinSupportWorkingHours(settings, now = new Date()) {
  const enabled = settings.working_hours_enabled ?? settings.workingHoursEnabled;
  if (enabled !== true) return true;
  const timezone = String(settings.working_hours_timezone ?? settings.workingHoursTimezone ?? 'Europe/Kyiv');
  if (!isValidSupportTimezone(timezone)) return false;
  const schedule = normalizeSupportWorkingHoursSchedule(
    settings.working_hours_schedule ?? settings.workingHoursSchedule
  );
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const day = String(parts.weekday || '').toLowerCase();
  const entry = schedule[day];
  if (!entry?.enabled) return false;
  const currentTime = `${parts.hour}:${parts.minute}`;
  return currentTime >= entry.start && currentTime < entry.end;
}

export function hashSupportSessionToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

export function createSupportSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function normalizeSupportOrigin(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin : '';
  } catch {
    return '';
  }
}

export function normalizeSupportPageUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href.slice(0, 4000) : '';
  } catch {
    return '';
  }
}

export function serializeSupportSettings(row) {
  const workingHoursSchedule = normalizeSupportWorkingHoursSchedule(row.working_hours_schedule);
  return {
    id: row.id,
    publicId: row.public_id,
    name: row.name,
    enabled: row.enabled === true,
    allowedOrigins: Array.isArray(row.allowed_origins) ? row.allowed_origins : [],
    accentColor: row.accent_color,
    welcomeText: row.welcome_text,
    autoReplyText: row.auto_reply_text,
    contactFormEnabled: row.contact_form_enabled === true,
    contactFormPrompt: row.contact_form_prompt,
    workingHoursEnabled: row.working_hours_enabled === true,
    workingHoursTimezone: row.working_hours_timezone || 'Europe/Kyiv',
    workingHoursSchedule,
    offlineReplyText: row.offline_reply_text || '',
    isWithinWorkingHours: isWithinSupportWorkingHours(row),
    updatedAt: row.updated_at
  };
}

export function serializeSupportVisitor(row) {
  return {
    id: row.visitor_id || row.id,
    name: row.name || '',
    email: row.email || '',
    phone: row.phone || '',
    firstPageUrl: row.first_page_url || '',
    lastPageUrl: row.last_page_url || '',
    lastPageTitle: row.last_page_title || '',
    createdAt: row.visitor_created_at || row.created_at,
    lastSeenAt: row.last_seen_at
  };
}

export function serializeSupportMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderType: row.sender_type,
    senderUserId: row.sender_user_id || null,
    senderName: row.sender_name || (row.sender_type === 'system' ? 'Автоматична відповідь' : ''),
    body: row.body,
    productCards: Array.isArray(row.product_cards) ? row.product_cards : [],
    createdAt: row.created_at
  };
}

export function serializeSupportConversation(row) {
  return {
    id: row.id,
    status: row.status,
    assignedUser: row.assigned_user_id ? {
      id: row.assigned_user_id,
      name: row.assigned_user_name || 'Оператор'
    } : null,
    visitor: serializeSupportVisitor(row),
    lastMessage: row.last_message_body ? {
      body: row.last_message_body,
      senderType: row.last_message_sender_type,
      createdAt: row.last_message_created_at
    } : null,
    unreadCount: Number(row.unread_count || 0),
    firstResponseAt: row.first_response_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function loadSupportSite(publicId = '', { requireEnabled = false } = {}) {
  const result = await query(
    `SELECT * FROM support_chat_sites
     WHERE ($1 = '' OR public_id::TEXT = $1)
       AND ($2::BOOLEAN = FALSE OR enabled = TRUE)
     ORDER BY created_at
     LIMIT 1`,
    [String(publicId || ''), requireEnabled]
  );
  if (!result.rows[0]) throw new AppError(404, 'SUPPORT_SITE_NOT_FOUND', 'Віджет онлайн-підтримки не знайдено або вимкнено.');
  return result.rows[0];
}

export async function loadSupportVisitorByToken(token, { requireEnabled = true } = {}) {
  if (!token || token.length < 32 || token.length > 200) {
    throw new AppError(401, 'SUPPORT_SESSION_REQUIRED', 'Сесію чату не знайдено.');
  }
  const result = await query(
    `SELECT visitor.*, site.public_id, site.name AS site_name, site.enabled,
            site.allowed_origins, site.accent_color, site.welcome_text,
            site.auto_reply_text, site.contact_form_enabled, site.contact_form_prompt,
            site.working_hours_enabled, site.working_hours_timezone,
            site.working_hours_schedule, site.offline_reply_text,
            site.updated_at AS site_updated_at
     FROM support_chat_visitors AS visitor
     JOIN support_chat_sites AS site ON site.id = visitor.site_id
     WHERE visitor.session_token_hash = $1
       AND ($2::BOOLEAN = FALSE OR site.enabled = TRUE)`,
    [hashSupportSessionToken(token), requireEnabled]
  );
  if (!result.rows[0]) throw new AppError(401, 'SUPPORT_SESSION_INVALID', 'Сесія чату недійсна або завершена.');
  return result.rows[0];
}

export function supportWidgetEmbedScript(origin) {
  return `(() => {
  const script = document.currentScript;
  if (!script) return;
  const siteId = script.dataset.site || '';
  const widgetOrigin = ${JSON.stringify(origin)};
  const frame = document.createElement('iframe');
  const widgetUrl = new URL('/support-chat/widget', widgetOrigin);
  if (siteId) widgetUrl.searchParams.set('site', siteId);
  widgetUrl.searchParams.set('embedOrigin', window.location.origin);
  widgetUrl.searchParams.set('pageUrl', window.location.href);
  widgetUrl.searchParams.set('pageTitle', document.title);
  frame.src = widgetUrl.toString();
  frame.title = 'Онлайн-підтримка';
  frame.setAttribute('aria-label', 'Онлайн-підтримка');
  frame.style.position = 'fixed';
  frame.style.zIndex = '2147483000';
  frame.style.right = '16px';
  frame.style.bottom = '16px';
  frame.style.width = '76px';
  frame.style.height = '76px';
  frame.style.border = '0';
  frame.style.background = 'transparent';
  frame.style.colorScheme = 'light';
  frame.style.transition = 'width 180ms ease, height 180ms ease, right 180ms ease, bottom 180ms ease';
  frame.setAttribute('allow', 'clipboard-write');
  (document.body || document.documentElement).appendChild(frame);

  window.addEventListener('message', (event) => {
    if (event.origin !== widgetUrl.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type !== 'mt-support-chat:frame') return;
    const open = event.data.open === true;
    const mobile = open && window.matchMedia('(max-width: 560px)').matches;
    frame.style.right = mobile ? '0' : '16px';
    frame.style.bottom = mobile ? '0' : '16px';
    frame.style.width = mobile ? '100vw' : open ? '420px' : '76px';
    frame.style.height = mobile ? '100dvh' : open ? 'min(700px, calc(100vh - 32px))' : '76px';
  });
})();`;
}
