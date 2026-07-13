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
  const [requiresTwoFactor, setRequiresTwoFactor] = useState<ToolId[]>([]);
  const [canManageToolAccess, setCanManageToolAccess] = useState(false);
  const access = useQuery({
    queryKey: ['admin-tool-access', user.id],
    queryFn: () => api.admin.toolAccess(user.id)
  });
  const saveAccess = useMutation({
    mutationFn: ({ value, manageAccess, requiredTools }: {
      value: ToolId[];
      manageAccess: boolean;
      requiredTools?: ToolId[];
    }) => api.admin.setToolAccess(user.id, value, manageAccess, requiredTools)
  });
  const isAdmin = user.role === 'admin';
  const canManageRequirements = access.data?.canManageToolRequirements === true;

  useEffect(() => {
    if (access.data) {
      setSelected(access.data.tools);
      setCanManageToolAccess(access.data.canManageToolAccess);
      setRequiresTwoFactor(access.data.requiresTwoFactorTools);
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

  function toggleRequirement(toolId: ToolId, enabled: boolean) {
    setRequiresTwoFactor((current) => enabled
      ? [...new Set([...current, toolId])]
      : current.filter((item) => item !== toolId));
  }

  async function save() {
    try {
      const updated = await saveAccess.mutateAsync({
        value: isAdmin ? tools.map((tool) => tool.id) : selected,
        manageAccess: canManageToolAccess,
        requiredTools: canManageRequirements ? requiresTwoFactor : undefined
      });
      setSelected(updated.tools);
      setCanManageToolAccess(updated.canManageToolAccess);
      setRequiresTwoFactor(updated.requiresTwoFactorTools);
      await queryClient.invalidateQueries({ queryKey: ['admin-tool-access', user.id] });
      await queryClient.invalidateQueries({ queryKey: ['tool-access'] });
      await queryClient.invalidateQueries({ queryKey: ['tool-catalog'] });
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
            <span className={`two-factor-badge${user.twoFactorEnabled ? ' two-factor-badge--enabled' : ''}`}>
              <Icon name="security" size={14} /> {user.twoFactorEnabled ? '2FA увімкнено' : '2FA вимкнено'}
            </span>
          </article>

          {isAdmin && <p className="user-access-modal__notice">Адміністратор завжди має доступ до всіх інструментів, але вимоги 2FA все одно можуть блокувати відкриття інструмента без підключеної 2FA.</p>}
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
              {tools.map((tool) => {
                const hasAccess = isAdmin || selected.includes(tool.id);
                const requires2fa = requiresTwoFactor.includes(tool.id);
                const blockedForUser = hasAccess && requires2fa && !user.twoFactorEnabled;
                return (
                  <article className={`user-access-tool${blockedForUser ? ' user-access-tool--blocked' : ''}`} key={tool.id}>
                    <span className="user-access-tool__icon"><Icon name={tool.icon} size={22} /></span>
                    <span><strong>{tool.name}</strong><small>{blockedForUser ? 'Доступ буде заблоковано, доки користувач не увімкне 2FA.' : tool.description}</small></span>
                    <label className="user-access-tool__switch">
                      <span>Доступ</span>
                      <input className="switch" type="checkbox" checked={hasAccess} disabled={isAdmin || saveAccess.isPending} onChange={(event) => toggle(tool.id, event.target.checked)} />
                    </label>
                    {canManageRequirements && (
                      <label className="user-access-tool__switch user-access-tool__switch--security">
                        <span>2FA</span>
                        <input className="switch" type="checkbox" checked={requires2fa} disabled={saveAccess.isPending} onChange={(event) => toggleRequirement(tool.id, event.target.checked)} />
                      </label>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <footer className="user-access-modal__footer">
          <button className="button button--secondary" type="button" onClick={onClose}>Скасувати</button>
          {(!isAdmin || canManageRequirements) && <button className="button button--primary" type="button" disabled={access.isLoading || access.isError || saveAccess.isPending} onClick={() => void save()}>{saveAccess.isPending ? 'Зберігаємо…' : 'Зберегти доступи'}</button>}
        </footer>
      </section>
    </div>
  );
}
