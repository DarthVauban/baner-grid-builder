import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type {
  SupportChatSettingsInput,
  SupportConversation,
  SupportConversationStatus,
  SupportMessage
} from '../types/support-chat';
import '../styles/online-support.css';

const statuses: Array<{ value: SupportConversationStatus | ''; label: string }> = [
  { value: '', label: 'Усі діалоги' },
  { value: 'NEW', label: 'Нові' },
  { value: 'OPEN', label: 'У роботі' },
  { value: 'WAITING_CUSTOMER', label: 'Очікуємо покупця' },
  { value: 'RESOLVED', label: 'Вирішені' },
  { value: 'CLOSED', label: 'Закриті' }
];

const statusLabels: Record<SupportConversationStatus, string> = {
  NEW: 'Новий',
  OPEN: 'У роботі',
  WAITING_CUSTOMER: 'Очікуємо покупця',
  RESOLVED: 'Вирішено',
  CLOSED: 'Закрито'
};

function visitorLabel(item: SupportConversation) {
  return item.visitor.email || item.visitor.phone || `Відвідувач ${item.visitor.id.slice(0, 6)}`;
}

function shortDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' }).format(date)
    : new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: 'short' }).format(date);
}

function messageTime(value: string) {
  return new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function SettingsPanel() {
  const { showToast } = useToast();
  const settings = useQuery({ queryKey: ['online-support-settings'], queryFn: api.onlineSupport.settings });
  const [draft, setDraft] = useState<SupportChatSettingsInput | null>(null);
  const [origins, setOrigins] = useState('');
  const save = useMutation({ mutationFn: api.onlineSupport.saveSettings });

  useEffect(() => {
    if (!settings.data) return;
    setDraft({
      name: settings.data.name,
      enabled: settings.data.enabled,
      allowedOrigins: settings.data.allowedOrigins,
      accentColor: settings.data.accentColor,
      welcomeText: settings.data.welcomeText,
      autoReplyText: settings.data.autoReplyText,
      contactFormEnabled: settings.data.contactFormEnabled,
      contactFormPrompt: settings.data.contactFormPrompt
    });
    setOrigins(settings.data.allowedOrigins.join('\n'));
  }, [settings.data]);

  if (settings.isLoading || !draft) return <div className="online-support-state">Завантажуємо налаштування…</div>;
  if (settings.isError) return <div className="online-support-state online-support-state--error">Не вдалося завантажити налаштування віджета.</div>;

  const embedCode = `<script src="${window.location.origin}/api/public/support-chat/embed.js" data-site="${settings.data?.publicId || ''}" async></script>`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const next = await save.mutateAsync({
        ...draft!,
        allowedOrigins: origins.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
      });
      await settings.refetch();
      setOrigins(next.allowedOrigins.join('\n'));
      showToast('Налаштування онлайн-підтримки збережено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти налаштування.', 'error');
    }
  }

  return <div className="online-support-settings">
    <form className="online-support-settings__form" onSubmit={(event) => void submit(event)}>
      <section className="online-support-card">
        <header><div><p className="eyebrow">Віджет</p><h2>Основні налаштування</h2></div><label className="online-support-switch"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /><span />{draft.enabled ? 'Увімкнено' : 'Вимкнено'}</label></header>
        <div className="online-support-settings__grid">
          <label className="field"><span>Назва підтримки</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={160} required /></label>
          <label className="field online-support-color"><span>Акцентний колір</span><div><input type="color" value={draft.accentColor} onChange={(event) => setDraft({ ...draft, accentColor: event.target.value })} /><input value={draft.accentColor} onChange={(event) => setDraft({ ...draft, accentColor: event.target.value })} pattern="#[0-9a-fA-F]{6}" /></div></label>
          <label className="field field--wide"><span>Привітання до першого повідомлення</span><textarea value={draft.welcomeText} onChange={(event) => setDraft({ ...draft, welcomeText: event.target.value })} maxLength={500} required /></label>
          <label className="field field--wide"><span>Автоматична відповідь після першого повідомлення</span><textarea value={draft.autoReplyText} onChange={(event) => setDraft({ ...draft, autoReplyText: event.target.value })} maxLength={1000} required /></label>
          <label className="online-support-check field--wide"><input type="checkbox" checked={draft.contactFormEnabled} onChange={(event) => setDraft({ ...draft, contactFormEnabled: event.target.checked })} /><span><strong>Показувати необов’язкову форму контактів</strong><small>Покупець зможе продовжити чат, не заповнюючи її.</small></span></label>
          {draft.contactFormEnabled && <label className="field field--wide"><span>Текст над email і телефоном</span><textarea value={draft.contactFormPrompt} onChange={(event) => setDraft({ ...draft, contactFormPrompt: event.target.value })} maxLength={500} required /></label>}
        </div>
      </section>

      <section className="online-support-card">
        <header><div><p className="eyebrow">Безпека</p><h2>Дозволені сайти</h2></div></header>
        <label className="field"><span>По одному origin у рядку</span><textarea value={origins} onChange={(event) => setOrigins(event.target.value)} placeholder={'https://mobiletrend.com.ua\nhttps://www.mobiletrend.com.ua'} /><small>Якщо список порожній, віджет можна відкрити з будь-якого сайту.</small></label>
      </section>

      <button className="button button--primary" type="submit" disabled={save.isPending}><Icon name="save" size={17} /> {save.isPending ? 'Зберігаємо…' : 'Зберегти налаштування'}</button>
    </form>

    <aside className="online-support-settings__aside">
      <section className="online-support-card online-support-install">
        <p className="eyebrow">Встановлення</p><h2>Код для сайту</h2><p>Додайте цей скрипт перед закривальним тегом <code>&lt;/body&gt;</code>.</p>
        <pre>{embedCode}</pre>
        <button className="button button--secondary" type="button" onClick={() => void navigator.clipboard.writeText(embedCode).then(() => showToast('Код віджета скопійовано.', 'success'))}><Icon name="copy" size={17} /> Копіювати</button>
      </section>
      <section className="online-support-card online-support-preview">
        <header><div><p className="eyebrow">Preview</p><h2>Віджет покупця</h2></div><a href={`/support-chat/widget?site=${settings.data?.publicId}&open=1&embedOrigin=${encodeURIComponent(window.location.origin)}`} target="_blank" rel="noreferrer"><Icon name="openInNew" size={16} /></a></header>
        <iframe title="Попередній перегляд онлайн-підтримки" src={`/support-chat/widget?site=${settings.data?.publicId}&open=1&embedOrigin=${encodeURIComponent(window.location.origin)}`} />
      </section>
    </aside>
  </div>;
}

function ConversationListItem({ item, active, onSelect }: { item: SupportConversation; active: boolean; onSelect: () => void }) {
  return <button className={`online-support-conversation${active ? ' is-active' : ''}`} type="button" onClick={onSelect}>
    <span className="online-support-avatar">{visitorLabel(item).slice(0, 1).toUpperCase()}</span>
    <span className="online-support-conversation__copy"><span><strong>{visitorLabel(item)}</strong><time>{shortDate(item.updatedAt)}</time></span><small>{item.lastMessage?.body || 'Новий діалог'}</small><span><em className={`is-${item.status.toLowerCase()}`}>{statusLabels[item.status]}</em>{item.assignedUser && <b>{item.assignedUser.name}</b>}</span></span>
    {item.unreadCount > 0 && <i>{item.unreadCount > 99 ? '99+' : item.unreadCount}</i>}
  </button>;
}

function MessageBubble({ item }: { item: SupportMessage }) {
  return <article className={`online-support-message is-${item.senderType}`}>
    {item.senderType !== 'visitor' && <small>{item.senderName || 'Автоматична відповідь'}</small>}
    <p>{item.body}</p><time>{messageTime(item.createdAt)}</time>
  </article>;
}

function ConversationsPanel() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SupportConversationStatus | ''>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const transcriptRef = useRef<HTMLDivElement>(null);
  const conversations = useQuery({
    queryKey: ['online-support-conversations', search, status],
    queryFn: () => api.onlineSupport.conversations({ search, status }),
    refetchOnMount: 'always'
  });
  const detail = useQuery({
    queryKey: ['online-support-conversation', selectedId],
    queryFn: () => api.onlineSupport.conversation(selectedId!),
    enabled: Boolean(selectedId),
    refetchOnMount: 'always'
  });
  const send = useMutation({ mutationFn: ({ id, body }: { id: string; body: string }) => api.onlineSupport.sendMessage(id, body, crypto.randomUUID()) });
  const claim = useMutation({ mutationFn: api.onlineSupport.claim });
  const setConversationStatus = useMutation({ mutationFn: ({ id, next }: { id: string; next: SupportConversationStatus }) => api.onlineSupport.setStatus(id, next) });

  useEffect(() => {
    if (!conversations.data?.length) { setSelectedId(null); return; }
    if (selectedId && conversations.data.some((item) => item.id === selectedId)) return;
    setSelectedId(conversations.data[0].id);
  }, [conversations.data, selectedId]);

  useEffect(() => {
    if (!selectedId || !detail.data) return;
    void api.onlineSupport.markRead(selectedId).then(() => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['online-support-conversations'] }),
      queryClient.invalidateQueries({ queryKey: ['online-support-unread-count'] })
    ])).catch(() => undefined);
  }, [detail.data, queryClient, selectedId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [detail.data?.messages.length]);

  async function refreshCurrent() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['online-support-conversations'] }),
      queryClient.invalidateQueries({ queryKey: ['online-support-conversation', selectedId] }),
      queryClient.invalidateQueries({ queryKey: ['online-support-unread-count'] })
    ]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = message.trim();
    if (!selectedId || !body || send.isPending) return;
    try {
      await send.mutateAsync({ id: selectedId, body });
      setMessage('');
      await refreshCurrent();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося надіслати відповідь.', 'error');
    }
  }

  async function claimCurrent() {
    if (!selectedId) return;
    try { await claim.mutateAsync(selectedId); await refreshCurrent(); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Не вдалося взяти діалог у роботу.', 'error'); }
  }

  async function changeStatus(next: SupportConversationStatus) {
    if (!selectedId) return;
    try { await setConversationStatus.mutateAsync({ id: selectedId, next }); await refreshCurrent(); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Не вдалося змінити статус.', 'error'); }
  }

  const current = detail.data?.conversation;

  return <div className="online-support-workspace">
    <aside className="online-support-queue">
      <header><div><p className="eyebrow">Черга</p><h2>Діалоги</h2></div><span>{conversations.data?.length || 0}</span></header>
      <label className="online-support-search"><Icon name="search" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Пошук контактів…" />{search && <button type="button" onClick={() => setSearch('')}><Icon name="close" size={14} /></button>}</label>
      <div className="online-support-filters">{statuses.map((item) => <button className={status === item.value ? 'is-active' : ''} type="button" onClick={() => setStatus(item.value)} key={item.value || 'all'}>{item.label}</button>)}</div>
      <div className="online-support-conversation-list">
        {conversations.isLoading && <p className="online-support-list-state">Завантажуємо звернення…</p>}
        {!conversations.isLoading && !conversations.data?.length && <p className="online-support-list-state">Діалогів за цим фільтром немає.</p>}
        {conversations.data?.map((item) => <ConversationListItem item={item} active={selectedId === item.id} onSelect={() => setSelectedId(item.id)} key={item.id} />)}
      </div>
    </aside>

    <section className="online-support-dialog">
      {!selectedId && <div className="online-support-empty"><span><Icon name="chat" size={30} /></span><h2>Оберіть діалог</h2><p>Нові звернення покупців з’являтимуться у черзі зліва.</p></div>}
      {selectedId && detail.isLoading && <div className="online-support-state">Завантажуємо повідомлення…</div>}
      {current && <>
        <header className="online-support-dialog__header"><div><span className="online-support-avatar">{visitorLabel(current).slice(0, 1).toUpperCase()}</span><div><strong>{visitorLabel(current)}</strong><small>{current.visitor.lastPageTitle || 'Сторінку не визначено'}</small></div></div><div>{!current.assignedUser && <button className="button button--secondary" type="button" onClick={() => void claimCurrent()} disabled={claim.isPending}>Взяти в роботу</button>}<select value={current.status} onChange={(event) => void changeStatus(event.target.value as SupportConversationStatus)}>{statuses.filter((item) => item.value).map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></div></header>
        <div className="online-support-transcript" ref={transcriptRef}>{detail.data?.messages.map((item) => <MessageBubble item={item} key={item.id} />)}</div>
        <form className="online-support-composer" onSubmit={(event) => void submit(event)}><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Напишіть відповідь покупцю…" rows={2} maxLength={5000} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button className="button button--primary" type="submit" disabled={!message.trim() || send.isPending}><Icon name="send" size={18} /> {send.isPending ? 'Надсилаємо…' : 'Надіслати'}</button></form>
      </>}
    </section>

    <aside className="online-support-customer">
      {current ? <><header><p className="eyebrow">Покупець</p><h2>Деталі звернення</h2></header><dl><div><dt>Email</dt><dd>{current.visitor.email || 'Не залишено'}</dd></div><div><dt>Телефон</dt><dd>{current.visitor.phone || 'Не залишено'}</dd></div><div><dt>Оператор</dt><dd>{current.assignedUser?.name || 'Не призначено'}</dd></div><div><dt>Створено</dt><dd>{new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(current.createdAt))}</dd></div></dl><section><span>Поточна сторінка</span><strong>{current.visitor.lastPageTitle || 'Без назви'}</strong>{current.visitor.lastPageUrl && <a href={current.visitor.lastPageUrl} target="_blank" rel="noreferrer">Відкрити сторінку <Icon name="openInNew" size={14} /></a>}</section></> : <p className="online-support-list-state">Інформація з’явиться після вибору діалогу.</p>}
    </aside>
  </div>;
}

export function OnlineSupportPage() {
  const [tab, setTab] = useState<'chats' | 'settings'>('chats');
  return <div className="online-support-page">
    <header className="page-heading online-support-heading"><div><p className="eyebrow">Комунікація з покупцями</p><h1>Онлайн-підтримка</h1><p>Відповідайте на звернення із сайту та керуйте поведінкою віджета.</p></div><div className="online-support-tabs"><button className={tab === 'chats' ? 'is-active' : ''} type="button" onClick={() => setTab('chats')}><Icon name="chat" size={17} /> Діалоги</button><button className={tab === 'settings' ? 'is-active' : ''} type="button" onClick={() => setTab('settings')}><Icon name="integrations" size={17} /> Налаштування</button></div></header>
    {tab === 'chats' ? <ConversationsPanel /> : <SettingsPanel />}
  </div>;
}
