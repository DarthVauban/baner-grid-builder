export type TaskType =
  | 'general'
  | 'reminder'
  | 'deadline'
  | 'offline_meeting'
  | 'online_meeting'
  | 'call'
  | 'event'
  | 'publication'
  | 'other';

export type TaskStatus = 'active' | 'completed' | 'cancelled';
export type ParticipantResponse = 'pending' | 'accepted' | 'declined';

export interface TaskParticipant {
  id: string;
  name: string;
  email: string;
  responseStatus: ParticipantResponse;
  respondedAt: string | null;
}

export interface ReminderSettings {
  enabled: boolean;
  remindBeforeMinutes: number;
  repeatIntervalMinutes: number | null;
  nextReminderAt?: string | null;
  lastRemindedAt?: string | null;
}

export interface Task {
  id: string;
  type: TaskType;
  title: string;
  description: string;
  status: TaskStatus;
  isAllDay: boolean;
  startsAt: string | null;
  dueAt: string;
  location: string;
  meetingUrl: string;
  owner: { id: string; name: string };
  isOwner: boolean;
  myResponseStatus: ParticipantResponse;
  participants: TaskParticipant[];
  reminder: ReminderSettings | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInput {
  type: TaskType;
  title: string;
  description: string;
  isAllDay: boolean;
  startsAt: string | null;
  dueAt: string;
  location: string;
  meetingUrl: string;
  participantIds: string[];
  reminder: ReminderSettings;
}

export interface UserSearchResult {
  id: string;
  name: string;
  email: string;
}

export interface Notification {
  id: string;
  taskId: string | null;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationFeed {
  items: Notification[];
  unreadCount: number;
}
