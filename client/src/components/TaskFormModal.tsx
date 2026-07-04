import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { taskTypeLabels, toLocalDate, toLocalDateTime } from '../lib/task';
import type { ReminderSettings, Task, TaskInput, TaskType, UserSearchResult } from '../types/task';
import { Icon } from './Icon';

interface TaskFormModalProps {
  task?: Task | null;
  onClose: () => void;
  onSubmit: (input: TaskInput) => Promise<void>;
}

function defaultDate(hoursFromNow: number): string {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return toLocalDateTime(date);
}

export function TaskFormModal({ task, onClose, onSubmit }: TaskFormModalProps) {
  const [type, setType] = useState<TaskType>(task?.type || 'general');
  const [isAllDay, setIsAllDay] = useState(task?.isAllDay || false);
  const [startsAt, setStartsAt] = useState(
    task ? (task.startsAt ? (task.isAllDay ? toLocalDate(task.startsAt) : toLocalDateTime(task.startsAt)) : '') : defaultDate(1)
  );
  const [dueAt, setDueAt] = useState(
    task ? (task.isAllDay ? toLocalDate(task.dueAt) : toLocalDateTime(task.dueAt)) : defaultDate(2)
  );
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>(
    task?.participants.map(({ id, name, email }) => ({ id, name, email })) || []
  );
  const [userSearch, setUserSearch] = useState('');
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(task?.reminder?.enabled ?? true);
  const [remindBefore, setRemindBefore] = useState(task?.reminder?.remindBeforeMinutes ?? 30);
  const [repeatEvery, setRepeatEvery] = useState<number | null>(task?.reminder?.repeatIntervalMinutes ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const searchQuery = useQuery({
    queryKey: ['user-search', userSearch, 'exclude-self'],
    queryFn: () => api.users.search(userSearch.trim(), true),
    enabled: userSearchOpen,
    staleTime: 60_000
  });

  const availableUsers = (searchQuery.data || []).filter(
    (candidate) => !selectedUsers.some((selected) => selected.id === candidate.id)
  );

  function dateToIso(value: string, allDay: boolean, endOfDay = false): string {
    return new Date(allDay ? `${value}T${endOfDay ? '23:59:00' : '00:00:00'}` : value).toISOString();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    const form = new FormData(event.currentTarget);

    try {
      const reminder: ReminderSettings = {
        enabled: reminderEnabled,
        remindBeforeMinutes: remindBefore,
        repeatIntervalMinutes: repeatEvery
      };
      await onSubmit({
        type,
        title: String(form.get('title') || ''),
        description: String(form.get('description') || ''),
        isAllDay,
        startsAt: startsAt ? dateToIso(startsAt, isAllDay) : null,
        dueAt: dateToIso(dueAt, isAllDay, true),
        location: String(form.get('location') || ''),
        meetingUrl: String(form.get('meetingUrl') || ''),
        participantIds: selectedUsers.map((user) => user.id),
        reminder
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не вдалося зберегти справу.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="modal task-form-modal" role="dialog" aria-modal="true" aria-labelledby="task-form-title">
        <header className="modal__header">
          <div>
            <p className="eyebrow">{task ? 'Редагування' : 'Нова картка'}</p>
            <h2 id="task-form-title">{task ? 'Редагувати справу' : 'Створити справу'}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={20} /></button>
        </header>

        <form className="task-form" onSubmit={handleSubmit}>
          {error && <div className="form-message form-message--error task-form__wide" role="alert">{error}</div>}

          <label className="field">
            <span>Тип</span>
            <select value={type} onChange={(event) => setType(event.target.value as TaskType)}>
              {Object.entries(taskTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Назва</span>
            <input name="title" defaultValue={task?.title || ''} maxLength={160} placeholder="Що потрібно зробити?" required autoFocus />
          </label>
          <label className="field task-form__wide">
            <span>Опис</span>
            <textarea name="description" defaultValue={task?.description || ''} maxLength={5000} rows={3} placeholder="Додатковий контекст, порядок денний або деталі" />
          </label>

          <label className="check-field task-form__wide">
            <input type="checkbox" checked={isAllDay} onChange={(event) => {
              const checked = event.target.checked;
              setIsAllDay(checked);
              setStartsAt(checked ? startsAt.slice(0, 10) : `${startsAt.slice(0, 10)}T09:00`);
              setDueAt(checked ? dueAt.slice(0, 10) : `${dueAt.slice(0, 10)}T18:00`);
            }} />
            <span>Справа на весь день</span>
          </label>
          <label className="field">
            <span>Початок</span>
            <input type={isAllDay ? 'date' : 'datetime-local'} value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
          </label>
          <label className="field">
            <span>Завершення / дедлайн</span>
            <input type={isAllDay ? 'date' : 'datetime-local'} value={dueAt} onChange={(event) => setDueAt(event.target.value)} required />
          </label>

          {(type === 'offline_meeting' || type === 'event') && (
            <label className="field task-form__wide">
              <span>Місце</span>
              <input name="location" defaultValue={task?.location || ''} maxLength={500} placeholder="Офіс, переговорна або адреса" />
            </label>
          )}
          {(type === 'online_meeting' || type === 'call' || type === 'event') && (
            <label className="field task-form__wide">
              <span>Посилання</span>
              <input name="meetingUrl" type="url" defaultValue={task?.meetingUrl || ''} maxLength={4000} placeholder="https://meet.google.com/…" />
            </label>
          )}

          <section className="task-form__section task-form__wide">
            <div className="task-form__section-title">
              <div><h3>Учасники</h3><p>Запросити можна лише активних користувачів системи.</p></div>
              <span>{selectedUsers.length}</span>
            </div>
            <div className="participant-search" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setUserSearchOpen(false); }}>
              <input value={userSearch} onFocus={() => setUserSearchOpen(true)} onChange={(event) => setUserSearch(event.target.value)} placeholder="Оберіть користувача або почніть вводити ім’я" />
              {userSearchOpen && (
                <div className="participant-search__results">
                  {searchQuery.isLoading && <p>Шукаємо…</p>}
                  {!searchQuery.isLoading && availableUsers.length === 0 && <p>Нікого не знайдено</p>}
                  {availableUsers.map((user) => (
                    <button key={user.id} type="button" onClick={() => {
                      setSelectedUsers((current) => [...current, user]);
                      setUserSearch('');
                      setUserSearchOpen(false);
                    }}>
                      <span>{user.name}</span><small>{user.email}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedUsers.length > 0 && (
              <div className="participant-chips">
                {selectedUsers.map((user) => (
                  <span key={user.id}>{user.name}<button type="button" aria-label={`Прибрати ${user.name}`} onClick={() => setSelectedUsers((current) => current.filter((item) => item.id !== user.id))}><Icon name="close" size={14} /></button></span>
                ))}
              </div>
            )}
          </section>

          <section className="task-form__section task-form__wide">
            <label className="check-field">
              <input type="checkbox" checked={reminderEnabled} onChange={(event) => setReminderEnabled(event.target.checked)} />
              <span>Нагадати про справу</span>
            </label>
            {reminderEnabled && (
              <div className="reminder-grid">
                <label className="field">
                  <span>Перше нагадування</span>
                  <select value={remindBefore} onChange={(event) => setRemindBefore(Number(event.target.value))}>
                    <option value={5}>За 5 хвилин</option>
                    <option value={15}>За 15 хвилин</option>
                    <option value={30}>За 30 хвилин</option>
                    <option value={60}>За 1 годину</option>
                    <option value={180}>За 3 години</option>
                    <option value={1440}>За 1 день</option>
                    <option value={10080}>За 1 тиждень</option>
                  </select>
                </label>
                <label className="field">
                  <span>Повторювати до дедлайну</span>
                  <select value={repeatEvery ?? ''} onChange={(event) => setRepeatEvery(event.target.value ? Number(event.target.value) : null)}>
                    <option value="">Не повторювати</option>
                    <option value={15}>Кожні 15 хвилин</option>
                    <option value={30}>Кожні 30 хвилин</option>
                    <option value={60}>Щогодини</option>
                    <option value={1440}>Щодня</option>
                  </select>
                </label>
              </div>
            )}
          </section>

          <footer className="modal__footer task-form__wide">
            <button className="button button--secondary" type="button" onClick={onClose}>Скасувати</button>
            <button className="button button--primary" type="submit" disabled={pending}>
              {pending ? 'Зберігаємо…' : task ? 'Зберегти зміни' : 'Створити справу'}
              {!pending && <Icon name="arrow" size={15} />}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
