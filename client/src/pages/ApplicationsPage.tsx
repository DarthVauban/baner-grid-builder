import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApplicationDetailsModal } from '../components/ApplicationDetailsModal';
import { Icon } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';
import { api } from '../lib/api';
import { applicationStatusOptions, customerName, formatApplicationDate } from '../lib/application';
import { copyShareLink } from '../lib/share';
import { useToast } from '../toast/ToastContext';
import type { ApplicationCounts, ApplicationFormSummary, ApplicationRecord, ApplicationStatus } from '../types/application';

function countFor(status: string, counts?: { all: number; new: number; inProgress: number; rejected: number; closed: number }) {
  if (!counts) return 0;
  if (status === 'all') return counts.all;
  if (status === 'new') return counts.new;
  if (status === 'in_progress') return counts.inProgress;
  if (status === 'rejected') return counts.rejected;
  if (status === 'closed') return counts.closed;
  return 0;
}

function formStatusText(status: ApplicationFormSummary['status']) {
  if (status === 'published') return 'Опублікована';
  if (status === 'disabled') return 'Вимкнена';
  if (status === 'archived') return 'Архівна';
  return 'Чернетка';
}

function ApplicationProductThumb({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (!src || failed) return <Icon name="productSelection" size={18} />;
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

const sortOptions = [
  { value: 'created_desc', label: 'Нові спочатку' },
  { value: 'updated_desc', label: 'Оновлені спочатку' },
  { value: 'number_desc', label: 'Номер за спаданням' },
  { value: 'number_asc', label: 'Номер за зростанням' }
];
const rowStatusOptions = applicationStatusOptions
  .filter(([value]) => value !== 'all')
  .map(([value, label]) => ({ value: value as ApplicationStatus, label }));

const emptyStats = { all: 0, new: 0, inProgress: 0, rejected: 0, closed: 0 };

function aggregateManagerStats(managerStats: ApplicationCounts['managerStats']) {
  return managerStats.reduce(
    (total, item) => ({
      all: total.all + item.all,
      new: total.new + item.new,
      inProgress: total.inProgress + item.inProgress,
      rejected: total.rejected + item.rejected,
      closed: total.closed + item.closed
    }),
    emptyStats
  );
}

export function ApplicationsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<ApplicationStatus | 'all'>('all');
  const [selectedFormId, setSelectedFormId] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('created_desc');
  const [page, setPage] = useState(1);
  const [details, setDetails] = useState<ApplicationRecord | null>(null);
  const [view, setView] = useState<'list' | 'stats'>('list');
  const [selectedStatsManagerId, setSelectedStatsManagerId] = useState('all');
  const sharedApplicationId = searchParams.get('application');
  const queryParams = useMemo(() => ({
    filter,
    formId: selectedFormId === 'all' ? undefined : selectedFormId,
    search,
    sort,
    page,
    pageSize: 25
  }), [filter, page, search, selectedFormId, sort]);

  const applications = useQuery({
    queryKey: ['applications', queryParams],
    queryFn: () => api.applications.list(queryParams),
    refetchOnMount: 'always'
  });
  const applicationForms = useQuery({
    queryKey: ['application-form-filters'],
    queryFn: api.applications.forms,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true
  });
  const counts = useQuery({
    queryKey: ['application-counts'],
    queryFn: api.applications.counts,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true
  });
  const sharedApplication = useQuery({
    queryKey: ['shared-application', sharedApplicationId],
    queryFn: () => api.applications.get(sharedApplicationId!),
    enabled: Boolean(sharedApplicationId),
    retry: false
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status, version, comment }: { id: string; status: ApplicationStatus; version: number; comment: string }) =>
      api.applications.setStatus(id, status, version, comment)
  });
  const claimApplication = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => api.applications.claim(id, version)
  });
  const addComment = useMutation({
    mutationFn: ({ id, text, version }: { id: string; text: string; version: number }) => api.applications.addComment(id, text, version)
  });
  const removeApplication = useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) => api.applications.remove(id, code)
  });
  const busy = setStatus.isPending || claimApplication.isPending || addComment.isPending || removeApplication.isPending;

  useEffect(() => {
    if (sharedApplication.data) setDetails(sharedApplication.data);
  }, [sharedApplication.data]);

  useEffect(() => {
    if (!sharedApplicationId || !sharedApplication.error) return;
    showToast(sharedApplication.error instanceof Error ? sharedApplication.error.message : 'Не вдалося відкрити заявку за посиланням.', 'error');
    const next = new URLSearchParams(searchParams);
    next.delete('application');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, sharedApplication.error, sharedApplicationId, showToast]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['applications'] }),
      queryClient.invalidateQueries({ queryKey: ['application-counts'] }),
      queryClient.invalidateQueries({ queryKey: ['application-form-filters'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['chat-messages'] })
    ]);
  }

  async function openDetails(application: ApplicationRecord) {
    try {
      const fresh = await api.applications.get(application.id);
      setDetails(fresh);
      setSearchParams({ application: application.id }, { replace: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося відкрити заявку.', 'error');
    }
  }

  function closeDetails() {
    setDetails(null);
    if (!searchParams.has('application')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('application');
    setSearchParams(next, { replace: true });
  }

  async function changeStatus(application: ApplicationRecord, status: ApplicationStatus, comment: string) {
    try {
      const updated = await setStatus.mutateAsync({ id: application.id, status, version: application.version, comment });
      if (details?.id === updated.id) setDetails(updated);
      showToast('Статус заявки змінено.');
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося змінити статус.', 'error');
    }
  }

  async function claim(application: ApplicationRecord) {
    try {
      const updated = await claimApplication.mutateAsync({ id: application.id, version: application.version });
      if (details?.id === updated.id) setDetails(updated);
      showToast('Заявку взято в роботу.');
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося взяти заявку в роботу.', 'error');
    }
  }

  async function createComment(application: ApplicationRecord, text: string) {
    try {
      const updated = await addComment.mutateAsync({ id: application.id, text, version: application.version });
      setDetails(updated);
      showToast('Коментар додано.');
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося додати коментар.', 'error');
    }
  }

  async function deleteApplication(application: ApplicationRecord, code: string) {
    try {
      await removeApplication.mutateAsync({ id: application.id, code });
      showToast('Заявку видалено.');
      closeDetails();
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося видалити заявку.', 'error');
      throw error;
    }
  }

  async function shareApplication(application: ApplicationRecord) {
    try {
      await copyShareLink('application', application.id);
      showToast('Посилання на заявку скопійовано.');
    } catch {
      showToast('Не вдалося скопіювати посилання.', 'error');
    }
  }

  const items = applications.data?.items || [];
  const formFilters = applicationForms.data || [];
  const selectedForm = selectedFormId === 'all' ? null : formFilters.find((form) => form.id === selectedFormId) || null;
  const formFilterTotal = formFilters.reduce((total, form) => total + form.all, 0);
  const managerStats = counts.data?.managerStats || [];
  const unassignedStats = counts.data?.unassigned;
  const managerTotals = useMemo(() => aggregateManagerStats(managerStats), [managerStats]);
  const selectedManagerStats = selectedStatsManagerId === 'all' ? null : managerStats.find((item) => item.manager.id === selectedStatsManagerId) || null;
  const activeStats = selectedManagerStats || managerTotals;
  const activeStatsTitle = selectedManagerStats?.manager.name || 'Всі менеджери';
  const maxStatusCount = Math.max(1, activeStats.new, activeStats.inProgress, activeStats.closed, activeStats.rejected);
  const statusStats = [
    { key: 'all', label: 'Усього', value: activeStats.all, hint: selectedManagerStats ? 'Закріплені за менеджером' : 'Закріплені за всіма менеджерами' },
    { key: 'new', label: 'Нові', value: activeStats.new, hint: 'Ще не переведені в обробку' },
    { key: 'inProgress', label: 'В роботі', value: activeStats.inProgress, hint: 'Активно обробляються' },
    { key: 'closed', label: 'Закриті', value: activeStats.closed, hint: 'Завершені заявки' },
    { key: 'rejected', label: 'Відхилені', value: activeStats.rejected, hint: 'Неуспішні звернення' }
  ];
  const breakdownStats = statusStats.filter((item) => item.key !== 'all');

  useEffect(() => {
    if (selectedStatsManagerId === 'all') return;
    if (!managerStats.some((item) => item.manager.id === selectedStatsManagerId)) setSelectedStatsManagerId('all');
  }, [managerStats, selectedStatsManagerId]);

  useEffect(() => {
    if (selectedFormId === 'all' || applicationForms.isLoading) return;
    if (!formFilters.some((form) => form.id === selectedFormId)) setSelectedFormId('all');
  }, [applicationForms.isLoading, formFilters, selectedFormId]);

  return <div className="applications-page">
    <header className="page-heading page-heading--row">
      <div>
        <p className="eyebrow">Форми та покупці</p>
        <h1>Заявки</h1>
        <p>Обробляйте заявки з форм, контролюйте статуси, коментарі та товарний контекст без перезавантаження сторінки.</p>
      </div>
    </header>

    <nav className="application-view-tabs" aria-label="Режим перегляду заявок">
      <button className={view === 'list' ? 'application-view-tab application-view-tab--active' : 'application-view-tab'} type="button" onClick={() => setView('list')}>
        <span>Заявки</span>
        <strong>{counts.data?.all || 0}</strong>
      </button>
      <button className={view === 'stats' ? 'application-view-tab application-view-tab--active' : 'application-view-tab'} type="button" onClick={() => setView('stats')}>
        <span>Статистика</span>
        <strong>{managerStats.length}</strong>
      </button>
    </nav>

    <section className="application-form-filter" aria-label="Фільтр заявок за формою">
      <header>
        <span><Icon name="formBuilder" size={18} /> Форми</span>
        <small>{selectedForm ? `Показуємо заявки з форми: ${selectedForm.name}` : 'Показуємо заявки з усіх форм'}</small>
      </header>
      <div className="application-form-filter__list">
        <button className={selectedFormId === 'all' ? 'application-form-filter__item application-form-filter__item--active' : 'application-form-filter__item'} type="button" onClick={() => { setSelectedFormId('all'); setPage(1); }}>
          <span><strong>Усі форми</strong><small>Загальний потік заявок</small></span>
          <b>{counts.data?.all || formFilterTotal}</b>
        </button>
        {formFilters.map((form) => <button
          className={selectedFormId === form.id ? 'application-form-filter__item application-form-filter__item--active' : 'application-form-filter__item'}
          type="button"
          key={form.id}
          onClick={() => { setSelectedFormId(form.id); setPage(1); }}
        >
          <span><strong>{form.name}</strong><small>{formStatusText(form.status)}</small></span>
          <b>{form.all}</b>
        </button>)}
        {applicationForms.isLoading && <span className="application-form-filter__loading">Завантажуємо форми...</span>}
        {!applicationForms.isLoading && !formFilters.length && <span className="application-form-filter__loading">Форми ще не створені</span>}
      </div>
    </section>

    {view === 'list' && <>
    <section className="task-toolbar" aria-label="Фільтри заявок">
      <div className="task-filters">
        {applicationStatusOptions.map(([value, label]) => {
          const count = countFor(value, counts.data);
          return <button key={value} className={filter === value ? 'task-filter task-filter--active' : 'task-filter'} type="button" onClick={() => { setFilter(value); setPage(1); }}>
            <span>{label}</span>{count > 0 && <span className="task-filter__count">{count > 99 ? '99+' : count}</span>}
          </button>;
        })}
      </div>
      <div className="task-toolbar__controls">
        <label className="application-sort"><span>Сортування</span><StyledSelect compact value={sort} options={sortOptions} onChange={(value) => { setSort(value); setPage(1); }} ariaLabel="Сортування заявок" /></label>
        <div className="task-search"><Icon name="search" size={18} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Номер, імʼя або телефон" aria-label="Пошук заявки за номером, імʼям або телефоном" />{search && <button type="button" onClick={() => { setSearch(''); setPage(1); }} aria-label="Очистити пошук"><Icon name="close" size={16} /></button>}</div>
      </div>
    </section>

    {applications.isLoading && <div className="task-list-state"><span className="loading-screen__pulse" /><p>Завантажуємо заявки...</p></div>}
    {applications.isError && <div className="task-list-state task-list-state--error"><p>{applications.error instanceof Error ? applications.error.message : 'Не вдалося завантажити заявки.'}</p><button className="button button--secondary" type="button" onClick={() => void applications.refetch()}>Спробувати ще</button></div>}
    {!applications.isLoading && !applications.isError && items.length === 0 && <div className="task-list-state"><span className="task-list-state__icon"><Icon name="tasks" size={28} /></span><h2>Заявок не знайдено</h2><p>{search ? 'Перевірте номер, імʼя або телефон і спробуйте інший запит.' : selectedForm ? 'У цій формі поки немає заявок з обраним статусом.' : 'Нові заявки зʼявляться тут автоматично після надсилання форми.'}</p></div>}

    {items.length > 0 && <section className="application-table" aria-label="Список заявок">
      <div className="application-table__head"><span>№</span><span>Статус</span><span>Менеджер</span><span>Покупець</span><span>Телефон</span><span>Банк</span><span>Товар</span><span>Створено</span><span>Дії</span></div>
      {items.map((application) => {
        const canClaim = application.status === 'new' && !application.assignedManager;
        const canChangeStatus = !canClaim && (application.assignedManager?.id === user?.id || user?.isPrimaryAdmin === true || !application.assignedManager);
        return <article className="application-row" key={application.id}>
        <strong>{application.number}</strong>
        <div className="application-row__status">
          <span className={`application-status application-status--${application.status}`}>{application.statusLabel}</span>
          {canChangeStatus ? <StyledSelect compact value={application.status} disabled={setStatus.isPending} options={rowStatusOptions} onChange={(value) => void changeStatus(application, value, '')} ariaLabel={`Статус заявки ${application.number}`} /> : <small>{canClaim ? 'Очікує менеджера' : 'Призначена'}</small>}
        </div>
        <span className={application.assignedManager ? 'application-manager-pill' : 'application-manager-pill application-manager-pill--empty'}>{application.assignedManager?.name || 'Не взято'}</span>
        <span className="application-row__customer" data-label="Покупець">{customerName(application.customer.firstName, application.customer.lastName)}</span>
        <span className="application-row__phone" data-label="Телефон">{application.customer.phone || '—'}</span>
        <span className="application-row__bank" data-label="Банк">{application.customer.bankLabel || '—'}</span>
        <span className="application-row__product" data-label="Товар"><ApplicationProductThumb src={application.product?.imageProxyUrl || application.product?.imageUrl} /><b>{application.product?.title || application.pageTitle || 'Товар не визначено'}</b></span>
        <time className="application-row__date" data-label="Створено">{formatApplicationDate(application.createdAt)}</time>
        <div className="application-row__actions">
          {canClaim && <button className="button button--primary button--small" type="button" disabled={claimApplication.isPending} onClick={() => void claim(application)}>Взяти в роботу</button>}
          <button className="button button--secondary button--small" type="button" onClick={() => void openDetails(application)}>Відкрити</button>
        </div>
      </article>;
      })}
      <footer className="application-pagination">
        <span>{applications.data?.total || 0} заявок</span>
        <div><button className="button button--secondary button--small" type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Назад</button><span>{page} / {applications.data?.pageCount || 1}</span><button className="button button--secondary button--small" type="button" disabled={page >= (applications.data?.pageCount || 1)} onClick={() => setPage((value) => value + 1)}>Далі</button></div>
      </footer>
    </section>}
    </>}

    {view === 'stats' && <section className="application-stats-workspace" aria-label="Статистика заявок">
      <aside className="application-stats-sidebar" aria-label="Менеджери">
        <button className={selectedStatsManagerId === 'all' ? 'application-stats-person application-stats-person--active' : 'application-stats-person'} type="button" onClick={() => setSelectedStatsManagerId('all')}>
          <span><strong>Всі менеджери</strong><small>{managerTotals.all} заявок у роботі</small></span>
          <b>{managerStats.length}</b>
        </button>
        {managerStats.length ? managerStats.map((item) => <button key={item.manager.id} className={selectedStatsManagerId === item.manager.id ? 'application-stats-person application-stats-person--active' : 'application-stats-person'} type="button" onClick={() => setSelectedStatsManagerId(item.manager.id)}>
          <span><strong>{item.manager.name}</strong><small>{item.all} заявок</small></span>
          <b>{item.inProgress}</b>
        </button>) : <p>Менеджери ще не взяли заявки в роботу.</p>}
      </aside>

      <div className="application-stats-panel">
        <header className="application-stats-panel__header">
          <div>
            <small>{selectedManagerStats ? 'Індивідуальна статистика' : 'Загальна статистика'}</small>
            <h2>{activeStatsTitle}</h2>
            <p>{selectedManagerStats ? 'Заявки, закріплені за обраним менеджером.' : 'Сумарні показники всіх менеджерів без розтягування основного списку.'}</p>
          </div>
          <span>{selectedManagerStats?.lastActivityAt ? `Остання активність: ${formatApplicationDate(selectedManagerStats.lastActivityAt)}` : `Менеджерів: ${managerStats.length}`}</span>
        </header>

        <div className="application-stats-grid">
          {statusStats.map((item) => <article key={item.key} className={`application-stats-card application-stats-card--${item.key}`}>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
            <span>{item.hint}</span>
          </article>)}
        </div>

        <div className="application-stats-support">
          <article>
            <small>Без менеджера</small>
            <strong>{unassignedStats?.all || 0}</strong>
            <span>Очікують взяття: {unassignedStats?.new || 0}</span>
          </article>
          <article>
            <small>Доступні у вашому перегляді</small>
            <strong>{counts.data?.all || 0}</strong>
            <span>Нові: {counts.data?.new || 0} · В роботі: {counts.data?.inProgress || 0}</span>
          </article>
        </div>

        <div className="application-stats-breakdown" aria-label="Розподіл за статусами">
          {breakdownStats.map((item) => <div className="application-stats-bar" key={item.key}>
            <span>{item.label}</span>
            <div><i style={{ width: `${Math.round((item.value / maxStatusCount) * 100)}%` }} /></div>
            <b>{item.value}</b>
          </div>)}
        </div>
      </div>
    </section>}

    {details && <ApplicationDetailsModal application={details} busy={busy} canDelete={user?.isPrimaryAdmin === true} deleteBusy={removeApplication.isPending} onClose={closeDetails} onShare={(item) => void shareApplication(item)} onStatus={(item, nextStatus, comment) => void changeStatus(item, nextStatus, comment)} onClaim={(item) => void claim(item)} onComment={(item, text) => void createComment(item, text)} onDelete={(item, code) => deleteApplication(item, code)} />}
  </div>;
}
