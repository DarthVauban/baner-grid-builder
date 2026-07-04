export type UserRole = 'admin' | 'editor' | 'content_manager';
export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  canManageToolAccess?: boolean;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  name: string;
}

export type SavedDataResource = 'banner_grids' | 'saved_banners' | 'product_tables';
export type PermissionRole = 'editor' | 'content_manager';

export interface RolePermission {
  role: PermissionRole;
  resource: SavedDataResource;
  canViewAll: boolean;
  updatedAt: string;
}

export interface UserDirectory {
  items: User[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  summary: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
}
