import type { ApplicationStatus } from '../types/application';

export const applicationStatusLabels: Record<ApplicationStatus, string> = {
  new: 'Нова',
  in_progress: 'В обробці',
  rejected: 'Відхилена',
  closed: 'Закрита'
};

export const applicationStatusOptions: Array<[ApplicationStatus | 'all', string]> = [
  ['all', 'Усі'],
  ['new', 'Нові'],
  ['in_progress', 'В обробці'],
  ['rejected', 'Відхилені'],
  ['closed', 'Закриті']
];

export function formatApplicationDate(value: string): string {
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

export function customerName(firstName: string, lastName: string): string {
  return [firstName, lastName].filter(Boolean).join(' ') || 'Покупець не вказаний';
}
