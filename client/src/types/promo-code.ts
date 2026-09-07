export type PromoCodeType = 'percent_coupon' | 'amount_certificate';
export type PromoCodeStatus = 'active' | 'scheduled' | 'ended' | 'disabled';

export interface PromoCodeCampaignUsage {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused';
  campaignType: string;
}

export interface PromoCodeSnapshot {
  libraryId: string;
  internalName: string;
  code: string;
  type: PromoCodeType;
  discountValue: number;
  currency: string;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  scopeNote: string;
  status: PromoCodeStatus;
  horoshopConfirmed: boolean;
  capturedAt: string;
}

export interface PromoCode extends Omit<PromoCodeSnapshot, 'libraryId' | 'capturedAt'> {
  id: string;
  connectionId: string;
  storeDomain: string;
  enabled: boolean;
  campaigns: PromoCodeCampaignUsage[];
  createdAt: string;
  updatedAt: string;
}

export interface PromoCodeInput {
  internalName: string;
  code: string;
  type: PromoCodeType;
  discountValue: number;
  currency: string;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  scopeNote: string;
  enabled: boolean;
  horoshopConfirmed: boolean;
}
