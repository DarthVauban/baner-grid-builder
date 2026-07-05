import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type { ChatConversation, ChatGroupMember, ChatGroupRole, ChatPerson } from '../types/chat';
import { Icon } from './Icon';
import { ProfilePhotoField } from './ProfilePhotoField';
import { UserAvatar } from './UserAvatar';

const roleLabels: Record<ChatGroupRole, string> = {
  owner: 'Власник',
  admin: 'Адміністратор',
  member: 'Учасник'
};

export function GroupManagementModal({ conversation, contacts, onClose, onUpdated }: {
  conversation: ChatConversation;
  contacts: ChatPerson[];
  onClose: () => void;
  onUpdated: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [title, setTitle] = useState(conversation.title);
  const [icon, setIcon] = useState(conversation.iconUrl);
  const [iconChanged, setIconChanged] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const canManage = conversation.myRole === 'owner' || conversation.myRole === 'admin';
  const canAssignRoles = conversation.myRole === 'owner';
  const availableContacts = useMemo(() => {
    const memberIds = new Set(conversation.members.map((member) => member.id));
    return contacts.filter((contact) => !memberIds.has(contact.id));
  }, [contacts, conversation.members]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);

  async function run(action: () => Promise<void>, success: string) {
    setPending(true);
    try {
      await action();
      await onUpdated();
      showToast(success);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося оновити групу.', 'error');
    } finally { setPending(false); }
  }

  async function saveSettings() {
    const input: { title?: string; iconDataUrl?: string } = {};
    if (title.trim() !== conversation.title) input.title = title.trim();
    if (iconChanged) input.iconDataUrl = icon;
    if (!Object.keys(input).length) return;
    await run(() => api.chat.updateGroup(conversation.id, input), 'Налаштування групи оновлено.');
    setIconChanged(false);
  }

  async function addMembers() {
    if (!selectedIds.length) return;
    await run(() => api.chat.addGroupMembers(conversation.id, selectedIds), 'Учасників додано.');
    setSelectedIds([]);
  }

  async function setRole(member: ChatGroupMember, role: 'admin' | 'member') {
    await run(() => api.chat.setGroupMemberRole(conversation.id, member.id, role), 'Роль учасника змінено.');
  }

  async function removeMember(member: ChatGroupMember) {
    await run(() => api.chat.removeGroupMember(conversation.id, member.id), 'Учасника видалено з групи.');
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal chat-group-modal" role="dialog" aria-modal="true" aria-labelledby="chat-group-title">
      <header className="modal__header"><div><p className="eyebrow">Груповий чат</p><h2 id="chat-group-title">Керування групою</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={20} /></button></header>
      <div className="chat-group-modal__content">
        <section className="chat-group-settings">
          <ProfilePhotoField name={title || conversation.title} value={icon} onChange={(value) => { setIcon(value); setIconChanged(true); }} label="Іконка групи" description="PNG, JPEG або WebP до 1 МБ." inputName="group-icon" disabled={!canManage} />
          <label className="field"><span>Назва групи</span><input value={title} onChange={(event) => setTitle(event.target.value)} minLength={2} maxLength={120} disabled={!canManage} /></label>
          {canManage && <button className="button button--primary" type="button" disabled={pending || title.trim().length < 2 || (title.trim() === conversation.title && !iconChanged)} onClick={() => void saveSettings()}>Зберегти налаштування</button>}
        </section>

        <section className="chat-group-section">
          <header><div><h3>Учасники</h3><p>{conversation.members.length} у групі</p></div></header>
          <div className="chat-group-members">{conversation.members.map((member) => {
            const removable = canManage && member.role !== 'owner' && (conversation.myRole === 'owner' || member.role === 'member');
            return <article key={member.id}><UserAvatar name={member.name} avatarUrl={member.avatarUrl} /><span><strong>{member.name}</strong><small>{member.email}</small></span>{canAssignRoles && member.role !== 'owner' ? <select value={member.role} disabled={pending} onChange={(event) => void setRole(member, event.target.value as 'admin' | 'member')} aria-label={`Роль ${member.name}`}><option value="member">Учасник</option><option value="admin">Адміністратор</option></select> : <b>{roleLabels[member.role]}</b>}{removable && <button className="icon-button icon-button--danger" type="button" disabled={pending} onClick={() => void removeMember(member)} aria-label={`Видалити ${member.name}`}><Icon name="delete" size={17} /></button>}</article>;
          })}</div>
        </section>

        {canManage && <section className="chat-group-section">
          <header><div><h3>Додати людей</h3><p>Нові учасники приєднаються з роллю «Учасник».</p></div><button className="button button--primary button--small" type="button" disabled={pending || !selectedIds.length} onClick={() => void addMembers()}>Додати ({selectedIds.length})</button></header>
          {!availableContacts.length && <p className="chat-empty-copy">Усі доступні контакти вже у групі.</p>}
          <div className="chat-contact-list chat-group-contacts">{availableContacts.map((contact) => {
            const selected = selectedIds.includes(contact.id);
            return <button className={selected ? 'chat-contact--selected' : ''} type="button" key={contact.id} onClick={() => setSelectedIds((current) => selected ? current.filter((id) => id !== contact.id) : [...current, contact.id])}><UserAvatar name={contact.name} avatarUrl={contact.avatarUrl} /><span><strong>{contact.name}</strong><small>{contact.email}</small></span><span className="chat-contact__check">{selected && <Icon name="check" size={16} />}</span></button>;
          })}</div>
        </section>}
      </div>
    </section>
  </div>;
}
