import type { PublicationMaterial, PublicationPerson, PublicationStatus } from './publication';
import type { ParticipantResponse, TaskStatus, TaskType } from './task';

export interface ChatPerson {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export type ChatGroupRole = 'owner' | 'admin' | 'member';
export interface ChatGroupMember extends ChatPerson { role: ChatGroupRole }

export interface ChatConversation {
  id: string;
  type: 'direct' | 'group';
  title: string;
  iconUrl: string;
  contact: ChatPerson | null;
  members: ChatGroupMember[];
  createdBy: string | null;
  myRole: ChatGroupRole;
  lastMessage: { body: string; senderName: string; createdAt: string } | null;
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

export type ChatLinkPreview =
  | { type: 'image'; url: string; hostname: string }
  | { type: 'link'; url: string; hostname: string; path: string };

export interface ChatReplyPreview {
  id: string;
  body: string;
  sender: { id: string; name: string };
  own: boolean;
}

export interface ChatReaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  users: Array<{ id: string; name: string }>;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  body: string;
  sender: ChatPerson;
  own: boolean;
  entities: ChatEntity[];
  linkPreviews: ChatLinkPreview[];
  replyTo: ChatReplyPreview | null;
  reactions: ChatReaction[];
  createdAt: string;
}
