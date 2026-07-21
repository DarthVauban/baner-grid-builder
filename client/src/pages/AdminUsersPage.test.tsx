import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '../types/user';
import { AdminUserRow } from './AdminUsersPage';

const pendingUser: User = {
  id: 'user-2',
  name: 'Ірина Коваль',
  firstName: 'Ірина',
  lastName: 'Коваль',
  email: 'iryna@example.com',
  department: '',
  position: '',
  avatarUrl: '',
  role: 'content_manager',
  status: 'pending',
  twoFactorEnabled: false,
  twoFactorConfirmedAt: null,
  isPrimaryAdmin: false,
  approvedAt: null,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z'
};

describe('AdminUserRow', () => {
  it('allows an administrator to approve a pending user and change their role', async () => {
    const onRole = vi.fn();
    const onStatus = vi.fn();
    const onAccess = vi.fn();
    const onNotifications = vi.fn();
    const onDelete = vi.fn();
    render(<AdminUserRow user={pendingUser} currentUserId="admin-1" busy={false} canAdminister onAccess={onAccess} onNotifications={onNotifications} onDelete={onDelete} onRole={onRole} onStatus={onStatus} />);

    expect(screen.getByText('Очікує схвалення')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Доступи' }));
    expect(onAccess).toHaveBeenCalledWith(pendingUser);
    await userEvent.click(screen.getByRole('button', { name: 'Сповіщення' }));
    expect(onNotifications).toHaveBeenCalledWith(pendingUser);
    await userEvent.click(screen.getByRole('button', { name: 'Роль користувача Ірина Коваль' }));
    await userEvent.click(screen.getByRole('option', { name: 'Редактор' }));
    expect(onRole).toHaveBeenCalledWith(pendingUser, 'editor');
    await userEvent.click(screen.getByRole('button', { name: 'Схвалити' }));
    expect(onStatus).toHaveBeenCalledWith(pendingUser, 'approved');
    await userEvent.click(screen.getByRole('button', { name: /Видалити/ }));
    expect(onDelete).toHaveBeenCalledWith(pendingUser);
  });

  it('does not allow the current administrator to demote or reject themselves', () => {
    const self = { ...pendingUser, id: 'admin-1', role: 'admin' as const, status: 'approved' as const };
    render(<AdminUserRow user={self} currentUserId="admin-1" busy={false} canAdminister onAccess={vi.fn()} onNotifications={vi.fn()} onDelete={vi.fn()} onRole={vi.fn()} onStatus={vi.fn()} />);
    expect(screen.getByText('Ви')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сповіщення' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Роль користувача Ірина Коваль' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Відхилити' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Видалити/ })).not.toBeInTheDocument();
  });
});
