import { env } from '../config/env.js';

export function serializeUser(row) {
  const nameParts = String(row.name || '').trim().split(/\s+/).filter(Boolean);
  const storedFirstName = String(row.first_name || '').trim();
  const storedLastName = String(row.last_name || '').trim();
  const hasStructuredName = Boolean(storedLastName || (storedFirstName && storedFirstName !== row.name));
  const isPrimaryAdmin = Boolean(
    row.role === 'admin'
    && env.ADMIN_EMAIL
    && String(row.email || '').toLowerCase() === env.ADMIN_EMAIL.toLowerCase()
  );
  return {
    id: row.id,
    name: row.name,
    firstName: hasStructuredName ? storedFirstName : (nameParts[0] || ''),
    lastName: hasStructuredName ? storedLastName : nameParts.slice(1).join(' '),
    email: row.email,
    department: row.department || '',
    position: row.position || '',
    avatarUrl: row.avatar_mime ? `/api/users/${row.id}/avatar?v=${encodeURIComponent(row.updated_at || '')}` : '',
    role: row.role,
    status: row.status,
    canManageToolAccess: row.can_manage_tool_access === true,
    twoFactorEnabled: row.two_factor_enabled === true,
    twoFactorConfirmedAt: row.two_factor_confirmed_at || null,
    isPrimaryAdmin,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializeOwner(row, currentUser) {
  const id = row.owner_id || row.user_id;
  const isCurrentUser = Boolean(currentUser && id === currentUser.id);

  return {
    owner: id ? {
      id,
      name: row.owner_name || (isCurrentUser ? currentUser.name : '')
    } : null,
    isOwner: row.is_owner ?? isCurrentUser
  };
}

export function serializeGrid(row, currentUser) {
  return {
    id: row.id,
    name: row.name,
    shareDescription: row.share_description,
    banners: row.banners,
    ...serializeOwner(row, currentUser),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function serializeBanner(row, currentUser) {
  return {
    id: row.id,
    name: row.name,
    banner: row.data,
    ...serializeOwner(row, currentUser),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function serializeProductTable(row, currentUser) {
  return {
    id: row.id,
    name: row.name,
    fileName: row.file_name,
    ...(row.data === undefined ? {} : { data: row.data }),
    sheetCount: row.sheet_count,
    rowCount: row.row_count,
    ...serializeOwner(row, currentUser),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
