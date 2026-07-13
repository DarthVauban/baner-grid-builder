export type ToolId = 'banner_grid' | 'product_selection' | 'product_tables' | 'blog_publications' | 'chat' | 'applications' | 'form_builder';

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
