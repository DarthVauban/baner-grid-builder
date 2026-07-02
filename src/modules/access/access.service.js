import { query } from '../../db/pool.js';

export const savedDataResources = ['banner_grids', 'saved_banners', 'product_tables'];
export const assignableRoles = ['admin', 'editor', 'content_manager'];

export async function canViewAllSavedData(user, resource) {
  if (user.role === 'admin') return true;
  if (!savedDataResources.includes(resource)) return false;
  const result = await query(
    `SELECT can_view_all
     FROM role_permissions
     WHERE role = $1 AND resource = $2`,
    [user.role, resource]
  );
  return result.rows[0]?.can_view_all === true;
}
