export type SupportConversationStatus = 'NEW' | 'OPEN' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
export type SupportMessageSender = 'visitor' | 'operator' | 'system';

export interface SupportChatSettings {
  id: string;
  publicId: string;
  name: string;
  enabled: boolean;
  allowedOrigins: string[];
  accentColor: string;
  welcomeText: string;
  autoReplyText: string;
  contactFormEnabled: boolean;
  contactFormPrompt: string;
  updatedAt: string;
}

export interface SupportVisitor {
  id: string;
  email: string;
  phone: string;
  firstPageUrl: string;
  lastPageUrl: string;
  lastPageTitle: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface SupportMessage {
  id: string;
  conversationId: string;
  senderType: SupportMessageSender;
  senderUserId: string | null;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface SupportPublicConversation {
  id: string;
  status: SupportConversationStatus;
  messages: SupportMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface SupportPublicSession {
  token: string;
  settings: SupportChatSettings;
  visitor: SupportVisitor;
  conversation: SupportPublicConversation | null;
}

export interface SupportConversation {
  id: string;
  status: SupportConversationStatus;
  assignedUser: { id: string; name: string } | null;
  visitor: SupportVisitor;
  lastMessage: { body: string; senderType: SupportMessageSender; createdAt: string } | null;
  unreadCount: number;
  firstResponseAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportConversationDetail {
  conversation: SupportConversation;
  messages: SupportMessage[];
}

export interface SupportChatSettingsInput {
  name: string;
  enabled: boolean;
  allowedOrigins: string[];
  accentColor: string;
  welcomeText: string;
  autoReplyText: string;
  contactFormEnabled: boolean;
  contactFormPrompt: string;
}
