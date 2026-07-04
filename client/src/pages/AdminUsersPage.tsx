import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { roleLabels } from '../lib/user';
import { Icon } from '../components/Icon';
import { UserAvatar } from '../components/UserAvatar';
import { UserToolAccessModal } from '../components/UserToolAccessModal';
import { useToast } from '../toast/ToastContext';
import type {
  User,
  UserRole,
  UserStatus
} from '../types/user';

const statusLabels: Record<UserStatus, string> = {
  pending: 'Очікує схвалення',
  approved: 'Активний',
  rejected: 'Відхилений'
};

export function AdminUserRow({
  user,
  currentUserId,
  busy,
  canAdminister,
  onAccess,
  onRole,
  onStatus
}: {
  user: User;
  currentUserId: string;
  busy: boolean;
  canAdminister: boolean;
  onAccess: (user: User) => void;
  onRole: (user: User, role: UserRole) => void;
  onStatus: (user: User, status: UserStatus) => void;
}) {
  const isSelf = user.id === currentUserId;

  return (
    <article className="admin-user-row">
      <div className="admin-user-row__identity">
        <UserAvatar name={user.name} avatarUrl={user.avatarUrl} />
        <span><strong>{user.name}{isSelf && <small className="admin-user-row__you">Ви</small>}</strong><small>{user.email}</small></span>
      </div>
      <div className="admin-user-row__meta">
        <span className={`admin-status admin-status--${user.status}`}>{statusLabels[user.status]}</span>
        <time title="Дата реєстрації">{new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(user.createdAt))}</time>
      </div>
      <div className="admin-user-row__actions">
        <button className="button button--secondary button--small" type="button" disabled={busy} onClick={() => onAccess(user)}><Icon name="tools" size={16} /> Доступи</button>
        {!canAdminister || isSelf ? (
          <span className="admin-role-static">{roleLabels[user.role]}</span>
        ) : (
          <label className="admin-role-select"><span className="visually-hidden">Роль користувача {user.name}</span><select value={user.role} disabled={busy} onChange={(event) => onRole(user, event.target.value as UserRole)}>
            <option value="admin">Адміністратор</option><option value="editor">Редактор</option><option value="content_manager">Контент-менеджер</option>
          </select></label>
        )}
        {canAdminister && user.status !== 'approved' && <button className="button button--primary button--small" type="button" disabled={busy} onClick={() => onStatus(user, 'approved')}>Схвалити</button>}
        {canAdminister && !isSelf && user.status !== 'rejected' && <button className="button button--danger button--small" type="button" disabled={busy} onClick={() => onStatus(user, 'rejected')}>Відхилити</button>}
      </div>
    </article>
  );
}

export function AdminUsersPage() {
  const { showToast } = useToast();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [page, setPage] = useState(1);
  const [busyUserId, setBusyUserId] = useState('');
  const [accessUser, setAccessUser] = useState<User | null>(null);
  const canAdminister = currentUser?.role === 'admin';

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
  const setUserStatus = useMutation({ mutationFn: ({ id, value }: { id: string; value: UserStatus }) => api.admin.setStatus(id, value) });
  const setUserRole = useMutation({ mutationFn: ({ id, value }: { id: string; value: UserRole }) => api.admin.setRole(id, value) });

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
    try {
      await setUserStatus.mutateAsync({ id: target.id, value });
      showToast(value === 'approved' ? 'Користувача схвалено.' : 'Доступ користувача відхилено.');
      await refreshUsers();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося змінити статус.', 'error');
    } finally {
      setBusyUserId('');
    }
  }

  async function changeRole(target: User, value: UserRole) {
    setBusyUserId(target.id);
    try {
      await setUserRole.mutateAsync({ id: target.id, value });
      showToast('Роль користувача оновлено.');
      await refreshUsers();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося змінити роль.', 'error');
    } finally {
      setBusyUserId('');
    }
  }

  return (
    <div className="admin-page">
      <header className="page-heading admin-page__heading">
        <p className="eyebrow">Адміністрування</p>
        <h1>Користувачі та доступи</h1>
        <p>Схвалюйте облікові записи, призначайте ролі та керуйте переглядом спільних робочих даних.</p>
      </header>

      <section className="admin-summary" aria-label="Зведення користувачів">
        {summaryCards.map(([label, value, kind]) => <article key={kind} className={`admin-summary__card admin-summary__card--${kind}`}><span>{label}</span><strong>{directory.isLoading ? '—' : value}</strong></article>)}
      </section>

      <section className="admin-section">
        <header className="admin-section__header"><div><p className="eyebrow">Облікові записи</p><h2>Каталог користувачів</h2></div><span>{directory.data ? `${directory.data.total} у вибірці` : 'Завантаження…'}</span></header>
        <div className="admin-filters">
          <label className="task-search admin-filters__search"><Icon name="search" size={18} /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Ім’я або email" aria-label="Пошук користувачів" /></label>
          <label className="admin-filter"><span>Статус</span><select value={status} onChange={(event) => { setStatus(event.target.value as UserStatus | ''); setPage(1); }}><option value="">Усі статуси</option><option value="pending">Очікують</option><option value="approved">Активні</option><option value="rejected">Відхилені</option></select></label>
          <label className="admin-filter"><span>Роль</span><select value={role} onChange={(event) => { setRole(event.target.value as UserRole | ''); setPage(1); }}><option value="">Усі ролі</option><option value="admin">Адміністратор</option><option value="editor">Редактор</option><option value="content_manager">Контент-менеджер</option></select></label>
        </div>

        <div className="admin-users-list">
          {directory.isLoading && <div className="admin-list-state">Завантажуємо користувачів…</div>}
          {directory.isError && <div className="admin-list-state admin-list-state--error">{directory.error instanceof Error ? directory.error.message : 'Не вдалося завантажити користувачів.'}</div>}
          {!directory.isLoading && !directory.data?.items.length && <div className="admin-list-state">Користувачів за цими умовами не знайдено.</div>}
          {directory.data?.items.map((directoryUser) => <AdminUserRow key={directoryUser.id} user={directoryUser} currentUserId={currentUser?.id || ''} busy={busyUserId === directoryUser.id} canAdminister={canAdminister} onAccess={setAccessUser} onRole={(target, value) => void changeRole(target, value)} onStatus={(target, value) => void changeStatus(target, value)} />)}
        </div>

        {directory.data && directory.data.pageCount > 1 && <nav className="admin-pagination" aria-label="Сторінки користувачів"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><Icon name="arrowLeft" size={17} /> Назад</button><span>Сторінка {page} із {directory.data.pageCount}</span><button type="button" disabled={page >= directory.data.pageCount} onClick={() => setPage((value) => value + 1)}>Далі <Icon name="arrowRight" size={17} /></button></nav>}
      </section>

      {accessUser && <UserToolAccessModal user={accessUser} onClose={() => setAccessUser(null)} />}
    </div>
  );
}
