import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import type { SupportPublicConversation, SupportPublicSession, SupportVisitor } from '../types/support-chat';

type ApiPayload<T> = { data?: T; error?: { message?: string } };

const params = new URLSearchParams(window.location.search);
const siteId = params.get('site') || '';
const storageKey = `mt-support-chat:${siteId || 'default'}`;
const initialPageUrl = params.get('pageUrl') || document.referrer || '';
const initialPageTitle = params.get('pageTitle') || '';
const embedOrigin = params.get('embedOrigin') || '';

async function publicRequest<T>(path: string, options: RequestInit = {}, token = ''): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({})) as ApiPayload<T>;
  if (!response.ok || !payload.data) throw new Error(payload.error?.message || 'Не вдалося з’єднатися з підтримкою.');
  return payload.data;
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
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [contactOpen, setContactOpen] = useState(true);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [contactSaving, setContactSaving] = useState(false);
  const [contactSaved, setContactSaved] = useState(false);
  const [unread, setUnread] = useState(0);
  const messagesRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef('');
  const latestOperatorMessageRef = useRef('');

  const conversation = session?.conversation || null;
  const showContactForm = Boolean(
    session?.settings.contactFormEnabled
    && conversation?.messages.some((item) => item.senderType === 'visitor')
    && !session.visitor.email
    && !session.visitor.phone
    && !contactSaved
  );

  const accentStyle = useMemo(() => ({ '--support-accent': session?.settings.accentColor || '#ffe000' }) as CSSProperties, [session?.settings.accentColor]);

  function setConversation(next: SupportPublicConversation) {
    setSession((current) => current ? { ...current, conversation: next } : current);
  }

  const refresh = useCallback(async (token = tokenRef.current) => {
    if (!token) return;
    const next = await publicRequest<SupportPublicSession>('/api/public/support-chat/session', {}, token);
    const operatorMessages = next.conversation?.messages.filter((item) => item.senderType === 'operator') || [];
    const latestOperator = operatorMessages.at(-1)?.id || '';
    if (!open && latestOperator && latestOperator !== latestOperatorMessageRef.current) setUnread((value) => value + 1);
    latestOperatorMessageRef.current = latestOperator;
    setSession(next);
  }, [open]);

  useEffect(() => {
    window.parent.postMessage({ type: 'mt-support-chat:frame', open }, '*');
    if (open) {
      setUnread(0);
      if (tokenRef.current) void fetch('/api/public/support-chat/read', {
        method: 'POST', headers: { Authorization: `Bearer ${tokenRef.current}` }
      });
    }
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    const storedToken = localStorage.getItem(storageKey) || '';
    void publicRequest<SupportPublicSession>('/api/public/support-chat/session', {
      method: 'POST',
      body: JSON.stringify({
        siteId,
        visitorToken: storedToken,
        embedOrigin,
        pageUrl: initialPageUrl,
        pageTitle: initialPageTitle
      })
    }).then((next) => {
      if (cancelled) return;
      tokenRef.current = next.token;
      localStorage.setItem(storageKey, next.token);
      setSession(next);
      setEmail(next.visitor.email);
      setPhone(next.visitor.phone);
      latestOperatorMessageRef.current = next.conversation?.messages.filter((item) => item.senderType === 'operator').at(-1)?.id || '';
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Чат тимчасово недоступний.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const token = tokenRef.current;
    if (!token || !session) return undefined;
    const controller = new AbortController();
    let buffer = '';
    void fetch('/api/public/support-chat/stream', {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    }).then(async (response) => {
      if (!response.ok || !response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        if (events.some((event) => event.includes('event: support'))) await refresh(token);
      }
    }).catch(() => undefined);
    return () => controller.abort();
  }, [refresh, session]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const node = messagesRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [conversation?.messages.length, open, showContactForm]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = message.trim();
    if (!body || !tokenRef.current || sending) return;
    setSending(true);
    setError('');
    try {
      const next = await publicRequest<SupportPublicConversation>('/api/public/support-chat/messages', {
        method: 'POST',
        body: JSON.stringify({
          body,
          clientMessageId: crypto.randomUUID(),
          pageUrl: initialPageUrl,
          pageTitle: initialPageTitle
        })
      }, tokenRef.current);
      setMessage('');
      setConversation(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося надіслати повідомлення.');
    } finally {
      setSending(false);
    }
  }

  async function saveContact(event: FormEvent) {
    event.preventDefault();
    if ((!email.trim() && !phone.trim()) || !tokenRef.current) return;
    setContactSaving(true);
    setError('');
    try {
      const visitor = await publicRequest<SupportVisitor>('/api/public/support-chat/contact', {
        method: 'PUT', body: JSON.stringify({ email: email.trim(), phone: phone.trim() })
      }, tokenRef.current);
      setSession((current) => current ? { ...current, visitor } : current);
      setContactSaved(true);
    } catch (reason) {
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
        {!loading && !conversation?.messages.length && !error && <section className="support-welcome">
          <span><ChatMark /></span>
          <strong>Чим можемо допомогти?</strong>
          <p>{session?.settings.welcomeText || 'Напишіть повідомлення — оператор відповість якнайшвидше.'}</p>
        </section>}
        {conversation?.messages.map((item) => <article className={`support-message support-message--${item.senderType}`} key={item.id}>
          {item.senderType !== 'visitor' && <small>{item.senderName || 'Підтримка'}</small>}
          <p>{item.body}</p>
          <time>{timeLabel(item.createdAt)}</time>
        </article>)}

        {showContactForm && <section className="support-contact-card">
          <header><div><strong>Залишити контакти</strong><p>{session?.settings.contactFormPrompt}</p></div><button type="button" onClick={() => setContactOpen((value) => !value)}>{contactOpen ? '−' : '+'}</button></header>
          {contactOpen && <form onSubmit={(event) => void saveContact(event)}>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email (необов’язково)" />
            <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Телефон (необов’язково)" />
            <div><button type="button" onClick={() => setContactOpen(false)}>Не зараз</button><button type="submit" disabled={contactSaving || (!email.trim() && !phone.trim())}>{contactSaving ? 'Зберігаємо…' : 'Зберегти'}</button></div>
          </form>}
        </section>}
        {contactSaved && <p className="support-contact-saved">Контакти збережено. Дякуємо!</p>}
        {error && <p className="support-widget-error">{error}</p>}
      </div>

      <form className="support-composer" onSubmit={(event) => void send(event)}>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Напишіть повідомлення…" rows={1} maxLength={5000} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }} />
        <button type="submit" disabled={!message.trim() || sending} aria-label="Надіслати повідомлення">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 17-8-6 18-3-7-8-3Z" /><path d="m11 14 9-11" /></svg>
        </button>
      </form>
      <footer className="support-panel__footer">Mobile Trend · Онлайн-підтримка</footer>
    </section>
  </main>;
}
