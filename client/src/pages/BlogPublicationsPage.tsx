import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { PublicationBatchModal } from '../components/PublicationBatchModal';
import { PublicationCard } from '../components/PublicationCard';
import { PublicationDetailsModal } from '../components/PublicationDetailsModal';
import { PublicationFormModal } from '../components/PublicationFormModal';
import { PublicationPublishModal } from '../components/PublicationPublishModal';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type { BlogPublication, PublicationCounts, PublicationInput, PublicationPerson, PublicationStatus } from '../types/publication';

const filters = [
  ['active', 'Активні'], ['today', 'Сьогодні'], ['upcoming', 'Майбутні'],
  ['ready', 'Готові'], ['overdue', 'Прострочені'], ['published', 'Опубліковані'], ['cancelled', 'Скасовані']
] as const;

function todayRange() {
  const from = new Date(); from.setHours(0, 0, 0, 0);
  const to = new Date(from); to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function hasCount(value: string): value is keyof PublicationCounts {
  return ['active', 'today', 'upcoming', 'ready', 'overdue'].includes(value);
}

export function BlogPublicationsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => localStorage.getItem('publications:view-mode') === 'list' ? 'list' : 'grid');
  const [batchOpen, setBatchOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BlogPublication | null>(null);
  const [details, setDetails] = useState<BlogPublication | null>(null);
  const [publishing, setPublishing] = useState<BlogPublication | null>(null);
  const range = useMemo(todayRange, []);
  const currentUser: PublicationPerson | null = user ? { id: user.id, name: user.name, email: user.email } : null;

  useEffect(() => localStorage.setItem('publications:view-mode', viewMode), [viewMode]);

  const publications = useQuery({
    queryKey: ['publications', filter, search, range.from, range.to],
    queryFn: () => api.publications.list({ filter, search: search.trim() || undefined, ...(filter === 'today' ? range : {}) })
  });
  const counts = useQuery({
    queryKey: ['publication-counts', range.from, range.to],
    queryFn: () => api.publications.counts(range),
    refetchInterval: 30_000
  });
  const createOne = useMutation({ mutationFn: api.publications.create });
  const createBatch = useMutation({ mutationFn: api.publications.createBatch });
  const update = useMutation({ mutationFn: ({ id, input }: { id: string; input: PublicationInput }) => api.publications.update(id, input) });
  const setStatus = useMutation({ mutationFn: ({ id, status, publicationUrl }: { id: string; status: PublicationStatus; publicationUrl?: string }) => api.publications.setStatus(id, status, publicationUrl) });
  const busy = createOne.isPending || createBatch.isPending || update.isPending || setStatus.isPending;

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['publications'] }),
      queryClient.invalidateQueries({ queryKey: ['publication-counts'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    ]);
  }

  async function save(input: PublicationInput) {
    if (editing) await update.mutateAsync({ id: editing.id, input });
    else await createOne.mutateAsync(input);
    showToast(editing ? 'Публікацію оновлено.' : 'Публікацію заплановано.');
    setFormOpen(false); setEditing(null);
    await refresh();
  }

  async function saveBatch(items: Array<Pick<PublicationInput, 'title' | 'publishAt' | 'assigneeId'>>) {
    const created = await createBatch.mutateAsync(items);
    showToast(`Створено карток: ${created.length}.`);
    setBatchOpen(false);
    await refresh();
  }

  async function applyStatus(publication: BlogPublication, status: PublicationStatus, publicationUrl = '') {
    if (status === 'cancelled' && !window.confirm(`Скасувати публікацію «${publication.title}»?`)) return;
    try {
      await setStatus.mutateAsync({ id: publication.id, status, publicationUrl });
      showToast(status === 'published' ? 'Публікацію завершено.' : status === 'ready' ? 'Матеріали позначено готовими.' : 'Статус публікації змінено.');
      setDetails(null); setPublishing(null);
      await refresh();
    } catch (error) { showToast(error instanceof Error ? error.message : 'Не вдалося змінити статус.', 'error'); }
  }

  function changeStatus(publication: BlogPublication, status: PublicationStatus) {
    if (status === 'published') return setPublishing(publication);
    void applyStatus(publication, status);
  }

  const items = publications.data || [];

  return <div className="publications-page">
    <header className="page-heading page-heading--row">
      <div><p className="eyebrow">Контент-план</p><h1>Публікації блогу</h1><p>Плануйте статті, передавайте матеріали та контролюйте готовність до публікації.</p></div>
      <div className="page-heading__actions"><button className="button button--secondary" type="button" onClick={() => setBatchOpen(true)}><Icon name="add" size={18} /> Швидке планування</button><button className="button button--primary" type="button" onClick={() => { setEditing(null); setFormOpen(true); }}><Icon name="blogPublications" size={18} /> Нова публікація</button></div>
    </header>

    <section className="task-toolbar" aria-label="Фільтри публікацій">
      <div className="task-filters">{filters.map(([value, label]) => { const count = hasCount(value) ? counts.data?.[value] || 0 : 0; return <button key={value} className={filter === value ? 'task-filter task-filter--active' : 'task-filter'} type="button" onClick={() => setFilter(value)}><span>{label}</span>{count > 0 && <span className="task-filter__count">{count > 99 ? '99+' : count}</span>}</button>; })}</div>
      <div className="task-toolbar__controls"><div className="task-search"><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Пошук публікацій" aria-label="Пошук публікацій" />{search && <button type="button" onClick={() => setSearch('')} aria-label="Очистити пошук"><Icon name="close" size={16} /></button>}</div><div className="task-view-switch" role="group" aria-label="Вигляд публікацій"><button className={viewMode === 'list' ? 'active' : ''} type="button" onClick={() => setViewMode('list')} aria-label="Рядки"><Icon name="viewList" size={18} /></button><button className={viewMode === 'grid' ? 'active' : ''} type="button" onClick={() => setViewMode('grid')} aria-label="Плитки"><Icon name="viewGrid" size={18} /></button></div></div>
    </section>

    {publications.isLoading && <div className="task-list-state"><span className="loading-screen__pulse" /><p>Завантажуємо публікації…</p></div>}
    {publications.isError && <div className="task-list-state task-list-state--error"><p>{publications.error instanceof Error ? publications.error.message : 'Не вдалося завантажити публікації.'}</p><button className="button button--secondary" type="button" onClick={() => void publications.refetch()}>Спробувати ще</button></div>}
    {!publications.isLoading && !publications.isError && !items.length && <div className="task-list-state"><span className="task-list-state__icon"><Icon name="blogPublications" size={28} /></span><h2>Публікацій поки немає</h2><p>Заплануйте одну статтю або створіть одразу декілька карток.</p></div>}
    {items.length > 0 && <section className={`publication-list publication-list--${viewMode}`}><div className="task-list__summary"><span>{items.length} публікацій</span></div>{items.map((publication) => <PublicationCard key={publication.id} publication={publication} viewMode={viewMode} canEdit={Boolean(user && (user.role === 'admin' || user.id === publication.creator.id || user.id === publication.assignee.id))} busy={busy} onOpen={setDetails} onEdit={(selected) => { setEditing(selected); setFormOpen(true); }} onStatus={(selected, status) => void changeStatus(selected, status)} />)}</section>}

    {currentUser && batchOpen && <PublicationBatchModal currentUser={currentUser} onClose={() => setBatchOpen(false)} onSubmit={saveBatch} />}
    {currentUser && formOpen && <PublicationFormModal key={editing?.id || 'new'} publication={editing} currentUser={currentUser} onClose={() => { setFormOpen(false); setEditing(null); }} onSubmit={save} />}
    {details && <PublicationDetailsModal publication={details} onClose={() => setDetails(null)} />}
    {publishing && <PublicationPublishModal publication={publishing} pending={setStatus.isPending} onClose={() => setPublishing(null)} onSubmit={(url) => applyStatus(publishing, 'published', url)} />}
  </div>;
}
