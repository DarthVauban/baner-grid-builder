export type PopupCampaignStatus = 'draft' | 'active' | 'paused';
import type { PromoCodeSnapshot } from './promo-code';

export type PopupCampaignType = 'message' | 'out_of_stock_recommendations' | 'product_promo' | 'promo_code' | 'lead_form';
export type PopupLayout = 'modal' | 'bottom-sheet' | 'corner';
export type PopupPromoFormat = 'notification' | 'compact' | 'standard' | 'wide' | 'custom';
export type PopupDesktopPosition = 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
export type PopupMobilePosition = 'top' | 'bottom';
export type PopupTargetMode = 'all_pages' | 'all_products' | 'products' | 'rules' | 'target_page' | 'out_of_stock';
export type PopupFrequency = 'always' | 'session' | 'product' | 'hours' | 'days';
export type PopupTrigger = 'delay' | 'scroll' | 'inactivity' | 'exit_intent';
export type PopupDevice = 'all' | 'desktop' | 'mobile';

export interface PopupContent {
  eyebrow: string;
  title: string;
  body: string;
  primaryLabel: string;
  primaryUrl: string;
  secondaryLabel: string;
  imageUrl: string;
  acknowledgementLabel: string;
}

export interface PopupStyles {
  layout: PopupLayout;
  promoFormat: PopupPromoFormat;
  desktopPosition: PopupDesktopPosition;
  mobilePosition: PopupMobilePosition;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  mutedColor: string;
  primaryButtonBackgroundColor: string;
  primaryButtonTextColor: string;
  secondaryButtonBackgroundColor: string;
  secondaryButtonTextColor: string;
  checkboxAccentColor: string;
  checkboxCheckColor: string;
  checkboxTextColor: string;
  timelineColor: string;
  timelineTrackColor: string;
  showPromoTitle: boolean;
  eyebrowFontSize: number;
  titleFontSize: number;
  bodyFontSize: number;
  acknowledgementFontSize: number;
  buttonFontSize: number;
  buttonBorderRadius: number;
  borderRadius: number;
  maxWidth: number;
}

export interface PopupTargeting {
  mode: PopupTargetMode;
  match: 'all' | 'any';
  stickers: string[];
  brands: string[];
  categoryIds: string[];
  conditions: string[];
  targetPageUrl: string;
  urlContains: string[];
  recommendationLimit: number;
}

export interface PopupBehavior {
  trigger: PopupTrigger;
  delayMs: number;
  scrollPercent: number;
  inactivitySeconds: number;
  frequency: PopupFrequency;
  cooldownHours: number;
  cooldownDays: number;
  maxShowsPerSession: number;
  device: PopupDevice;
  autoCloseSeconds: number;
  rotationSeconds: number;
  activeWeekdays: number[];
  dailyStartTime: string;
  dailyEndTime: string;
  scheduleTimezone: string;
  dismissible: boolean;
  requireAcknowledgement: boolean;
  buttonCount: 1 | 2;
}

export interface PopupProductTarget {
  id: string;
  productId: string;
  modificationId: string | null;
  sku: string;
  title: string;
  inputValue: string;
  matchedBy: string;
}

export type PopupLeadFieldType = 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox';

export interface PopupLeadField {
  id: string;
  type: PopupLeadFieldType;
  label: string;
  placeholder: string;
  required: boolean;
  options: string[];
}

export interface PopupLeadFormConfig {
  fields: PopupLeadField[];
  submitLabel: string;
  successTitle: string;
  successBody: string;
}

export interface PopupPromoProductReference {
  productExternalId: string;
  modificationExternalId: string | null;
}

export interface PopupPromoProduct extends PopupPromoProductReference {
  id: string;
  productId: string;
  modificationId: string | null;
  position: number;
  sku: string;
  title: string;
  imageUrl: string;
  pageUrl: string;
  price: string;
  oldPrice: string;
  currency: string;
  availability: string;
  visible: boolean;
  available: boolean;
  buyId: string;
}

export interface PopupCampaign {
  id: string;
  publicId: string;
  campaignType: PopupCampaignType;
  name: string;
  status: PopupCampaignStatus;
  priority: number;
  content: PopupContent;
  styles: PopupStyles;
  targeting: PopupTargeting;
  behavior: PopupBehavior;
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
  productTargets: PopupProductTarget[];
  promoProducts: PopupPromoProduct[];
  promoCodeId: string | null;
  promoCode: PromoCodeSnapshot | null;
  publishedPromoCode: PromoCodeSnapshot | null;
  formConfig: PopupLeadFormConfig;
  publishedFormConfig: PopupLeadFormConfig | null;
  stats: {
    impressions: number;
    dismissals: number;
    clicks: number;
    acknowledgements: number;
    copies: number;
    promoCtaClicks: number;
    contacts: number;
  };
  connection: { id: string; generation: string; storeDomain: string } | null;
  resolution?: {
    unmatched: string[];
    unmatchedPromoProducts?: PopupPromoProductReference[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface PopupCampaignInput {
  campaignType: PopupCampaignType;
  name: string;
  priority: number;
  content: PopupContent;
  styles: PopupStyles;
  targeting: PopupTargeting;
  behavior: PopupBehavior;
  startsAt: string | null;
  endsAt: string | null;
  productEntries: string[];
  promoItems: PopupPromoProductReference[];
  promoCodeId: string | null;
  formConfig: PopupLeadFormConfig;
}

export interface PopupRuntimeProduct {
  productId: string;
  modificationId: string | null;
  article: string;
  title: string;
  imageUrl: string;
  pageUrl: string;
  price: string;
  oldPrice: string;
  currency: string;
  buyId: string;
}

export interface PopupPreviewPayload {
  campaign: {
    publicId: string;
    revision: string;
    type: PopupCampaignType;
    mode: PopupTargetMode;
    content: PopupContent;
    styles: PopupStyles;
    behavior: PopupBehavior;
    formConfig: PopupLeadFormConfig;
    promoCode: PromoCodeSnapshot | null;
  };
  product: { article: string; title: string } | null;
  recommendations: PopupRuntimeProduct[];
  products: PopupPromoProduct[];
}

export interface PopupLeadContact {
  id: string;
  values: Record<string, string | boolean>;
  pageUrl: string;
  createdAt: string;
}

export interface PopupLeadContactFeed {
  campaign: {
    id: string;
    name: string;
    formConfig: PopupLeadFormConfig;
  };
  items: PopupLeadContact[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PopupCampaignOptions {
  integration: {
    id: string;
    generation: string;
    storeDomain: string;
    status: string;
    lastSyncAt: string | null;
  } | null;
  stickers: Array<{ id: string; title: string }>;
  brands: string[];
  conditions: string[];
  categories: Array<{ id: string; title: string }>;
}
