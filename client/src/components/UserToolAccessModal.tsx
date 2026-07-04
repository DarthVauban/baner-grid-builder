import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { tools } from '../lib/tools';
import { roleLabels } from '../lib/user';
import { useToast } from '../toast/ToastContext';
import { useAuth } from '../auth/AuthContext';
import type { ToolId } from '../types/tool';
import type { User } from '../types/user';
import { Icon } from './Icon';
import { UserAvatar } from './UserAvatar';

export function UserToolAccessModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { showToast } = useToast();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ToolId[]>([]);
  const [canManageToolAccess, setCanManageToolAccess] = useState(false);
  const access = useQuery({
    queryKey: ['admin-tool-access', user.id],
    queryFn: () => api.admin.toolAccess(user.id)
  });
  const saveAccess = useMutation({
    mutationFn: ({ value, manageAccess }: { value: ToolId[]; manageAccess: boolean }) => (
      api.admin.setToolAccess(user.id, value, manageAccess)
    )
  });
  const isAdmin = user.role === 'admin';

  useEffect(() => {
    if (access.data) {
      setSelected(access.data.tools);
      setCanManageToolAccess(access.data.canManageToolAccess);
    }
  }, [access.data]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function toggle(toolId: ToolId, enabled: boolean) {
    setSelected((current) => enabled
      ? [...new Set([...current, toolId])]
      : current.filter((item) => item !== toolId));
  }

  async function save() {
    try {
      const updated = await saveAccess.mutateAsync({ value: selected, manageAccess: canManageToolAccess });
      setSelected(updated.tools);
      setCanManageToolAccess(updated.canManageToolAccess);
      await queryClient.invalidateQueries({ queryKey: ['admin-tool-access', user.id] });
      showToast('Доступи користувача оновлено.');
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося оновити доступи.', 'error');
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal user-access-modal" role="dialog" aria-modal="true" aria-labelledby="user-access-title">
        <header className="modal__header">
          <div><p className="eyebrow">Керування доступами</p><h2 id="user-access-title">Інструменти користувача</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={20} /></button>
        </header>

        <div className="user-access-modal__content">
          <article className="user-access-profile">
            <UserAvatar name={user.name} avatarUrl={user.avatarUrl} />
            <span><strong>{user.name}</strong><small>{user.email}</small></span>
            <span className="admin-role-static">{roleLabels[user.role]}</span>
          </article>

          {isAdmin && <p className="user-access-modal__notice">Адміністратор завжди має доступ до всіх інструментів.</p>}
          {access.isLoading && <div className="admin-list-state">Завантажуємо доступи…</div>}
          {access.isError && <div className="admin-list-state admin-list-state--error">Не вдалося завантажити доступи.</div>}
          {access.data && !isAdmin && currentUser?.role === 'admin' && (
            <label className="user-access-manager-permission">
              <span><strong>Керування доступами</strong><small>Користувач зможе відкривати панель користувачів і змінювати доступ інших людей до інструментів.</small></span>
              <input className="switch" type="checkbox" checked={canManageToolAccess} disabled={saveAccess.isPending} onChange={(event) => setCanManageToolAccess(event.target.checked)} />
            </label>
          )}
          {access.data && (
            <div className="user-access-tools">
              {tools.map((tool) => (
                <label className="user-access-tool" key={tool.id}>
                  <span className="user-access-tool__icon"><Icon name={tool.icon} size={22} /></span>
                  <span><strong>{tool.name}</strong><small>{tool.description}</small></span>
                  <input className="switch" type="checkbox" checked={isAdmin || selected.includes(tool.id)} disabled={isAdmin || saveAccess.isPending} onChange={(event) => toggle(tool.id, event.target.checked)} />
                </label>
              ))}
            </div>
          )}
        </div>

        <footer className="user-access-modal__footer">
          <button className="button button--secondary" type="button" onClick={onClose}>Скасувати</button>
          {!isAdmin && <button className="button button--primary" type="button" disabled={access.isLoading || access.isError || saveAccess.isPending} onClick={() => void save()}>{saveAccess.isPending ? 'Зберігаємо…' : 'Зберегти доступи'}</button>}
        </footer>
      </section>
    </div>
  );
}
