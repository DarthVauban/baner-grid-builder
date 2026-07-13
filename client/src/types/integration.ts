export interface MailtrapIntegration {
  configured: boolean;
  senderEmail: string;
  senderName: string;
  domain: string;
  updatedAt: string | null;
}

export interface IntegrationSettings {
  mailtrap: MailtrapIntegration;
}

export interface MailtrapIntegrationInput {
  senderEmail: string;
  senderName: string;
  token: string;
}
