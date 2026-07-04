import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { getInitials } from '../lib/user';
import { useToast } from '../toast/ToastContext';
import type { ChatConversation, ChatEntity, ChatMessage, ChatPerson } from '../types/chat';
import { ChatEntityCard } from '../components/ChatEntityCard';
import { Icon } from '../components/Icon';

function formatChatTime(value: string): string {
  return new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function isEntityUrl(value: string, entities: ChatEntity[]): boolean {
  try {
    const url = new URL(value);
    return entities.some((entity) => (
      (entity.type === 'task' && url.pathname === '/tasks' && url.searchParams.get('task') === entity.id)
      || (entity.type === 'publication' && url.pathname === '/tools/blog-publications' && url.searchParams.get('publication') === entity.id)
    ));
  } catch { return false; }
}

function renderMessageBody(message: ChatMessage): ReactNode {
  const parts = message.body.split(/(https?:\/\/[^\s<>"']+)/gi);
  const rendered = parts.map((part, index) => {
    if (!/^https?:\/\//i.test(part)) return part;
    const clean = part.replace(/[),.;!?]+$/g, '');
    if (isEntityUrl(clean, message.entities)) return part.slice(clean.length);
    return <a key={`${part}-${index}`} href={clean} target="_blank" rel="noreferrer">{clean}<Icon name="openInNew" size={13} /></a>;
  });
  return rendered.some((part) => typeof part !== 'string' || part.trim()) ? rendered : null;
}

function ContactsModal({ contacts, loading, onClose, onSelect }: {
  contacts: ChatPerson[];
  loading: boolean;
  onClose: () => void;
  onSelect: (contact: ChatPerson) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? contacts.filter((contact) => `${contact.name} ${contact.email}`.toLowerCase().includes(needle)) : contacts;
  }, [contacts, search]);

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal chat-contacts-modal" role="dialog" aria-modal="true" aria-labelledby="chat-contacts-title">
      <header className="modal__header"><div><p className="eyebrow">Новий діалог</p><h2 id="chat-contacts-title">Усі контакти</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={20} /></button></header>
      <div className="chat-contacts-modal__content">
        <div className="task-search chat-contacts-modal__search"><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Пошук у контактах" />{search && <button type="button" onClick={() => setSearch('')} aria-label="Очистити"><Icon name="close" size={15} /></button>}</div>
        {loading && <p className="chat-empty-copy">Завантажуємо контакти…</p>}
        {!loading && !filtered.length && <p className="chat-empty-copy">Доступних контактів немає.</p>}
        <div className="chat-contact-list">{filtered.map((contact) => <button type="button" key={contact.id} onClick={() => onSelect(contact)}><span className="avatar">{getInitials(contact.name)}</span><span><strong>{contact.name}</strong><small>{contact.email}</small></span><Icon name="arrow" size={18} /></button>)}</div>
      </div>
    </section>
  </div>;
}

export function ChatPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('conversation'));
  const [draftContact, setDraftContact] = useState<ChatPerson | null>(null);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const messageEndRef = useRef<HTMLDivElement>(null);
  const conversations = useQuery({ queryKey: ['chat-conversations'], queryFn: api.chat.conversations, refetchOnMount: 'always' });
  const contacts = useQuery({ queryKey: ['chat-contacts'], queryFn: api.chat.contacts, enabled: contactsOpen, staleTime: 60_000 });
  const messages = useQuery({
    queryKey: ['chat-messages', selectedId],
    queryFn: () => api.chat.messages(selectedId!),
    enabled: Boolean(selectedId),
    refetchOnMount: 'always'
  });
  const startConversation = useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: string }) => api.chat.startConversation(userId, body)
  });
  const send = useMutation({ mutationFn: ({ conversationId, body }: { conversationId: string; body: string }) => api.chat.sendMessage(conversationId, body) });
  const activeConversation = conversations.data?.find((conversation) => conversation.id === selectedId) || null;
  const activeContact = activeConversation?.contact || draftContact;

  useEffect(() => {
    if (draftContact) return;
    if (!conversations.data?.length) return;
    if (selectedId && conversations.data.some((conversation) => conversation.id === selectedId)) return;
    const conversationId = conversations.data[0].id;
    setSelectedId(conversationId);
    setSearchParams({ conversation: conversationId }, { replace: true });
  }, [conversations.data, draftContact, selectedId, setSearchParams]);

  useEffect(() => {
    if (!selectedId || !messages.data) return;
    void api.chat.markRead(selectedId).then(() => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] }),
      queryClient.invalidateQueries({ queryKey: ['chat-unread-count'] })
    ])).catch(() => undefined);
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.data, queryClient, selectedId]);

  function selectContact(contact: ChatPerson) {
    const existingConversation = conversations.data?.find((conversation) => conversation.contact.id === contact.id);
    setDraftContact(existingConversation ? null : contact);
    setSelectedId(existingConversation?.id || null);
    setSearchParams(existingConversation ? { conversation: existingConversation.id } : {}, { replace: true });
    setContactsOpen(false);
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const body = message.trim();
    if ((!selectedId && !draftContact) || !body || send.isPending || startConversation.isPending) return;
    try {
      setMessage('');
      let conversationId = selectedId;
      if (conversationId) {
        await send.mutateAsync({ conversationId, body });
      } else if (draftContact) {
        const conversation = await startConversation.mutateAsync({ userId: draftContact.id, body });
        conversationId = conversation.id;
        setDraftContact(null);
        setSelectedId(conversation.id);
        setSearchParams({ conversation: conversation.id }, { replace: true });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['chat-messages', conversationId] }),
        queryClient.invalidateQueries({ queryKey: ['chat-conversations'] })
      ]);
    } catch (error) {
      setMessage(body);
      showToast(error instanceof Error ? error.message : 'Не вдалося надіслати повідомлення.', 'error');
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  return <div className="chat-page">
    <header className="page-heading page-heading--row chat-page__heading"><div><p className="eyebrow">Комунікація</p><h1>Чат</h1><p>Обговорюйте роботу та діліться інтерактивними картками внутрішніх інструментів.</p></div><button className="button button--primary" type="button" onClick={() => setContactsOpen(true)}><Icon name="users" size={18} /> Усі контакти</button></header>
    <section className="chat-layout">
      <aside className="chat-conversations">
        <header><strong>Діалоги</strong><button className="icon-button" type="button" onClick={() => setContactsOpen(true)} aria-label="Новий діалог"><Icon name="add" size={19} /></button></header>
        <div className="chat-conversations__list">
          {conversations.isLoading && <p className="chat-empty-copy">Завантажуємо…</p>}
          {!conversations.isLoading && !conversations.data?.length && <div className="chat-empty-copy"><Icon name="chat" size={25} /><span>Діалогів поки немає.<br />Оберіть колегу зі списку контактів.</span></div>}
          {conversations.data?.map((conversation: ChatConversation) => <button className={selectedId === conversation.id ? 'chat-conversation chat-conversation--active' : 'chat-conversation'} type="button" key={conversation.id} onClick={() => { setDraftContact(null); setSelectedId(conversation.id); setSearchParams({ conversation: conversation.id }, { replace: true }); }}><span className="avatar">{getInitials(conversation.contact.name)}</span><span><strong>{conversation.contact.name}</strong><small>{conversation.lastMessage?.body || conversation.contact.email}</small></span>{conversation.unreadCount > 0 && <b>{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</b>}</button>)}
        </div>
      </aside>

      <div className="chat-thread">
        {!activeContact && <div className="chat-thread__empty"><span><Icon name="chat" size={34} /></span><h2>Оберіть діалог</h2><p>Відкрийте існуючий діалог або оберіть користувача у списку контактів.</p><button className="button button--secondary" type="button" onClick={() => setContactsOpen(true)}>Відкрити контакти</button></div>}
        {activeContact && <>
          <header className="chat-thread__header"><span className="avatar">{getInitials(activeContact.name)}</span><span><strong>{activeContact.name}</strong><small>{activeContact.email}</small></span></header>
          <div className="chat-messages">
            {messages.isLoading && <p className="chat-empty-copy">Завантажуємо повідомлення…</p>}
            {!messages.isLoading && !messages.data?.length && <div className="chat-messages__empty"><p>Почніть розмову або надішліть посилання на справу чи публікацію.</p></div>}
            {messages.data?.map((item) => { const body = renderMessageBody(item); return <article className={item.own ? 'chat-message chat-message--own' : 'chat-message'} key={item.id}><div className="chat-message__bubble">{body && <p>{body}</p>}{item.entities.map((entity) => <ChatEntityCard entity={entity} conversationId={item.conversationId} key={`${entity.type}-${entity.id}`} />)}<time>{formatChatTime(item.createdAt)}</time></div></article>; })}
            <div ref={messageEndRef} />
          </div>
          <form className="chat-composer" onSubmit={(event) => void submit(event)}><textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={handleComposerKeyDown} maxLength={5000} rows={1} placeholder="Напишіть повідомлення…" /><button className="button button--primary" type="submit" disabled={!message.trim() || send.isPending || startConversation.isPending} aria-label="Надіслати"><Icon name="arrowRight" size={19} /></button></form>
        </>}
      </div>
    </section>
    {contactsOpen && <ContactsModal contacts={contacts.data || []} loading={contacts.isLoading} onClose={() => setContactsOpen(false)} onSelect={selectContact} />}
  </div>;
}
