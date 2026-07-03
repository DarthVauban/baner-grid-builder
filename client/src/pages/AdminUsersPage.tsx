import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { getInitials, roleLabels } from '../lib/user';
import type {
  PermissionRole,
  RolePermission,
  SavedDataResource,
  User,
  UserRole,
  UserStatus
} from '../types/user';

const statusLabels: Record<UserStatus, string> = {
  pending: 'Очікує схвалення',
  approved: 'Активний',
  rejected: 'Відхилений'
};

const resources: Array<{ id: SavedDataResource; label: string; note: string }> = [
  { id: 'banner_grids', label: 'Банерні сітки', note: 'Перегляд сіток, створених іншими користувачами' },
  { id: 'saved_banners', label: 'Збережені банери', note: 'Перегляд окремих банерів інших користувачів' },
  { id: 'product_tables', label: 'Таблиці товарів', note: 'Перегляд завантажених іншими користувачами таблиць' }
];

const permissionRoles: PermissionRole[] = ['editor', 'content_manager'];

export function AdminUserRow({
  user,
  currentUserId,
  busy,
  onRole,
  onStatus
}: {
  user: User;
  currentUserId: string;
  busy: boolean;
  onRole: (user: User, role: UserRole) => void;
  onStatus: (user: User, status: UserStatus) => void;
}) {
  const isSelf = user.id === currentUserId;

  return (
    <article className="admin-user-row">
      <div className="admin-user-row__identity">
        <span className="avatar">{getInitials(user.name)}</span>
        <span><strong>{user.name}{isSelf && <small className="admin-user-row__you">Ви</small>}</strong><small>{user.email}</small></span>
      </div>
      <div className="admin-user-row__meta">
        <span className={`admin-status admin-status--${user.status}`}>{statusLabels[user.status]}</span>
        <time title="Дата реєстрації">{new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(user.createdAt))}</time>
      </div>
      <div className="admin-user-row__actions">
        {isSelf ? (
          <span className="admin-role-static">{roleLabels[user.role]}</span>
        ) : (
          <label className="admin-role-select"><span className="visually-hidden">Роль користувача {user.name}</span><select value={user.role} disabled={busy} onChange={(event) => onRole(user, event.target.value as UserRole)}>
            <option value="admin">Адміністратор</option><option value="editor">Редактор</option><option value="content_manager">Контент-менеджер</option>
          </select></label>
        )}
        {user.status !== 'approved' && <button className="button button--primary button--small" type="button" disabled={busy} onClick={() => onStatus(user, 'approved')}>Схвалити</button>}
        {!isSelf && user.status !== 'rejected' && <button className="button button--danger button--small" type="button" disabled={busy} onClick={() => onStatus(user, 'rejected')}>Відхилити</button>}
      </div>
    </article>
  );
}

function PermissionCard({
  role,
  permissions,
  pendingKey,
  onChange
}: {
  role: PermissionRole;
  permissions: RolePermission[];
  pendingKey: string;
  onChange: (role: PermissionRole, resource: SavedDataResource, value: boolean) => void;
}) {
  return (
    <article className="permission-card">
      <header><span className="permission-card__role-mark">{role === 'editor' ? 'Р' : 'К'}</span><div><h3>{roleLabels[role]}</h3><p>Доступ до даних робочих інструментів</p></div></header>
      <div className="permission-card__list">
        {resources.map((resource) => {
          const permission = permissions.find((item) => item.role === role && item.resource === resource.id);
          const key = `${role}:${resource.id}`;
          return (
            <label className="permission-row" key={resource.id}>
              <span><strong>{resource.label}</strong><small>{resource.note}</small></span>
              <input className="switch" type="checkbox" checked={permission?.canViewAll || false} disabled={pendingKey === key} onChange={(event) => onChange(role, resource.id, event.target.checked)} />
            </label>
          );
        })}
      </div>
    </article>
  );
}

export function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const [busyUserId, setBusyUserId] = useState('');
  const [pendingPermission, setPendingPermission] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const directory = useQuery({
    queryKey: ['admin-directory', search, status, role, page],
    queryFn: () => api.admin.directory({
      search: search || undefined,
      status: status || undefined,
      role: role || undefined,
      page,
      pageSize: 25
    })
  });
  const permissions = useQuery({
    queryKey: ['admin-permissions'],
    queryFn: api.admin.permissions
  });
  const setUserStatus = useMutation({ mutationFn: ({ id, value }: { id: string; value: UserStatus }) => api.admin.setStatus(id, value) });
  const setUserRole = useMutation({ mutationFn: ({ id, value }: { id: string; value: UserRole }) => api.admin.setRole(id, value) });
  const setPermission = useMutation({ mutationFn: ({ permissionRole, resource, value }: { permissionRole: PermissionRole; resource: SavedDataResource; value: boolean }) => api.admin.setPermission(permissionRole, resource, value) });

  const summary = directory.data?.summary;
  const summaryCards = useMemo(() => [
    ['Усього', summary?.total || 0, 'total'],
    ['Очікують', summary?.pending || 0, 'pending'],
    ['Активні', summary?.approved || 0, 'approved'],
    ['Відхилені', summary?.rejected || 0, 'rejected']
  ] as const, [summary]);

  async function refreshUsers() {
    await queryClient.invalidateQueries({ queryKey: ['admin-directory'] });
  }

  async function changeStatus(target: User, value: UserStatus) {
    if (value === 'rejected' && !window.confirm(`Відхилити доступ для ${target.name}?`)) return;
    setBusyUserId(target.id);
    setMessage('');
    try {
      await setUserStatus.mutateAsync({ id: target.id, value });
      setMessage(value === 'approved' ? 'Користувача схвалено.' : 'Доступ користувача відхилено.');
      await refreshUsers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не вдалося змінити статус.');
    } finally {
      setBusyUserId('');
    }
  }

  async function changeRole(target: User, value: UserRole) {
    setBusyUserId(target.id);
    setMessage('');
    try {
      await setUserRole.mutateAsync({ id: target.id, value });
      setMessage('Роль користувача оновлено.');
      await refreshUsers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не вдалося змінити роль.');
    } finally {
      setBusyUserId('');
    }
  }

  async function changePermission(permissionRole: PermissionRole, resource: SavedDataResource, value: boolean) {
    const key = `${permissionRole}:${resource}`;
    setPendingPermission(key);
    setMessage('');
    try {
      await setPermission.mutateAsync({ permissionRole, resource, value });
      setMessage('Дозволи ролі оновлено.');
      await queryClient.invalidateQueries({ queryKey: ['admin-permissions'] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не вдалося оновити дозволи.');
    } finally {
      setPendingPermission('');
    }
  }

  return (
    <div className="admin-page">
      <header className="page-heading admin-page__heading">
        <p className="eyebrow">Адміністрування</p>
        <h1>Користувачі та доступи</h1>
        <p>Схвалюйте облікові записи, призначайте ролі та керуйте переглядом спільних робочих даних.</p>
      </header>

      {message && <div className="tasks-page__message" role="status"><span>{message}</span><button type="button" onClick={() => setMessage('')}>×</button></div>}

      <section className="admin-summary" aria-label="Зведення користувачів">
        {summaryCards.map(([label, value, kind]) => <article key={kind} className={`admin-summary__card admin-summary__card--${kind}`}><span>{label}</span><strong>{directory.isLoading ? '—' : value}</strong></article>)}
      </section>

      <section className="admin-section">
        <header className="admin-section__header"><div><p className="eyebrow">Облікові записи</p><h2>Каталог користувачів</h2></div><span>{directory.data ? `${directory.data.total} у вибірці` : 'Завантаження…'}</span></header>
        <div className="admin-filters">
          <label className="task-search admin-filters__search"><span aria-hidden="true">⌕</span><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Ім’я або email" aria-label="Пошук користувачів" /></label>
          <label className="admin-filter"><span>Статус</span><select value={status} onChange={(event) => { setStatus(event.target.value as UserStatus | ''); setPage(1); }}><option value="">Усі статуси</option><option value="pending">Очікують</option><option value="approved">Активні</option><option value="rejected">Відхилені</option></select></label>
          <label className="admin-filter"><span>Роль</span><select value={role} onChange={(event) => { setRole(event.target.value as UserRole | ''); setPage(1); }}><option value="">Усі ролі</option><option value="admin">Адміністратор</option><option value="editor">Редактор</option><option value="content_manager">Контент-менеджер</option></select></label>
        </div>

        <div className="admin-users-list">
          {directory.isLoading && <div className="admin-list-state">Завантажуємо користувачів…</div>}
          {directory.isError && <div className="admin-list-state admin-list-state--error">{directory.error instanceof Error ? directory.error.message : 'Не вдалося завантажити користувачів.'}</div>}
          {!directory.isLoading && !directory.data?.items.length && <div className="admin-list-state">Користувачів за цими умовами не знайдено.</div>}
          {directory.data?.items.map((directoryUser) => <AdminUserRow key={directoryUser.id} user={directoryUser} currentUserId={currentUser?.id || ''} busy={busyUserId === directoryUser.id} onRole={(target, value) => void changeRole(target, value)} onStatus={(target, value) => void changeStatus(target, value)} />)}
        </div>

        {directory.data && directory.data.pageCount > 1 && <nav className="admin-pagination" aria-label="Сторінки користувачів"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Назад</button><span>Сторінка {page} із {directory.data.pageCount}</span><button type="button" disabled={page >= directory.data.pageCount} onClick={() => setPage((value) => value + 1)}>Далі →</button></nav>}
      </section>

      <section className="admin-section admin-section--permissions">
        <header className="admin-section__header"><div><p className="eyebrow">Налаштування ролей</p><h2>Доступ до спільних даних</h2><p>Особисті справи сюди не входять: їх бачать лише власник і запрошені учасники.</p></div><span className="admin-always-access">Адміністратор завжди має повний доступ</span></header>
        {permissions.isLoading && <div className="admin-list-state">Завантажуємо дозволи…</div>}
        {permissions.isError && <div className="admin-list-state admin-list-state--error">Не вдалося завантажити дозволи.</div>}
        {permissions.data && <div className="permission-grid">{permissionRoles.map((permissionRole) => <PermissionCard key={permissionRole} role={permissionRole} permissions={permissions.data} pendingKey={pendingPermission} onChange={(selectedRole, resource, value) => void changePermission(selectedRole, resource, value)} />)}</div>}
      </section>
    </div>
  );
}
