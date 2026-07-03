import type { UserRole } from '../types/user';

export const roleLabels: Record<UserRole, string> = {
  admin: 'Адміністратор',
  editor: 'Редактор',
  content_manager: 'Контент-менеджер'
};

export function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase() || 'MT';
}
