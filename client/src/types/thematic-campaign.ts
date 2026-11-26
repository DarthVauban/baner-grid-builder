export interface CampaignProduct {
  id: string;
  sku: string;
  title: string;
  availability: string | null;
  inactive?: boolean;
}
export interface CampaignMatch extends CampaignProduct { category: string; categoryName: string }
export interface CampaignResolution {
  generation: string;
  matched: CampaignMatch[];
  duplicates: number;
  unmatched: string[];
  ambiguous: Array<{ input: string; candidates: CampaignMatch[] }>;
}
export interface CampaignSection { id: string; name: string; categories: string[]; products: CampaignProduct[] }
export interface CampaignSummary { id: string; publicId: string; name: string; revision: number }
export interface CampaignDetail extends CampaignSummary { generation: string; sections: CampaignSection[] }
export interface CampaignInput {
  name: string;
  generation: string;
  sections: Array<{ id: string; name: string; categories: string[]; productIds: string[] }>;
}
