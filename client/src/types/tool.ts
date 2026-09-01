export type ToolId = 'banner_grid' | 'product_selection' | 'blog_publications' | 'chat' | 'applications' | 'form_builder' | 'used_smartphones_catalog' | 'trade_in' | 'store_map' | 'facebook_group_publications' | 'horoshop_related_products' | 'horoshop_photo_parser' | 'online_support' | 'popup_banners' | 'horoshop_catalog_menu' | 'horoshop_cart_theme' | 'horoshop_title_labels';

export interface UserToolAccess {
  tools: ToolId[];
  canManageToolAccess: boolean;
  twoFactorEnabled: boolean;
  requiresTwoFactorTools: ToolId[];
  toolRequirements: ToolSecurityRequirement[];
  canManageToolRequirements: boolean;
}

export interface ToolSecurityRequirement {
  toolId: ToolId;
  requiresTwoFactor: boolean;
  updatedAt: string | null;
}

export interface ToolCatalogItem {
  toolId: ToolId;
  granted: boolean;
  accessible: boolean;
  blockedByTwoFactor: boolean;
  requiresTwoFactor: boolean;
}

export interface ToolCatalog {
  tools: ToolCatalogItem[];
  twoFactorEnabled: boolean;
}
