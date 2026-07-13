import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ApplicationDetailsModal } from '../components/ApplicationDetailsModal';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { applicationStatusOptions, customerName, formatApplicationDate } from '../lib/application';
import { copyShareLink } from '../lib/share';
import { useToast } from '../toast/ToastContext';
import type { ApplicationRecord, ApplicationStatus } from '../types/application';

function countFor(status: string, counts?: { all: number; new: number; inProgress: number; rejected: number; closed: number }) {
  if (!counts) return 0;
  if (status === 'all') return counts.all;
  if (status === 'new') return counts.new;
  if (status === 'in_progress') return counts.inProgress;
  if (status === 'rejected') return counts.rejected;
  if (status === 'closed') return counts.closed;
  return 0;
}

export function ApplicationsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<ApplicationStatus | 'all'>('all');
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('created_desc');
  const [page, setPage] = useState(1);
  const [details, setDetails] = useState<ApplicationRecord | null>(null);
  const sharedApplicationId = searchParams.get('application');
  const queryParams = useMemo(() => ({ filter, search, sort, page, pageSize: 25 }), [filter, page, search, sort]);

  const applications = useQuery({
    queryKey: ['applications', queryParams],
    queryFn: () => api.applications.list(queryParams),
    refetchOnMount: 'always'
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
  const addComment = useMutation({
    mutationFn: ({ id, text, version }: { id: string; text: string; version: number }) => api.applications.addComment(id, text, version)
  });
  const busy = setStatus.isPending || addComment.isPending;

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
      setDetails(updated);
      showToast('Статус заявки змінено.');
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося змінити статус.', 'error');
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

  async function shareApplication(application: ApplicationRecord) {
    try {
      await copyShareLink('application', application.id);
      showToast('Посилання на заявку скопійовано.');
    } catch {
      showToast('Не вдалося скопіювати посилання.', 'error');
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(draftSearch.replace(/\D/g, '').slice(0, 5));
    setPage(1);
  }

  const items = applications.data?.items || [];

  return <div className="applications-page">
    <header className="page-heading page-heading--row">
      <div>
        <p className="eyebrow">Форми та покупці</p>
        <h1>Заявки</h1>
        <p>Обробляйте заявки з форм, контролюйте статуси, коментарі та товарний контекст без перезавантаження сторінки.</p>
      </div>
    </header>

    <section className="task-toolbar" aria-label="Фільтри заявок">
      <div className="task-filters">
        {applicationStatusOptions.map(([value, label]) => {
          const count = countFor(value, counts.data);
          return <button key={value} className={filter === value ? 'task-filter task-filter--active' : 'task-filter'} type="button" onClick={() => { setFilter(value); setPage(1); }}>
            <span>{label}</span>{count > 0 && <span className="task-filter__count">{count > 99 ? '99+' : count}</span>}
          </button>;
        })}
      </div>
      <form className="task-toolbar__controls" onSubmit={submitSearch}>
        <label className="application-sort"><span>Сортування</span><select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}>
          <option value="created_desc">Нові спочатку</option>
          <option value="updated_desc">Оновлені спочатку</option>
          <option value="number_desc">Номер за спаданням</option>
          <option value="number_asc">Номер за зростанням</option>
        </select></label>
        <div className="task-search"><Icon name="search" size={18} /><input inputMode="numeric" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="Номер заявки" aria-label="Пошук за номером заявки" />{draftSearch && <button type="button" onClick={() => { setDraftSearch(''); setSearch(''); setPage(1); }} aria-label="Очистити пошук"><Icon name="close" size={16} /></button>}</div>
        <button className="button button--secondary button--small" type="submit">Знайти</button>
      </form>
    </section>

    {applications.isLoading && <div className="task-list-state"><span className="loading-screen__pulse" /><p>Завантажуємо заявки...</p></div>}
    {applications.isError && <div className="task-list-state task-list-state--error"><p>{applications.error instanceof Error ? applications.error.message : 'Не вдалося завантажити заявки.'}</p><button className="button button--secondary" type="button" onClick={() => void applications.refetch()}>Спробувати ще</button></div>}
    {!applications.isLoading && !applications.isError && items.length === 0 && <div className="task-list-state"><span className="task-list-state__icon"><Icon name="tasks" size={28} /></span><h2>Заявок не знайдено</h2><p>{search ? 'Перевірте номер або очистіть пошук.' : 'Нові заявки зʼявляться тут автоматично після надсилання форми.'}</p></div>}

    {items.length > 0 && <section className="application-table" aria-label="Список заявок">
      <div className="application-table__head"><span>№</span><span>Статус</span><span>Покупець</span><span>Телефон</span><span>Банк</span><span>Форма</span><span>Товар</span><span>Створено</span><span>Оновлено</span><span>Дії</span></div>
      {items.map((application) => <article className="application-row" key={application.id}>
        <strong>{application.number}</strong>
        <label className="application-row__status">
          <span className={`application-status application-status--${application.status}`}>{application.statusLabel}</span>
          <select value={application.status} disabled={setStatus.isPending} onChange={(event) => void changeStatus(application, event.target.value as ApplicationStatus, '')}>
            {applicationStatusOptions.filter(([value]) => value !== 'all').map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <span>{customerName(application.customer.firstName, application.customer.lastName)}</span>
        <span>{application.customer.phone || '—'}</span>
        <span>{application.customer.bankLabel || '—'}</span>
        <span>{application.formName}</span>
        <span className="application-row__product">{application.product?.imageUrl ? <img src={application.product.imageUrl} alt="" loading="lazy" /> : <Icon name="productSelection" size={18} />}<b>{application.product?.title || application.pageTitle || 'Товар не визначено'}</b></span>
        <time>{formatApplicationDate(application.createdAt)}</time>
        <time>{formatApplicationDate(application.updatedAt)}</time>
        <button className="button button--secondary button--small" type="button" onClick={() => void openDetails(application)}>Відкрити</button>
      </article>)}
      <footer className="application-pagination">
        <span>{applications.data?.total || 0} заявок</span>
        <div><button className="button button--secondary button--small" type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Назад</button><span>{page} / {applications.data?.pageCount || 1}</span><button className="button button--secondary button--small" type="button" disabled={page >= (applications.data?.pageCount || 1)} onClick={() => setPage((value) => value + 1)}>Далі</button></div>
      </footer>
    </section>}

    {details && <ApplicationDetailsModal application={details} busy={busy} onClose={closeDetails} onShare={(item) => void shareApplication(item)} onStatus={(item, nextStatus, comment) => void changeStatus(item, nextStatus, comment)} onComment={(item, text) => void createComment(item, text)} />}
  </div>;
}
