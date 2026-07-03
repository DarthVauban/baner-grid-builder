import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { TaskCard } from '../components/TaskCard';
import { TaskFormModal } from '../components/TaskFormModal';
import { ReminderModal } from '../components/ReminderModal';
import type { ReminderSettings, Task, TaskInput, TaskStatus } from '../types/task';

const filters = [
  ['active', 'Активні'],
  ['today', 'Сьогодні'],
  ['upcoming', 'Майбутні'],
  ['overdue', 'Прострочені'],
  ['invitations', 'Запрошення'],
  ['completed', 'Виконані'],
  ['cancelled', 'Скасовані']
] as const;

function todayRange() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function TasksPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [reminderTask, setReminderTask] = useState<Task | null>(null);
  const [message, setMessage] = useState('');
  const range = useMemo(todayRange, []);

  const tasksQuery = useQuery({
    queryKey: ['tasks', filter, search],
    queryFn: () => api.tasks.list({
      filter,
      search: search.trim() || undefined,
      ...(filter === 'today' ? range : {})
    })
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
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
    setMessage(editingTask ? 'Зміни збережено.' : 'Справу створено.');
    await refresh();
  }

  async function handleRespond(task: Task, response: 'accepted' | 'declined') {
    try {
      await respond.mutateAsync({ id: task.id, response });
      setMessage(response === 'accepted' ? 'Запрошення прийнято.' : 'Запрошення відхилено.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не вдалося відповісти на запрошення.');
    }
  }

  async function handleStatus(task: Task, status: TaskStatus) {
    try {
      await setStatus.mutateAsync({ id: task.id, status });
      setMessage(status === 'completed' ? 'Справу виконано.' : 'Статус справи змінено.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не вдалося змінити статус.');
    }
  }

  async function handleReminder(settings: ReminderSettings) {
    if (!reminderTask) return;
    await setReminder.mutateAsync({ id: reminderTask.id, settings });
    setReminderTask(null);
    setMessage('Нагадування оновлено.');
    await refresh();
  }

  async function handleDelete(task: Task) {
    if (!window.confirm(`Видалити справу «${task.title}»?`)) return;
    try {
      await removeTask.mutateAsync(task.id);
      setMessage('Справу видалено.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не вдалося видалити справу.');
    }
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

      {message && <div className="tasks-page__message" role="status"><span>{message}</span><button type="button" onClick={() => setMessage('')}>×</button></div>}

      <section className="task-toolbar" aria-label="Фільтри справ">
        <div className="task-filters">
          {filters.map(([value, label]) => (
            <button key={value} className={filter === value ? 'task-filter task-filter--active' : 'task-filter'} type="button" onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
        <label className="task-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Пошук справ" aria-label="Пошук справ" /></label>
      </section>

      {tasksQuery.isLoading && <div className="task-list-state"><span className="loading-screen__pulse" /><p>Завантажуємо справи…</p></div>}
      {tasksQuery.isError && <div className="task-list-state task-list-state--error"><p>{tasksQuery.error instanceof Error ? tasksQuery.error.message : 'Не вдалося завантажити справи.'}</p><button className="button button--secondary" onClick={() => void tasksQuery.refetch()}>Спробувати ще</button></div>}
      {!tasksQuery.isLoading && !tasksQuery.isError && tasks.length === 0 && (
        <div className="task-list-state"><span className="task-list-state__icon">✓</span><h2>{filter === 'invitations' ? 'Нових запрошень немає' : 'Тут поки порожньо'}</h2><p>{search ? 'Спробуйте змінити пошуковий запит.' : 'Створіть першу справу або оберіть інший фільтр.'}</p></div>
      )}
      {tasks.length > 0 && (
        <section className="task-list" aria-label="Список справ">
          <div className="task-list__summary"><span>{tasks.length} {tasks.length === 1 ? 'справа' : 'справ'}</span></div>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              busy={busy}
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
    </div>
  );
}
