import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type { ChatConversation, ChatEntity, ChatLinkPreview as ChatLinkPreviewType, ChatMessage, ChatPerson } from '../types/chat';
import { ChatEntityCard } from '../components/ChatEntityCard';
import { Icon } from '../components/Icon';
import { UserAvatar } from '../components/UserAvatar';
import { ChatLinkPreview } from '../components/ChatLinkPreview';
import { ProfilePhotoField } from '../components/ProfilePhotoField';
import { GroupManagementModal } from '../components/GroupManagementModal';

const reactionOptions = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

function formatChatTime(value: string): string {
  return new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function isEntityUrl(value: string, entities: ChatEntity[]): boolean {
  try {
    const url = new URL(value);
    return entities.some((entity) => (
      (entity.type === 'task' && url.pathname === '/tasks' && url.searchParams.get('task') === entity.id)
      || (entity.type === 'publication' && url.pathname === '/tools/blog-publications' && url.searchParams.get('publication') === entity.id)
      || (entity.type === 'application' && url.pathname === '/tools/applications' && url.searchParams.get('application') === entity.id)
      || (entity.type === 'catalog_product' && ['/catalog/products', '/tools/used-smartphones'].includes(url.pathname) && url.searchParams.get('product') === entity.id)
    ));
  } catch { return false; }
}

function isPreviewUrl(value: string, previews: ChatLinkPreviewType[]): boolean {
  try {
    const href = new URL(value).href;
    return previews.some((preview) => preview.url === href);
  } catch { return false; }
}

function renderMessageBody(message: ChatMessage): ReactNode {
  const parts = message.body.split(/(https?:\/\/[^\s<>"']+)/gi);
  const rendered = parts.map((part, index) => {
    if (!/^https?:\/\//i.test(part)) return part;
    const clean = part.replace(/[),.;!?]+$/g, '');
    if (isEntityUrl(clean, message.entities) || isPreviewUrl(clean, message.linkPreviews)) return part.slice(clean.length);
    return <a key={`${part}-${index}`} href={clean} target="_blank" rel="noreferrer">{clean}<Icon name="openInNew" size={13} /></a>;
  });
  return rendered.some((part) => typeof part !== 'string' || part.trim()) ? rendered : null;
}

function ContactsModal({ contacts, loading, onClose, onSelect, onCreateGroup, creatingGroup }: {
  contacts: ChatPerson[];
  loading: boolean;
  onClose: () => void;
  onSelect: (contact: ChatPerson) => void;
  onCreateGroup: (title: string, participantIds: string[], iconDataUrl: string) => Promise<void>;
  creatingGroup: boolean;
}) {
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [groupTitle, setGroupTitle] = useState('');
  const [groupIcon, setGroupIcon] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? contacts.filter((contact) => `${contact.name} ${contact.email}`.toLowerCase().includes(needle)) : contacts;
  }, [contacts, search]);

  function toggleParticipant(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal chat-contacts-modal" role="dialog" aria-modal="true" aria-labelledby="chat-contacts-title">
      <header className="modal__header"><div><p className="eyebrow">Новий діалог</p><h2 id="chat-contacts-title">{mode === 'direct' ? 'Усі контакти' : 'Груповий чат'}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={20} /></button></header>
      <div className="chat-contacts-modal__content">
        <div className="chat-create-tabs" role="tablist" aria-label="Тип нового чату">
          <button className={mode === 'direct' ? 'active' : ''} type="button" onClick={() => setMode('direct')} role="tab" aria-selected={mode === 'direct'}>Особистий чат</button>
          <button className={mode === 'group' ? 'active' : ''} type="button" onClick={() => setMode('group')} role="tab" aria-selected={mode === 'group'}><Icon name="users" size={16} /> Груповий чат</button>
        </div>
        {mode === 'group' && <><ProfilePhotoField name={groupTitle || 'Група'} value={groupIcon} onChange={setGroupIcon} label="Іконка групи" description="PNG, JPEG або WebP до 1 МБ." inputName="new-group-icon" /><label className="field"><span>Назва групи</span><input value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} maxLength={120} placeholder="Наприклад, Команда контенту" autoFocus /></label></>}
        <div className="task-search chat-contacts-modal__search"><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Пошук у контактах" />{search && <button type="button" onClick={() => setSearch('')} aria-label="Очистити"><Icon name="close" size={15} /></button>}</div>
        {loading && <p className="chat-empty-copy">Завантажуємо контакти…</p>}
        {!loading && !filtered.length && <p className="chat-empty-copy">Доступних контактів немає.</p>}
        <div className="chat-contact-list">{filtered.map((contact) => {
          const selected = selectedIds.includes(contact.id);
          return <button className={selected ? 'chat-contact--selected' : ''} type="button" key={contact.id} onClick={() => mode === 'direct' ? onSelect(contact) : toggleParticipant(contact.id)}><UserAvatar name={contact.name} avatarUrl={contact.avatarUrl} /><span><strong>{contact.name}</strong><small>{contact.email}</small></span>{mode === 'group' ? <span className="chat-contact__check">{selected && <Icon name="check" size={16} />}</span> : <Icon name="arrow" size={18} />}</button>;
        })}</div>
        {mode === 'group' && <footer className="modal__footer chat-group-create"><span>Обрано: {selectedIds.length}</span><button className="button button--primary" type="button" disabled={groupTitle.trim().length < 2 || selectedIds.length < 2 || creatingGroup} onClick={() => void onCreateGroup(groupTitle.trim(), selectedIds, groupIcon)}>{creatingGroup ? 'Створюємо…' : 'Створити групу'}</button></footer>}
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
  const [groupManagementOpen, setGroupManagementOpen] = useState(false);
  const [conversationTab, setConversationTab] = useState<'direct' | 'group'>('direct');
  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [typingUserName, setTypingUserName] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const typingStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingDisplayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingConversationRef = useRef<string | null>(null);
  const localTypingRef = useRef(false);
  const lastTypingSentAtRef = useRef(0);
  const conversations = useQuery({ queryKey: ['chat-conversations'], queryFn: api.chat.conversations, refetchOnMount: 'always' });
  const contacts = useQuery({ queryKey: ['chat-contacts'], queryFn: api.chat.contacts, enabled: contactsOpen || groupManagementOpen, staleTime: 60_000 });
  const messages = useQuery({
    queryKey: ['chat-messages', selectedId],
    queryFn: () => api.chat.messages(selectedId!),
    enabled: Boolean(selectedId),
    refetchOnMount: 'always'
  });
  const startConversation = useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: string }) => api.chat.startConversation(userId, body)
  });
  const createGroup = useMutation({
    mutationFn: ({ title, participantIds, iconDataUrl }: { title: string; participantIds: string[]; iconDataUrl: string }) => api.chat.createGroup(title, participantIds, iconDataUrl)
  });
  const send = useMutation({
    mutationFn: ({ conversationId, body, replyToId }: { conversationId: string; body: string; replyToId: string | null }) => (
      api.chat.sendMessage(conversationId, body, replyToId)
    )
  });
  const setReaction = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string | null }) => api.chat.setReaction(messageId, emoji)
  });
  const activeConversation = conversations.data?.find((conversation) => conversation.id === selectedId) || null;
  const filteredConversations = useMemo(() => (conversations.data || []).filter((conversation) => conversation.type === conversationTab), [conversationTab, conversations.data]);
  const activeContact = activeConversation?.contact || draftContact;
  const activeTitle = activeConversation?.title || draftContact?.name || '';
  const activeAvatarUrl = activeConversation?.type === 'group' ? activeConversation.iconUrl : activeContact?.avatarUrl;

  useEffect(() => {
    if (draftContact) return;
    const selectedConversation = conversations.data?.find((conversation) => conversation.id === selectedId);
    if (selectedConversation && selectedConversation.type !== conversationTab) {
      setConversationTab(selectedConversation.type);
      return;
    }
    if (!filteredConversations.length) {
      setSelectedId(null);
      setSearchParams({}, { replace: true });
      return;
    }
    if (selectedId && filteredConversations.some((conversation) => conversation.id === selectedId)) return;
    const conversationId = filteredConversations[0].id;
    setSelectedId(conversationId);
    setSearchParams({ conversation: conversationId }, { replace: true });
  }, [conversationTab, conversations.data, draftContact, filteredConversations, selectedId, setSearchParams]);

  useEffect(() => setReplyTo(null), [selectedId]);

  useEffect(() => {
    if (!selectedId || !messages.data) return;
    void api.chat.markRead(selectedId).then(() => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] }),
      queryClient.invalidateQueries({ queryKey: ['chat-unread-count'] })
    ])).catch(() => undefined);
  }, [messages.data, queryClient, selectedId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const container = messagesRef.current;
      if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages.data, typingUserName]);

  useEffect(() => {
    setTypingUserName(null);
    const handleTyping = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId?: string; isTyping?: boolean; senderName?: string }>).detail;
      if (!selectedId || detail?.conversationId !== selectedId) return;
      if (typingDisplayTimeoutRef.current) clearTimeout(typingDisplayTimeoutRef.current);
      setTypingUserName(detail.isTyping === true ? detail.senderName || activeContact?.name || 'Співрозмовник' : null);
      if (detail.isTyping) {
        typingDisplayTimeoutRef.current = setTimeout(() => setTypingUserName(null), 3500);
      }
    };
    window.addEventListener('mt:chat-typing', handleTyping);
    return () => {
      window.removeEventListener('mt:chat-typing', handleTyping);
      if (typingDisplayTimeoutRef.current) clearTimeout(typingDisplayTimeoutRef.current);
      typingDisplayTimeoutRef.current = null;
    };
  }, [activeContact?.name, selectedId]);

  useEffect(() => () => {
    if (typingStopTimeoutRef.current) clearTimeout(typingStopTimeoutRef.current);
    const conversationId = typingConversationRef.current;
    if (localTypingRef.current && conversationId) void api.chat.setTyping(conversationId, false).catch(() => undefined);
    typingConversationRef.current = null;
    localTypingRef.current = false;
  }, [selectedId]);

  function stopTyping() {
    if (typingStopTimeoutRef.current) clearTimeout(typingStopTimeoutRef.current);
    typingStopTimeoutRef.current = null;
    const conversationId = typingConversationRef.current;
    if (localTypingRef.current && conversationId) void api.chat.setTyping(conversationId, false).catch(() => undefined);
    typingConversationRef.current = null;
    localTypingRef.current = false;
    lastTypingSentAtRef.current = 0;
  }

  function handleMessageChange(value: string) {
    setMessage(value);
    if (!selectedId || !value.trim()) {
      if (!value.trim()) stopTyping();
      return;
    }
    if (typingConversationRef.current && typingConversationRef.current !== selectedId) stopTyping();
    typingConversationRef.current = selectedId;
    localTypingRef.current = true;
    const now = Date.now();
    if (now - lastTypingSentAtRef.current >= 1000) {
      lastTypingSentAtRef.current = now;
      void api.chat.setTyping(selectedId, true).catch(() => undefined);
    }
    if (typingStopTimeoutRef.current) clearTimeout(typingStopTimeoutRef.current);
    typingStopTimeoutRef.current = setTimeout(stopTyping, 1600);
  }

  function selectContact(contact: ChatPerson) {
    const existingConversation = conversations.data?.find((conversation) => conversation.contact?.id === contact.id);
    setDraftContact(existingConversation ? null : contact);
    setConversationTab('direct');
    setSelectedId(existingConversation?.id || null);
    setSearchParams(existingConversation ? { conversation: existingConversation.id } : {}, { replace: true });
    setContactsOpen(false);
    setReplyTo(null);
  }

  async function createGroupConversation(title: string, participantIds: string[], iconDataUrl: string) {
    try {
      const conversation = await createGroup.mutateAsync({ title, participantIds, iconDataUrl });
      await queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
      setDraftContact(null);
      setConversationTab('group');
      setSelectedId(conversation.id);
      setSearchParams({ conversation: conversation.id }, { replace: true });
      setContactsOpen(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося створити груповий чат.', 'error');
    }
  }

  function scrollToQuotedMessage(messageId: string) {
    const target = document.getElementById(`chat-message-${messageId}`);
    if (!target) {
      showToast('Цитоване повідомлення знаходиться поза завантаженою історією.', 'error');
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('chat-message--highlighted');
    window.setTimeout(() => target.classList.remove('chat-message--highlighted'), 1400);
  }

  async function reactToMessage(item: ChatMessage, emoji: string) {
    const selected = item.reactions.find((reaction) => reaction.emoji === emoji)?.reactedByMe === true;
    try {
      await setReaction.mutateAsync({ messageId: item.id, emoji: selected ? null : emoji });
      await queryClient.invalidateQueries({ queryKey: ['chat-messages', item.conversationId] });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося додати реакцію.', 'error');
    }
  }

  function prepareReply(item: ChatMessage) {
    setReplyTo(item);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const body = message.trim();
    if ((!selectedId && !draftContact) || !body || send.isPending || startConversation.isPending) return;
    try {
      stopTyping();
      setMessage('');
      let conversationId = selectedId;
      if (conversationId) {
        await send.mutateAsync({ conversationId, body, replyToId: replyTo?.id || null });
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
      setReplyTo(null);
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
    <section className="chat-layout">
      <aside className="chat-conversations">
        <header><strong>Діалоги</strong><button className="button button--primary chat-new-button" type="button" onClick={() => setContactsOpen(true)}><Icon name="add" size={16} /> Новий чат</button></header>
        <div className="chat-conversation-tabs" role="tablist" aria-label="Тип чатів"><button className={conversationTab === 'direct' ? 'active' : ''} type="button" role="tab" aria-selected={conversationTab === 'direct'} onClick={() => { setDraftContact(null); setSelectedId(null); setConversationTab('direct'); }}>Особисті <b>{conversations.data?.filter((item) => item.type === 'direct').length || 0}</b></button><button className={conversationTab === 'group' ? 'active' : ''} type="button" role="tab" aria-selected={conversationTab === 'group'} onClick={() => { setDraftContact(null); setSelectedId(null); setConversationTab('group'); }}>Групові <b>{conversations.data?.filter((item) => item.type === 'group').length || 0}</b></button></div>
        <div className="chat-conversations__list">
          {conversations.isLoading && <p className="chat-empty-copy">Завантажуємо…</p>}
          {!conversations.isLoading && !filteredConversations.length && <div className="chat-empty-copy"><Icon name={conversationTab === 'group' ? 'users' : 'chat'} size={25} /><span>{conversationTab === 'group' ? 'Групових чатів поки немає.' : 'Особистих чатів поки немає.'}<br />Створіть новий чат зі списку контактів.</span></div>}
          {filteredConversations.map((conversation: ChatConversation) => <button className={selectedId === conversation.id ? 'chat-conversation chat-conversation--active' : 'chat-conversation'} type="button" key={conversation.id} onClick={() => { setReplyTo(null); setDraftContact(null); setSelectedId(conversation.id); setSearchParams({ conversation: conversation.id }, { replace: true }); }}><UserAvatar name={conversation.title} avatarUrl={conversation.type === 'group' ? conversation.iconUrl : conversation.contact?.avatarUrl} className={conversation.type === 'group' ? 'avatar--group' : ''} /><span><strong>{conversation.title}</strong><small>{conversation.lastMessage ? `${conversation.type === 'group' ? `${conversation.lastMessage.senderName}: ` : ''}${conversation.lastMessage.body}` : conversation.type === 'group' ? `${conversation.members.length} учасників` : conversation.contact?.email}</small></span>{conversation.unreadCount > 0 && <b>{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</b>}</button>)}
        </div>
      </aside>

      <div className="chat-thread">
        {!activeTitle && <div className="chat-thread__empty"><span><Icon name="chat" size={34} /></span><h2>Оберіть діалог</h2><p>Відкрийте існуючий діалог або створіть новий особистий чи груповий чат.</p><button className="button button--secondary" type="button" onClick={() => setContactsOpen(true)}>Новий чат</button></div>}
        {activeTitle && <>
          <header className="chat-thread__header"><UserAvatar name={activeTitle} avatarUrl={activeAvatarUrl} className={activeConversation?.type === 'group' ? 'avatar--group' : ''} /><span><strong>{activeTitle}</strong><small>{activeConversation?.type === 'group' ? `${activeConversation.members.length} учасників` : activeContact?.email}</small></span>{activeConversation?.type === 'group' && <button className="button button--secondary button--small chat-group-manage-button" type="button" onClick={() => setGroupManagementOpen(true)}><Icon name="users" size={15} /> {['owner', 'admin'].includes(activeConversation.myRole) ? 'Керувати' : 'Учасники'}</button>}</header>
          <div className="chat-messages" ref={messagesRef}>
            {messages.isLoading && <p className="chat-empty-copy">Завантажуємо повідомлення…</p>}
            {!messages.isLoading && !messages.data?.length && <div className="chat-messages__empty"><p>Почніть розмову або надішліть посилання на справу чи публікацію.</p></div>}
            {messages.data?.map((item) => {
              const body = renderMessageBody(item);
              const hasSingleImage = item.entities.length === 0 && item.linkPreviews.length === 1 && item.linkPreviews[0].type === 'image';
              const bubbleClass = `chat-message__bubble${hasSingleImage ? ' chat-message__bubble--image' : ''}`;
              return <article className={item.own ? 'chat-message chat-message--own' : 'chat-message'} id={`chat-message-${item.id}`} key={item.id}>
                <div className={bubbleClass}>
                  {activeConversation?.type === 'group' && !item.own && <strong className="chat-message__sender">{item.sender.name}</strong>}
                  {item.replyTo && <button className="chat-message__quote" type="button" onClick={() => scrollToQuotedMessage(item.replyTo!.id)}><strong>{item.replyTo.own ? 'Ви' : item.replyTo.sender.name}</strong><span>{item.replyTo.body}</span></button>}
                  {body && <p>{body}</p>}
                  {item.entities.map((entity) => <ChatEntityCard entity={entity} conversationId={item.conversationId} key={`${entity.type}-${entity.id}`} />)}
                  {item.linkPreviews.map((preview) => <ChatLinkPreview preview={preview} key={preview.url} />)}
                  {item.reactions.length > 0 && <div className="chat-message__reactions">{item.reactions.map((reaction) => <button className={reaction.reactedByMe ? 'active' : ''} type="button" key={reaction.emoji} onClick={() => void reactToMessage(item, reaction.emoji)} title={reaction.users.map((user) => user.name).join(', ')}><span>{reaction.emoji}</span><b>{reaction.count}</b></button>)}</div>}
                  <footer className="chat-message__meta"><span><span className="chat-message__reaction-control"><button type="button"><Icon name="reaction" size={15} /> Реакція</button><span className="chat-reaction-picker">{reactionOptions.map((emoji) => <button type="button" key={emoji} onClick={() => void reactToMessage(item, emoji)} aria-label={`Реакція ${emoji}`}>{emoji}</button>)}</span></span><button type="button" onClick={() => prepareReply(item)}><Icon name="reply" size={14} /> Відповісти</button></span><time>{formatChatTime(item.createdAt)}</time></footer>
                </div>
              </article>;
            })}
            {typingUserName && <div className="chat-typing" role="status" aria-label={`${typingUserName} набирає повідомлення`}><span /><span /><span /><small>{typingUserName} набирає…</small></div>}
          </div>
          <form className="chat-composer" onSubmit={(event) => void submit(event)}>
            {replyTo && <div className="chat-composer__reply"><Icon name="reply" size={17} /><span><strong>Відповідь {replyTo.own ? 'на своє повідомлення' : replyTo.sender.name}</strong><small>{replyTo.body}</small></span><button type="button" onClick={() => setReplyTo(null)} aria-label="Скасувати відповідь"><Icon name="close" size={17} /></button></div>}
            <textarea ref={composerRef} value={message} onChange={(event) => handleMessageChange(event.target.value)} onKeyDown={handleComposerKeyDown} maxLength={5000} rows={1} placeholder="Напишіть повідомлення…" />
            <button className="button button--primary" type="submit" disabled={!message.trim() || send.isPending || startConversation.isPending} aria-label="Надіслати"><Icon name="arrowRight" size={19} /></button>
          </form>
        </>}
      </div>
    </section>
    {contactsOpen && <ContactsModal contacts={contacts.data || []} loading={contacts.isLoading} onClose={() => setContactsOpen(false)} onSelect={selectContact} onCreateGroup={createGroupConversation} creatingGroup={createGroup.isPending} />}
    {groupManagementOpen && activeConversation?.type === 'group' && <GroupManagementModal conversation={activeConversation} contacts={contacts.data || []} onClose={() => setGroupManagementOpen(false)} onUpdated={async () => { await queryClient.invalidateQueries({ queryKey: ['chat-conversations'] }); }} />}
  </div>;
}
