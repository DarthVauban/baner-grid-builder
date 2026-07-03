import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Notification } from '../types/task';
import { Icon } from './Icon';

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const feed = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.notifications.list(),
    refetchInterval: 30_000
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const markRead = useMutation({ mutationFn: api.notifications.markRead, onSuccess: invalidate });
  const markAll = useMutation({ mutationFn: api.notifications.markAllRead, onSuccess: invalidate });

  async function openNotification(notification: Notification) {
    if (!notification.readAt) await markRead.mutateAsync(notification.id);
    setOpen(false);
    if (notification.taskId && notification.type !== 'participant_removed') navigate('/tasks');
  }

  const unreadCount = feed.data?.unreadCount || 0;

  return (
    <div className="notification-center">
      <button className="icon-button notification-center__toggle" type="button" aria-label="Сповіщення" onClick={() => setOpen((value) => !value)}>
        <Icon name="bell" />
        {unreadCount > 0 && <span>{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <section className="notification-panel">
          <header><div><h2>Сповіщення</h2><p>{unreadCount ? `${unreadCount} непрочитаних` : 'Усе прочитано'}</p></div>{unreadCount > 0 && <button type="button" onClick={() => markAll.mutate()}>Прочитати всі</button>}</header>
          <div className="notification-panel__list">
            {feed.isLoading && <p className="notification-panel__empty">Завантажуємо…</p>}
            {!feed.isLoading && !feed.data?.items.length && <p className="notification-panel__empty">Нових сповіщень поки немає.</p>}
            {feed.data?.items.map((notification) => (
              <button className={`notification-item${notification.readAt ? '' : ' notification-item--unread'}`} key={notification.id} type="button" onClick={() => void openNotification(notification)}>
                <span className="notification-item__dot" />
                <span><strong>{notification.title}</strong><small>{notification.message}</small><time>{new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(notification.createdAt))}</time></span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
