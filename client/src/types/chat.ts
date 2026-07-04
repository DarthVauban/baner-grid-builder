import type { PublicationMaterial, PublicationPerson, PublicationStatus } from './publication';
import type { ParticipantResponse, TaskStatus, TaskType } from './task';

export interface ChatPerson {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface ChatConversation {
  id: string;
  contact: ChatPerson;
  lastMessage: { body: string; createdAt: string } | null;
  unreadCount: number;
  updatedAt: string;
}

export interface ChatTaskPreview {
  title: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  startsAt: string | null;
  dueAt: string;
  isAllDay: boolean;
  owner: { id: string; name: string };
  participantCount: number;
  meetingUrl: string;
  isOwner: boolean;
  myResponseStatus: ParticipantResponse;
}

export interface ChatPublicationPreview {
  title: string;
  description: string;
  status: PublicationStatus;
  publishAt: string;
  creator: PublicationPerson;
  assignee: PublicationPerson | null;
  materials: PublicationMaterial[];
  publicationUrl: string;
}

export type ChatEntity =
  | { type: 'task'; id: string; available: false }
  | { type: 'task'; id: string; available: true; data: ChatTaskPreview }
  | { type: 'publication'; id: string; available: false }
  | { type: 'publication'; id: string; available: true; data: ChatPublicationPreview };

export interface ChatMessage {
  id: string;
  conversationId: string;
  body: string;
  sender: ChatPerson;
  own: boolean;
  entities: ChatEntity[];
  createdAt: string;
}
