export type AnalyticsPeriod = 7 | 30 | 90;

export interface ProductSelectionAnalytics {
  periodDays: number;
  totals: {
    impressions: number;
    productImpressions: number;
    productClicks: number;
    buyClicks: number;
    addToCart: number;
    alreadyInCart: number;
    errors: number;
    uniqueVisitors: number;
    clickThroughRate: number;
    cartRate: number;
  };
  series: Array<{
    date: string;
    impression: number;
    product_click: number;
    add_to_cart: number;
    add_to_cart_error: number;
  }>;
  selections: Array<{
    id: string;
    publicId: string;
    name: string;
    itemCount: number;
    impression?: number;
    product_impression?: number;
    product_click?: number;
    buy_click?: number;
    add_to_cart?: number;
    already_in_cart?: number;
    add_to_cart_error?: number;
  }>;
  products: Array<{
    productExternalId: string;
    modificationExternalId: string | null;
    sku: string;
    title: string;
    imageUrl: string;
    product_impression?: number;
    product_click?: number;
    buy_click?: number;
    add_to_cart?: number;
    already_in_cart?: number;
    add_to_cart_error?: number;
  }>;
  surfaces: Array<{ surface: 'desktop' | 'mobile'; count: number }>;
  pages: Array<{
    pageUrl: string;
    impression?: number;
    product_click?: number;
    add_to_cart?: number;
    add_to_cart_error?: number;
  }>;
}

export interface PopupBannerAnalytics {
  periodDays: number;
  totals: {
    impressions: number;
    clicks: number;
    dismissals: number;
    acknowledgements: number;
    uniqueVisitors: number;
    engagementRate: number;
    dismissRate: number;
  };
  series: Array<{
    date: string;
    impression: number;
    click: number;
    dismiss: number;
    acknowledge: number;
  }>;
  campaigns: Array<{
    id: string;
    publicId: string;
    name: string;
    status: 'draft' | 'active' | 'paused';
    impression?: number;
    click?: number;
    dismiss?: number;
    acknowledge?: number;
  }>;
  pages: Array<{
    pageUrl: string;
    impression?: number;
    click?: number;
    dismiss?: number;
    acknowledge?: number;
  }>;
}
