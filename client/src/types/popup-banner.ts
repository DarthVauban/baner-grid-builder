export type PopupCampaignStatus = 'draft' | 'active' | 'paused';
export type PopupLayout = 'modal' | 'bottom-sheet' | 'corner';
export type PopupTargetMode = 'all_pages' | 'all_products' | 'products' | 'rules';
export type PopupFrequency = 'always' | 'session' | 'product' | 'days';

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
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  mutedColor: string;
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
  urlContains: string[];
}

export interface PopupBehavior {
  delayMs: number;
  frequency: PopupFrequency;
  cooldownDays: number;
  dismissible: boolean;
  requireAcknowledgement: boolean;
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

export interface PopupCampaign {
  id: string;
  publicId: string;
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
  stats: {
    impressions: number;
    dismissals: number;
    clicks: number;
    acknowledgements: number;
  };
  connection: { id: string; generation: string; storeDomain: string } | null;
  resolution?: { unmatched: string[] };
  createdAt: string;
  updatedAt: string;
}

export interface PopupCampaignInput {
  name: string;
  priority: number;
  content: PopupContent;
  styles: PopupStyles;
  targeting: PopupTargeting;
  behavior: PopupBehavior;
  startsAt: string | null;
  endsAt: string | null;
  productEntries: string[];
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
