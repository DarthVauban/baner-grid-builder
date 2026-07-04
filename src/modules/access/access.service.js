import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';

export const savedDataResources = ['banner_grids', 'saved_banners', 'product_tables'];
export const assignableRoles = ['admin', 'editor', 'content_manager'];
export const toolIds = ['banner_grid', 'product_selection', 'product_tables', 'blog_publications'];

export async function getUserToolAccess(user, db = { query }) {
  if (user.role === 'admin') return [...toolIds];
  const result = await db.query(
    'SELECT tool_id FROM user_tool_access WHERE user_id = $1 ORDER BY tool_id',
    [user.id]
  );
  return result.rows.map((row) => row.tool_id);
}

export async function grantDefaultToolAccess(userId, db = { query }) {
  for (const toolId of toolIds) {
    await db.query(
      `INSERT INTO user_tool_access (user_id, tool_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, tool_id) DO NOTHING`,
      [userId, toolId]
    );
  }
}

export function requireToolAccess(toolId) {
  if (!toolIds.includes(toolId)) throw new Error(`Unknown tool: ${toolId}`);
  return asyncHandler(async (req, res, next) => {
    const access = await getUserToolAccess(req.user);
    if (!access.includes(toolId)) {
      throw new AppError(403, 'TOOL_ACCESS_DENIED', 'У вас немає доступу до цього інструмента.');
    }
    next();
  });
}

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
