export type ToolId = 'banner_grid' | 'product_selection' | 'product_tables' | 'blog_publications' | 'chat';

export interface UserToolAccess {
  tools: ToolId[];
  canManageToolAccess: boolean;
}
