export interface HoroshopCheckoutTelegramConfig {
  telegramUrl: string;
  buttonText: string;
  buttonBackgroundColor: string;
  buttonHoverBackgroundColor: string;
  buttonTextColor: string;
  buttonBorderColor: string;
  buttonBorderRadius: number;
  buttonFontSize: number;
  qrSize: number;
  mobileButtonFontSize: number;
  mobileQrSize: number;
}

export interface HoroshopCheckoutTelegramSettings {
  publicId: string;
  enabled: boolean;
  draftConfig: HoroshopCheckoutTelegramConfig;
  publishedConfig: HoroshopCheckoutTelegramConfig | null;
  publishedVersion: number;
  storeDomain: string;
  updatedAt: string;
  publishedAt: string | null;
  embedCode: string;
}
