export type ToolId = 'banner_grid' | 'product_selection' | 'product_tables';

export interface UserToolAccess {
  tools: ToolId[];
  canManageToolAccess: boolean;
}
