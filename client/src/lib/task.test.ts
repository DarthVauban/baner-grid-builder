import { describe, expect, it, vi } from 'vitest';
import { formatTaskDate, isTaskOverdue, taskTypeLabels, toLocalDateTime } from './task';
import type { Task } from '../types/task';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    type: 'deadline',
    title: 'Prepare campaign',
    description: '',
    status: 'active',
    isAllDay: false,
    startsAt: null,
    dueAt: '2030-01-10T12:00:00.000Z',
    location: '',
    meetingUrl: '',
    owner: { id: 'user-1', name: 'Owner' },
    isOwner: true,
    myResponseStatus: 'accepted',
    participants: [],
    reminder: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2030-01-01T00:00:00.000Z',
    updatedAt: '2030-01-01T00:00:00.000Z',
    ...overrides
  };
}

describe('task presentation helpers', () => {
  it('provides labels for task types', () => {
    expect(taskTypeLabels.online_meeting).toBe('Онлайн-зустріч');
    expect(taskTypeLabels.publication).toBe('Публікація / запуск');
  });

  it('derives overdue state instead of storing it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-11T00:00:00.000Z'));
    expect(isTaskOverdue(makeTask())).toBe(true);
    expect(isTaskOverdue(makeTask({ status: 'completed' }))).toBe(false);
    vi.useRealTimers();
  });

  it('formats dates and local form values', () => {
    expect(formatTaskDate(makeTask())).toContain('10');
    expect(toLocalDateTime('2030-01-10T12:00:00.000Z')).toMatch(/^2030-01-10T\d{2}:00$/);
  });
});
