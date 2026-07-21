import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { roleLabels } from '../lib/user';
import { useToast } from '../toast/ToastContext';
import type { User } from '../types/user';
import { Icon } from './Icon';
import { UserAvatar } from './UserAvatar';

const statusLabels = {
  published: 'Опублікована',
  draft: 'Чернетка',
  disabled: 'Вимкнена'
} as const;

export function UserApplicationNotificationsModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [disabledFormIds, setDisabledFormIds] = useState<string[]>([]);
  const settings = useQuery({
    queryKey: ['admin-application-notifications', user.id],
    queryFn: () => api.admin.applicationNotifications(user.id)
  });
  const saveSettings = useMutation({
    mutationFn: (value: string[]) => api.admin.setApplicationNotifications(user.id, value)
  });

  useEffect(() => {
    if (settings.data) {
      setDisabledFormIds(settings.data.forms.filter((form) => !form.enabled).map((form) => form.formId));
    }
  }, [settings.data]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function toggle(formId: string, enabled: boolean) {
    setDisabledFormIds((current) => enabled
      ? current.filter((id) => id !== formId)
      : [...new Set([...current, formId])]);
  }

  async function save() {
    try {
      const updated = await saveSettings.mutateAsync(disabledFormIds);
      setDisabledFormIds(updated.forms.filter((form) => !form.enabled).map((form) => form.formId));
      await queryClient.invalidateQueries({ queryKey: ['admin-application-notifications', user.id] });
      showToast('Налаштування сповіщень збережено.');
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти налаштування сповіщень.', 'error');
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal user-notification-modal" role="dialog" aria-modal="true" aria-labelledby="user-notification-title">
        <header className="modal__header">
          <div><p className="eyebrow">Сповіщення із заявок</p><h2 id="user-notification-title">Підписки на форми</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={20} /></button>
        </header>

        <div className="user-notification-modal__content">
          <article className="user-access-profile">
            <UserAvatar name={user.name} avatarUrl={user.avatarUrl} />
            <span><strong>{user.name}</strong><small>{user.email}</small></span>
            <span className="admin-role-static">{roleLabels[user.role]}</span>
          </article>

          <p className="user-notification-modal__notice">
            Вимкнення підписки прибирає дзвіночок і звук для нових заявок, змін статусу та коментарів із вибраної форми. Доступ до розділу «Заявки» не змінюється.
          </p>

          {settings.isLoading && <div className="admin-list-state">Завантажуємо форми…</div>}
          {settings.isError && <div className="admin-list-state admin-list-state--error">Не вдалося завантажити форми.</div>}
          {settings.data && !settings.data.forms.length && <div className="admin-list-state">Доступних форм ще немає.</div>}
          {settings.data && settings.data.forms.length > 0 && (
            <div className="user-notification-forms">
              {settings.data.forms.map((form) => {
                const enabled = !disabledFormIds.includes(form.formId);
                return (
                  <label className={`user-notification-form${enabled ? '' : ' user-notification-form--disabled'}`} key={form.formId}>
                    <span className="user-notification-form__icon"><Icon name="formBuilder" size={21} /></span>
                    <span className="user-notification-form__details">
                      <strong>{form.name}</strong>
                      <small>Сповіщення про заявки саме з цієї форми</small>
                    </span>
                    <span className={`user-notification-form__status user-notification-form__status--${form.status}`}>{statusLabels[form.status]}</span>
                    <span className="user-notification-form__control">
                      <span>{enabled ? 'Увімкнено' : 'Вимкнено'}</span>
                      <input
                        className="switch"
                        type="checkbox"
                        checked={enabled}
                        disabled={saveSettings.isPending}
                        onChange={(event) => toggle(form.formId, event.target.checked)}
                        aria-label={`Сповіщення з форми ${form.name}`}
                      />
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <footer className="user-notification-modal__footer">
          <button className="button button--secondary" type="button" onClick={onClose}>Скасувати</button>
          <button className="button button--primary" type="button" disabled={settings.isLoading || settings.isError || saveSettings.isPending} onClick={() => void save()}>
            {saveSettings.isPending ? 'Зберігаємо…' : 'Зберегти підписки'}
          </button>
        </footer>
      </section>
    </div>
  );
}
