export type SupportConversationStatus = 'NEW' | 'OPEN' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
export type SupportMessageSender = 'visitor' | 'operator' | 'system';

export interface SupportProductCard {
  id: string;
  productId: string;
  modificationId: string | null;
  title: string;
  sku: string;
  brand: string;
  price: string;
  oldPrice: string;
  currency: string;
  availability: string;
  visible: boolean;
  active: boolean;
  imageUrl: string;
  url: string;
  source: 'message' | 'page';
}

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
  name: string;
  email: string;
  phone: string;
  firstPageUrl: string;
  lastPageUrl: string;
  lastPageTitle: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface SupportCustomerInput {
  name: string;
  email: string;
  phone: string;
}

export interface SupportMessage {
  id: string;
  conversationId: string;
  senderType: SupportMessageSender;
  senderUserId: string | null;
  senderName: string;
  body: string;
  productCards: SupportProductCard[];
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
