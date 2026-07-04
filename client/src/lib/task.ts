import type { Task, TaskType } from '../types/task';

export const taskTypeLabels: Record<TaskType, string> = {
  general: 'Звичайна справа',
  reminder: 'Нагадування',
  deadline: 'Дедлайн',
  offline_meeting: 'Офлайн-зустріч',
  online_meeting: 'Онлайн-зустріч',
  call: 'Дзвінок',
  event: 'Подія',
  publication: 'Публікація / запуск',
  other: 'Інше'
};

export function formatTaskDate(task: Task): string {
  const date = new Date(task.dueAt);
  return new Intl.DateTimeFormat('uk-UA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(task.isAllDay ? {} : { hour: '2-digit', minute: '2-digit' })
  }).format(date);
}

export function formatTaskDateValue(value: string, isAllDay = false): string {
  return new Intl.DateTimeFormat('uk-UA', isAllDay
    ? { dateStyle: 'medium' }
    : { dateStyle: 'medium', timeStyle: 'short' }
  ).format(new Date(value));
}

export function isTaskOverdue(task: Task): boolean {
  return task.status === 'active' && new Date(task.dueAt).getTime() < Date.now();
}

export function toLocalDateTime(value: string | Date): string {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function toLocalDate(value: string | Date): string {
  return toLocalDateTime(value).slice(0, 10);
}
