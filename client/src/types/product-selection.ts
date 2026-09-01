export type ProductSelectionPriceMode = 'none' | 'percent' | 'fixed';

export interface ProductSelectionItemReference {
  productExternalId: string;
  modificationExternalId: string | null;
}
export interface ProductSelectionItem extends ProductSelectionItemReference {
  id: string;
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
  missing: boolean;
}

export interface ProductSelection {
  id: string;
  publicId: string;
  name: string;
  heading: string;
  priceMode: ProductSelectionPriceMode;
  priceValue: number;
  highlightPromoPrice: boolean;
  buttonLabel: string;
  desktopColumns: number;
  mobileColumns: number;
  itemCount: number;
  items: ProductSelectionItem[];
  owner: { id: string; name: string } | null;
  isOwner: boolean;
  storeDomain: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductSelectionInput {
  name: string;
  heading: string;
  priceMode: ProductSelectionPriceMode;
  priceValue: number;
  highlightPromoPrice: boolean;
  buttonLabel: string;
  desktopColumns: number;
  mobileColumns: number;
  items: ProductSelectionItemReference[];
}
