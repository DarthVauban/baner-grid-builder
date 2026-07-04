import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Task } from '../types/task';
import { TaskDetailsModal } from './TaskDetailsModal';

const invitation: Task = {
  id: 'task-1',
  type: 'online_meeting',
  title: 'Team meeting',
  description: 'Discuss the plan.',
  status: 'active',
  isAllDay: false,
  startsAt: '2099-01-10T10:00:00.000Z',
  dueAt: '2099-01-10T11:00:00.000Z',
  location: '',
  meetingUrl: '',
  owner: { id: 'owner-1', name: 'Owner' },
  isOwner: false,
  myResponseStatus: 'pending',
  participants: [],
  reminder: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: '2099-01-01T00:00:00.000Z',
  updatedAt: '2099-01-01T00:00:00.000Z'
};

describe('TaskDetailsModal', () => {
  it('allows a pending invited user to accept or decline from shared details', async () => {
    const onRespond = vi.fn();
    render(<TaskDetailsModal task={invitation} onClose={vi.fn()} onShare={vi.fn()} onRespond={onRespond} />);

    await userEvent.click(screen.getByRole('button', { name: 'Прийняти' }));
    expect(onRespond).toHaveBeenCalledWith(invitation, 'accepted');

    await userEvent.click(screen.getByRole('button', { name: 'Відхилити' }));
    expect(onRespond).toHaveBeenCalledWith(invitation, 'declined');
  });

  it('hides invitation actions after participation is accepted', () => {
    render(<TaskDetailsModal task={{ ...invitation, myResponseStatus: 'accepted' }} onClose={vi.fn()} onShare={vi.fn()} onRespond={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Прийняти' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Відхилити' })).not.toBeInTheDocument();
  });
});
