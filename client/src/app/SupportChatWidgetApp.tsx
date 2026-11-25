import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import type { SupportMessage, SupportPublicConversation, SupportPublicSession, SupportVisitor } from '../types/support-chat';
import { SupportMessageText, SupportProductCard } from '../components/SupportProductCard';

type ApiPayload<T> = { data?: T; error?: { message?: string } };
type OutgoingVisitorMessage = {
  input: { body: string; clientMessageId: string; pageUrl: string };
  message: SupportMessage;
  delivery: 'sending' | 'sent' | 'failed';
  error?: string;
};

function matchesOutgoing(message: SupportMessage, outgoing: OutgoingVisitorMessage) {
  return message.id === outgoing.message.id || (message.senderType === 'visitor'
    && message.clientMessageId === outgoing.input.clientMessageId);
}

function mergeConversation(current: SupportPublicConversation | null, next: SupportPublicConversation | null) {
  if (!next) return current;
  if (!current || current.id !== next.id) return next;
  // A slow POST or SSE refresh must not replace a newer history snapshot.
  const messages = new Map([...current.messages, ...next.messages].map((item) => [item.id, item]));
  const newest = current.updatedAt > next.updatedAt ? current : next;
  return { ...newest, messages: [...messages.values()].sort((left, right) => {
    if (left.sequence && right.sequence && left.sequence !== right.sequence) {
      return BigInt(left.sequence) < BigInt(right.sequence) ? -1 : 1;
    }
    return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
  }).slice(-300) };
}

const params = new URLSearchParams(window.location.search);
const siteId = params.get('site') || '';
const storageKey = `mt-support-chat:${siteId || 'default'}`;
function readEmbedOrigin() {
  try {
    const origin = params.get('embedOrigin');
    if (!origin) return '';
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol) && origin === url.origin ? origin : '';
  } catch { return ''; }
}
const embedOrigin = readEmbedOrigin();
const publicApi = '/api/public/support-chat';
const sessionEndedMessage = 'Сесію чату завершено. Почніть новий діалог, щоб продовжити.';

class SupportRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function storedToken(storage: 'sessionStorage' | 'localStorage') {
  try { return window[storage].getItem(storageKey) || ''; } catch { return ''; }
}

function saveFallbackToken(token: string) {
  try {
    if (token) sessionStorage.setItem(storageKey, token);
    else sessionStorage.removeItem(storageKey);
  } catch { /* The chat can still use the in-memory token. */ }
}

function removeLegacyToken() {
  try { localStorage.removeItem(storageKey); } catch { /* Storage can be blocked in an iframe. */ }
}

function requestHeaders(options: RequestInit, token: string) {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (siteId) headers.set('X-Support-Chat-Site', siteId);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

async function publicRequest<T>(path: string, options: RequestInit = {}, token = ''): Promise<T> {
  const response = await fetch(path, { ...options, credentials: 'same-origin', headers: requestHeaders(options, token) });
  const payload = await response.json().catch(() => ({})) as ApiPayload<T>;
  if (!response.ok || !payload.data) throw new SupportRequestError(payload.error?.message || 'Не вдалося з’єднатися з підтримкою.', response.status);
  return payload.data;
}

function requestPageContext(signal: AbortSignal) {
  if (window.parent === window || !embedOrigin) return Promise.resolve('');
  return new Promise<string>((resolve) => {
    const finish = (value = '') => {
      clearTimeout(timeout);
      window.removeEventListener('message', receive);
      signal.removeEventListener('abort', abort);
      resolve(value);
    };
    const abort = () => finish();
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== embedOrigin || event.data?.type !== 'mt-support-chat:page') return;
      finish(typeof event.data.pageUrl === 'string' ? event.data.pageUrl : '');
    };
    const timeout = window.setTimeout(abort, 200);
    window.addEventListener('message', receive);
    signal.addEventListener('abort', abort, { once: true });
    window.parent.postMessage({ type: 'mt-support-chat:page' }, embedOrigin);
  });
}

async function startSession(transportToken: string, pageUrl: string, signal: AbortSignal) {
  let cookie = false;
  if (!transportToken) {
    const probe = () => publicRequest<{ cookie: boolean }>(`${publicApi}/session/transport`, { signal });
    cookie = (await probe()).cookie || (await probe()).cookie;
  }
  return publicRequest<SupportPublicSession>(`${publicApi}/session`, {
    method: 'POST', signal,
    body: JSON.stringify({ siteId, transport: cookie ? 'cookie' : 'bearer', visitorToken: transportToken || storedToken('localStorage'), embedOrigin, pageUrl })
  });
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function ChatMark() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 7.5h20v13H14l-6.5 5v-5H6z" /><path d="M11 13h10M11 17h7" /></svg>;
}

export function SupportChatWidgetApp() {
  const [open, setOpen] = useState(params.get('open') === '1');
  const [session, setSession] = useState<SupportPublicSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [outgoing, setOutgoing] = useState<OutgoingVisitorMessage[]>([]);
  const [contactOpen, setContactOpen] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [contactSaving, setContactSaving] = useState(false);
  const [contactSaved, setContactSaved] = useState(false);
  const [unread, setUnread] = useState(0);
  const messagesRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef('');
  const pageUrlRef = useRef('');
  const sendingRef = useRef(false);
  const sessionRef = useRef<SupportPublicSession | null>(null);
  const latestOperatorMessageRef = useRef('');

  const conversation = session?.conversation || null;
  const visitorId = session?.visitor.id || '';
  const visibleOutgoing = outgoing.filter((item) => !conversation?.messages.some((message) => matchesOutgoing(message, item)));
  const outsideWorkingHours = Boolean(session?.settings.workingHoursEnabled && !session.settings.isWithinWorkingHours);
  const missingRequiredOfflineContact = Boolean(outsideWorkingHours && (!session?.visitor.name || !session.visitor.phone));
  const showContactForm = Boolean(
    (session?.settings.contactFormEnabled || outsideWorkingHours)
    && conversation?.messages.some((item) => item.senderType === 'visitor')
    && (missingRequiredOfflineContact || (!outsideWorkingHours && !session?.visitor.email && !session?.visitor.phone))
    && !contactSaved
  );

  const accentStyle = useMemo(() => ({ '--support-accent': session?.settings.accentColor || '#ffe000' }) as CSSProperties, [session?.settings.accentColor]);

  const applySession = useCallback((next: SupportPublicSession) => {
    const current = sessionRef.current;
    const merged = current?.visitor.id === next.visitor.id
      ? { ...next, conversation: mergeConversation(current.conversation, next.conversation) } : next;
    sessionRef.current = merged;
    setSession(merged);
  }, []);

  function setConversation(next: SupportPublicConversation) {
    const current = sessionRef.current;
    if (current) applySession({ ...current, conversation: next });
  }

  useEffect(() => {
    if (!conversation) return;
    setOutgoing((items) => {
      const next = items.filter((item) => item.delivery === 'sending'
        || !conversation.messages.some((message) => matchesOutgoing(message, item)));
      return next.length === items.length ? items : next;
    });
  }, [conversation, outgoing]);

  const expireSession = useCallback(() => {
    tokenRef.current = '';
    saveFallbackToken('');
    sessionRef.current = null;
    setSession(null);
    setOutgoing([]);
    setUnread(0);
    setName('');
    setEmail('');
    setPhone('');
    setContactSaved(false);
    setSessionEnded(true);
    setError(sessionEndedMessage);
  }, []);

  function restartSession() {
    setSessionEnded(false);
    setLoading(true);
    setError('');
    setSessionAttempt((attempt) => attempt + 1);
  }

  const refresh = useCallback(async (signal: AbortSignal) => {
    const next = await publicRequest<SupportPublicSession>(`${publicApi}/session`, { signal }, tokenRef.current);
    if (signal.aborted || sessionRef.current?.visitor.id !== next.visitor.id) return;
    const operatorMessages = next.conversation?.messages.filter((item) => item.senderType === 'operator') || [];
    const latestOperator = operatorMessages.at(-1)?.id || '';
    if (!open && latestOperator && latestOperator !== latestOperatorMessageRef.current) setUnread((value) => value + 1);
    latestOperatorMessageRef.current = latestOperator;
    applySession(next);
  }, [open, applySession]);

  useEffect(() => {
    if (window.parent !== window && embedOrigin) {
      window.parent.postMessage({ type: 'mt-support-chat:frame', open }, embedOrigin);
    }
    if (open && visitorId) {
      setUnread(0);
      void fetch(`${publicApi}/read`, {
        method: 'POST', credentials: 'same-origin', headers: requestHeaders({}, tokenRef.current)
      }).catch(() => undefined);
    }
  }, [open, visitorId]);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    void requestPageContext(signal).then((pageUrl) => {
      signal.throwIfAborted();
      pageUrlRef.current = pageUrl;
      return startSession(storedToken('sessionStorage'), pageUrl, signal);
    }).then((next) => {
      if (signal.aborted) return;
      tokenRef.current = next.token || '';
      saveFallbackToken(tokenRef.current);
      removeLegacyToken();
      applySession(next);
      setName(next.visitor.name);
      setEmail(next.visitor.email);
      setPhone(next.visitor.phone);
      latestOperatorMessageRef.current = next.conversation?.messages.filter((item) => item.senderType === 'operator').at(-1)?.id || '';
    }).catch((reason) => {
      if (!signal.aborted) setError(reason instanceof Error ? reason.message : 'Чат тимчасово недоступний.');
    }).finally(() => { if (!signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [applySession, sessionAttempt]);

  useEffect(() => {
    if (!visitorId) return undefined;
    const controller = new AbortController();
    let buffer = '';
    void fetch(`${publicApi}/stream`, {
      credentials: 'same-origin',
      headers: requestHeaders({}, tokenRef.current),
      signal: controller.signal
    }).then(async (response) => {
      if (controller.signal.aborted) return;
      if (response.status === 401) { expireSession(); return; }
      if (!response.ok || !response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        if (events.some((event) => event.startsWith('event: session_ended\n'))) { expireSession(); break; }
        if (events.some((event) => event.startsWith('event: support\n'))) await refresh(controller.signal);
      }
    }).catch((reason) => {
      if (!controller.signal.aborted && reason instanceof SupportRequestError && reason.status === 401) expireSession();
    });
    return () => controller.abort();
  }, [refresh, visitorId, expireSession]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const node = messagesRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [conversation?.messages.length, visibleOutgoing.length, open, showContactForm]);

  async function deliver(item: OutgoingVisitorMessage) {
    if (!sessionRef.current || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError('');
    setOutgoing((items) => items.some((current) => current.input.clientMessageId === item.input.clientMessageId)
      ? items.map((current) => current.input.clientMessageId === item.input.clientMessageId ? { ...current, delivery: 'sending', error: '' } : current)
      : [...items, { ...item, delivery: 'sending', error: '' }]);
    try {
      const next = await publicRequest<SupportPublicConversation>(`${publicApi}/messages`, {
        method: 'POST',
        body: JSON.stringify(item.input)
      }, tokenRef.current);
      setConversation(next);
      const confirmed = sessionRef.current?.conversation?.messages.find((message) => matchesOutgoing(message, item));
      setOutgoing((items) => items.map((current) => current.input.clientMessageId === item.input.clientMessageId
        ? { ...current, message: confirmed || current.message, delivery: 'sent' } : current));
    } catch (reason) {
      if (reason instanceof SupportRequestError && reason.status === 401) {
        setMessage((draft) => draft || item.input.body);
        expireSession();
        return;
      }
      const confirmed = sessionRef.current?.conversation?.messages.find((message) => matchesOutgoing(message, item));
      const failure = reason instanceof Error ? reason.message : 'Не вдалося надіслати повідомлення.';
      setOutgoing((items) => items.map((current) => current.input.clientMessageId === item.input.clientMessageId
        ? { ...current, message: confirmed || current.message, delivery: confirmed ? 'sent' : 'failed', error: confirmed ? '' : failure } : current));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = message.trim();
    if (!body || !sessionRef.current || sendingRef.current) return;
    const clientMessageId = crypto.randomUUID();
    const item: OutgoingVisitorMessage = {
      input: { body, clientMessageId, pageUrl: pageUrlRef.current },
      message: { id: `pending:${clientMessageId}`, conversationId: conversation?.id || '',
        senderType: 'visitor', senderUserId: null, senderName: '', body, clientMessageId,
        productCards: [], createdAt: new Date().toISOString() },
      delivery: 'sending'
    };
    setMessage('');
    await deliver(item);
  }

  async function saveContact(event: FormEvent) {
    event.preventDefault();
    if (outsideWorkingHours && (!name.trim() || !phone.trim())) {
      setError('Поза робочим часом обов’язково вкажіть ім’я та номер телефону.');
      return;
    }
    if ((!name.trim() && !email.trim() && !phone.trim()) || !sessionRef.current) return;
    setContactSaving(true);
    setError('');
    try {
      const visitor = await publicRequest<SupportVisitor>(`${publicApi}/contact`, {
        method: 'PUT', body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim() })
      }, tokenRef.current);
      if (sessionRef.current) applySession({ ...sessionRef.current, visitor });
      setContactSaved(true);
    } catch (reason) {
      if (reason instanceof SupportRequestError && reason.status === 401) { expireSession(); return; }
      setError(reason instanceof Error ? reason.message : 'Не вдалося зберегти контакти.');
    } finally {
      setContactSaving(false);
    }
  }

  if (!open) {
    return <main className="support-widget support-widget--closed" style={accentStyle}>
      <button className="support-launcher" type="button" onClick={() => setOpen(true)} aria-label="Відкрити онлайн-підтримку">
        <ChatMark />
        {unread > 0 && <span>{unread > 9 ? '9+' : unread}</span>}
      </button>
    </main>;
  }

  return <main className="support-widget support-widget--open" style={accentStyle}>
    <section className="support-panel" aria-label="Онлайн-підтримка">
      <header className="support-panel__header">
        <span className="support-panel__mark"><ChatMark /></span>
        <div><strong>{session?.settings.name || 'Онлайн-підтримка'}</strong><small><i /> Напишіть нам — ми на зв’язку</small></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Згорнути чат">×</button>
      </header>

      <div className="support-panel__messages" ref={messagesRef} aria-live="polite">
        {loading && <div className="support-widget-state"><span />Завантажуємо чат…</div>}
        {!loading && !conversation?.messages.length && !visibleOutgoing.length && !error && <section className="support-welcome">
          <span><ChatMark /></span>
          <strong>Чим можемо допомогти?</strong>
          <p>{session?.settings.welcomeText || 'Напишіть повідомлення — оператор відповість якнайшвидше.'}</p>
        </section>}
        {conversation?.messages.map((item) => <article className={`support-message support-message--${item.senderType}${item.productCards.length ? ' has-product-card' : ''}`} key={item.id}>
          {item.senderType !== 'visitor' && <small>{item.senderName || 'Підтримка'}</small>}
          <SupportMessageText body={item.body} productCards={item.productCards} />
          {item.productCards.map((card) => <SupportProductCard card={card} key={`${item.id}-${card.id}`} />)}
          <time>{timeLabel(item.createdAt)}</time>
        </article>)}
        {visibleOutgoing.map((item) => <article className="support-message support-message--visitor" key={item.input.clientMessageId}>
          <SupportMessageText body={item.message.body} productCards={item.message.productCards} />
          {item.delivery === 'failed' && item.error && <span className="support-message__error">{item.error}</span>}
          {item.delivery === 'sending' && <span className="support-message__delivery" role="status">Надсилання…</span>}
          {item.delivery === 'failed' && <span className="support-message__delivery" role="status">Не надіслано <button type="button" onClick={() => void deliver(item)} disabled={sending}>Повторити надсилання</button></span>}
          <time>{timeLabel(item.message.createdAt)}</time>
        </article>)}

        {showContactForm && <section className={`support-contact-card${outsideWorkingHours ? ' support-contact-card--required' : ''}`}>
          <header><div><strong>{outsideWorkingHours ? 'Залиште ім’я та телефон' : 'Залишити контакти'}</strong><p>{outsideWorkingHours ? 'Ці дані обов’язкові, щоб менеджер міг зв’язатися з вами у робочий час.' : session?.settings.contactFormPrompt}</p></div><button type="button" onClick={() => setContactOpen((value) => !value)}>{contactOpen ? '−' : '+'}</button></header>
          {contactOpen && <form onSubmit={(event) => void saveContact(event)}>
            <input type="text" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder={outsideWorkingHours ? 'Ім’я *' : 'Ім’я (необов’язково)'} maxLength={160} required={outsideWorkingHours} />
            <input type="email" name="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email (необов’язково)" />
            <input type="tel" name="phone" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder={outsideWorkingHours ? 'Номер телефону *' : 'Телефон (необов’язково)'} required={outsideWorkingHours} />
            <div><button type="button" onClick={() => setContactOpen(false)}>Не зараз</button><button type="submit" disabled={contactSaving || (outsideWorkingHours ? !name.trim() || !phone.trim() : !name.trim() && !email.trim() && !phone.trim())}>{contactSaving ? 'Зберігаємо…' : 'Зберегти'}</button></div>
          </form>}
        </section>}
        {contactSaved && <p className="support-contact-saved">Контакти збережено. Дякуємо!</p>}
        {error && <p className="support-widget-error">{error}</p>}
        {sessionEnded && <button className="support-session-restart" type="button" onClick={restartSession}>Почати новий діалог</button>}
      </div>

      <form className="support-composer" onSubmit={(event) => void send(event)}>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Напишіть повідомлення…" rows={1} maxLength={5000} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }} />
        <button type="submit" disabled={!session || !message.trim() || sending} aria-label="Надіслати повідомлення">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 17-8-6 18-3-7-8-3Z" /><path d="m11 14 9-11" /></svg>
        </button>
      </form>
      <footer className="support-panel__footer">Mobile Trend · Онлайн-підтримка</footer>
    </section>
  </main>;
}
