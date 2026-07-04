import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Task } from '../types/task';
import { TaskCard } from './TaskCard';

const invitation: Task = {
  id: 'task-1',
  type: 'online_meeting',
  title: 'Командна зустріч',
  description: 'Синхронізація планів',
  status: 'active',
  isAllDay: false,
  startsAt: '2099-01-10T10:00:00.000Z',
  dueAt: '2099-01-10T11:00:00.000Z',
  location: '',
  meetingUrl: 'https://meet.google.com/example',
  owner: { id: 'owner-1', name: 'Олена' },
  isOwner: false,
  myResponseStatus: 'pending',
  participants: [],
  reminder: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: '2099-01-01T00:00:00.000Z',
  updatedAt: '2099-01-01T00:00:00.000Z'
};

describe('TaskCard', () => {
  it('shows invitation actions and returns the selected response', async () => {
    const onRespond = vi.fn();
    const onOpen = vi.fn();
    render(<TaskCard task={invitation} viewMode="list" onOpen={onOpen} onShare={vi.fn()} onEdit={vi.fn()} onRespond={onRespond} onStatus={vi.fn()} onReminder={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('Потрібна відповідь')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Деталі' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Прийняти' }));
    expect(onRespond).toHaveBeenCalledWith(invitation, 'accepted');
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
