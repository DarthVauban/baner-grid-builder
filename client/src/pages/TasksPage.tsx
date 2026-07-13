import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { copyShareLink } from '../lib/share';
import { TaskCard } from '../components/TaskCard';
import { TaskFormModal } from '../components/TaskFormModal';
import { ReminderModal } from '../components/ReminderModal';
import { TaskDetailsModal } from '../components/TaskDetailsModal';
import { Icon } from '../components/Icon';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { useToast } from '../toast/ToastContext';
import type { ReminderSettings, Task, TaskCounts, TaskInput, TaskStatus } from '../types/task';

const filters = [
  ['active', 'Активні'],
  ['today', 'Сьогодні'],
  ['upcoming', 'Майбутні'],
  ['overdue', 'Прострочені'],
  ['invitations', 'Запрошення'],
  ['completed', 'Виконані'],
  ['cancelled', 'Скасовані']
] as const;

function isCountedFilter(value: string): value is keyof TaskCounts {
  return ['active', 'today', 'upcoming', 'overdue', 'invitations'].includes(value);
}

function todayRange() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function TasksPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const confirm = useConfirmDialog();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [reminderTask, setReminderTask] = useState<Task | null>(null);
  const [detailsTask, setDetailsTask] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => (
    window.localStorage.getItem('tasks:view-mode') === 'grid' ? 'grid' : 'list'
  ));
  const range = useMemo(todayRange, []);
  const sharedTaskId = searchParams.get('task');

  useEffect(() => window.localStorage.setItem('tasks:view-mode', viewMode), [viewMode]);

  const tasksQuery = useQuery({
    queryKey: ['tasks', filter, search],
    queryFn: () => api.tasks.list({
      filter,
      search: search.trim() || undefined,
      ...(filter === 'today' ? range : {})
    })
  });
  const countsQuery = useQuery({
    queryKey: ['task-counts', range.from, range.to],
    queryFn: () => api.tasks.counts(range),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true
  });
  const sharedTaskQuery = useQuery({
    queryKey: ['shared-task', sharedTaskId],
    queryFn: () => api.tasks.get(sharedTaskId!),
    enabled: Boolean(sharedTaskId),
    retry: false
  });

  useEffect(() => {
    if (sharedTaskQuery.data) setDetailsTask(sharedTaskQuery.data);
  }, [sharedTaskQuery.data]);

  useEffect(() => {
    if (!sharedTaskId || !sharedTaskQuery.error) return;
    showToast(sharedTaskQuery.error instanceof Error ? sharedTaskQuery.error.message : 'Не вдалося відкрити справу за посиланням.', 'error');
    const next = new URLSearchParams(searchParams);
    next.delete('task');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, sharedTaskId, sharedTaskQuery.error, showToast]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['task-counts'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    ]);
  };
  const createTask = useMutation({ mutationFn: api.tasks.create });
  const updateTask = useMutation({ mutationFn: ({ id, input }: { id: string; input: TaskInput }) => api.tasks.update(id, input) });
  const respond = useMutation({ mutationFn: ({ id, response }: { id: string; response: 'accepted' | 'declined' }) => api.tasks.respond(id, response) });
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => api.tasks.setStatus(id, status) });
  const setReminder = useMutation({ mutationFn: ({ id, settings }: { id: string; settings: ReminderSettings }) => api.tasks.setReminder(id, settings) });
  const removeTask = useMutation({ mutationFn: api.tasks.remove });
  const busy = createTask.isPending || updateTask.isPending || respond.isPending || setStatus.isPending || setReminder.isPending || removeTask.isPending;

  async function saveTask(input: TaskInput) {
    if (editingTask) await updateTask.mutateAsync({ id: editingTask.id, input });
    else await createTask.mutateAsync(input);
    setFormOpen(false);
    setEditingTask(null);
    showToast(editingTask ? 'Зміни збережено.' : 'Справу створено.');
    await refresh();
  }

  async function handleRespond(task: Task, response: 'accepted' | 'declined') {
    try {
      const updatedTask = await respond.mutateAsync({ id: task.id, response });
      if (detailsTask?.id === task.id) {
        if (updatedTask) setDetailsTask(updatedTask);
        else closeDetails();
      }
      showToast(response === 'accepted' ? 'Запрошення прийнято.' : 'Запрошення відхилено.');
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося відповісти на запрошення.', 'error');
    }
  }

  async function handleStatus(task: Task, status: TaskStatus) {
    try {
      await setStatus.mutateAsync({ id: task.id, status });
      showToast(status === 'completed' ? 'Справу виконано.' : 'Статус справи змінено.');
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося змінити статус.', 'error');
    }
  }

  async function handleReminder(settings: ReminderSettings) {
    if (!reminderTask) return;
    await setReminder.mutateAsync({ id: reminderTask.id, settings });
    setReminderTask(null);
    showToast('Нагадування оновлено.');
    await refresh();
  }

  async function handleDelete(task: Task) {
    const confirmed = await confirm({
      title: 'Видалити справу?',
      message: `Справу «${task.title}» буде видалено без можливості відновлення.`,
      confirmLabel: 'Видалити',
      tone: 'danger'
    });
    if (!confirmed) return;
    try {
      await removeTask.mutateAsync(task.id);
      showToast('Справу видалено.');
      await refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося видалити справу.', 'error');
    }
  }

  async function handleShare(task: Task) {
    try {
      await copyShareLink('task', task.id);
      showToast('Посилання на справу скопійовано.');
    } catch {
      showToast('Не вдалося скопіювати посилання.', 'error');
    }
  }

  function closeDetails() {
    setDetailsTask(null);
    if (!searchParams.has('task')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('task');
    setSearchParams(next, { replace: true });
  }

  const tasks = tasksQuery.data || [];

  return (
    <div className="tasks-page">
      <header className="page-heading page-heading--row tasks-page__heading">
        <div>
          <p className="eyebrow">Особистий список</p>
          <h1>Справи</h1>
          <p>Плануйте власні справи й запрошуйте колег, коли потрібна спільна участь.</p>
        </div>
        <button className="button button--primary" type="button" onClick={() => { setEditingTask(null); setFormOpen(true); }}>+ Створити справу</button>
      </header>

      <section className="task-toolbar" aria-label="Фільтри справ">
        <div className="task-filters">
          {filters.map(([value, label]) => {
            const count = isCountedFilter(value) ? countsQuery.data?.[value] ?? 0 : 0;
            return (
              <button key={value} className={filter === value ? 'task-filter task-filter--active' : 'task-filter'} type="button" onClick={() => setFilter(value)}>
                <span>{label}</span>
                {count > 0 && <span className="task-filter__count">{count > 99 ? '99+' : count}</span>}
              </button>
            );
          })}
        </div>
        <div className="task-toolbar__controls">
          <div className="task-search"><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Пошук справ" aria-label="Пошук справ" />{search && <button type="button" onClick={() => setSearch('')} aria-label="Очистити пошук" title="Очистити"><Icon name="close" size={16} /></button>}</div>
          <div className="task-view-switch" role="group" aria-label="Вигляд списку справ">
            <button className={viewMode === 'list' ? 'active' : ''} type="button" onClick={() => setViewMode('list')} aria-label="Відображати рядками" title="Рядки"><Icon name="viewList" size={18} /></button>
            <button className={viewMode === 'grid' ? 'active' : ''} type="button" onClick={() => setViewMode('grid')} aria-label="Відображати плитками" title="Плитки"><Icon name="viewGrid" size={18} /></button>
          </div>
        </div>
      </section>

      {tasksQuery.isLoading && <div className="task-list-state"><span className="loading-screen__pulse" /><p>Завантажуємо справи…</p></div>}
      {tasksQuery.isError && <div className="task-list-state task-list-state--error"><p>{tasksQuery.error instanceof Error ? tasksQuery.error.message : 'Не вдалося завантажити справи.'}</p><button className="button button--secondary" onClick={() => void tasksQuery.refetch()}>Спробувати ще</button></div>}
      {!tasksQuery.isLoading && !tasksQuery.isError && tasks.length === 0 && (
        <div className="task-list-state"><span className="task-list-state__icon"><Icon name="check" size={28} /></span><h2>{filter === 'invitations' ? 'Нових запрошень немає' : 'Тут поки порожньо'}</h2><p>{search ? 'Спробуйте змінити пошуковий запит.' : 'Створіть першу справу або оберіть інший фільтр.'}</p></div>
      )}
      {tasks.length > 0 && (
        <section className={`task-list task-list--${viewMode}`} aria-label="Список справ">
          <div className="task-list__summary"><span>{tasks.length} {tasks.length === 1 ? 'справа' : 'справ'}</span></div>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              viewMode={viewMode}
              busy={busy}
              onOpen={setDetailsTask}
              onShare={(selected) => void handleShare(selected)}
              onEdit={(selected) => { setEditingTask(selected); setFormOpen(true); }}
              onRespond={(selected, responseValue) => void handleRespond(selected, responseValue)}
              onStatus={(selected, statusValue) => void handleStatus(selected, statusValue)}
              onReminder={setReminderTask}
              onDelete={(selected) => void handleDelete(selected)}
            />
          ))}
        </section>
      )}

      {formOpen && <TaskFormModal key={editingTask?.id || 'new'} task={editingTask} onClose={() => { setFormOpen(false); setEditingTask(null); }} onSubmit={saveTask} />}
      {reminderTask && <ReminderModal task={reminderTask} onClose={() => setReminderTask(null)} onSubmit={handleReminder} />}
      {detailsTask && <TaskDetailsModal task={detailsTask} busy={respond.isPending} onClose={closeDetails} onShare={(selected) => void handleShare(selected)} onRespond={(selected, responseValue) => void handleRespond(selected, responseValue)} />}
    </div>
  );
}
