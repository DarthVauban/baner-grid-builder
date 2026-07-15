import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';

export const savedDataResources = ['banner_grids', 'saved_banners', 'product_tables'];
export const assignableRoles = ['admin', 'editor', 'content_manager', 'manager'];
export const toolIds = ['banner_grid', 'product_selection', 'product_tables', 'blog_publications', 'chat', 'applications', 'form_builder', 'used_smartphones_catalog'];
const defaultToolIds = ['banner_grid', 'product_selection', 'product_tables', 'blog_publications'];

export async function getToolSecurityRequirements(db = { query }) {
  const result = await db.query(
    `SELECT tool_id, requires_two_factor, updated_at
     FROM tool_security_requirements
     ORDER BY tool_id`
  );
  const stored = new Map(result.rows.map((row) => [row.tool_id, row]));

  return toolIds.map((toolId) => {
    const row = stored.get(toolId);
    return {
      toolId,
      requiresTwoFactor: row?.requires_two_factor === true,
      updatedAt: row?.updated_at || null
    };
  });
}

export async function setToolSecurityRequirements(requiredToolIds, updatedBy, db = { query }) {
  const required = new Set(requiredToolIds);

  for (const toolId of toolIds) {
    await db.query(
      `INSERT INTO tool_security_requirements (tool_id, requires_two_factor, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (tool_id)
       DO UPDATE SET requires_two_factor = EXCLUDED.requires_two_factor,
                     updated_by = EXCLUDED.updated_by,
                     updated_at = NOW()`,
      [toolId, required.has(toolId), updatedBy]
    );
  }
}

export async function getUserToolAccessState(user, db = { query }) {
  const grantedTools = user.role === 'admin' ? [...toolIds] : [];

  if (user.role !== 'admin') {
    const result = await db.query(
      'SELECT tool_id FROM user_tool_access WHERE user_id = $1 ORDER BY tool_id',
      [user.id]
    );
    grantedTools.push(...result.rows.map((row) => row.tool_id));
  }

  const requirements = await getToolSecurityRequirements(db);
  const twoFactorRequired = new Set(
    requirements
      .filter((requirement) => requirement.requiresTwoFactor)
      .map((requirement) => requirement.toolId)
  );
  const blockedTools = grantedTools.filter((toolId) => (
    twoFactorRequired.has(toolId) && user.twoFactorEnabled !== true
  ));

  return {
    tools: grantedTools.filter((toolId) => !blockedTools.includes(toolId)),
    grantedTools,
    blockedTools,
    requirements
  };
}

export async function getUserToolAccess(user, db = { query }) {
  const state = await getUserToolAccessState(user, db);
  return state.tools;
}

export async function getUserToolCatalog(user, db = { query }) {
  const state = await getUserToolAccessState(user, db);
  const granted = new Set(state.grantedTools);
  const blocked = new Set(state.blockedTools);

  return {
    tools: toolIds.map((toolId) => ({
      toolId,
      granted: granted.has(toolId),
      accessible: granted.has(toolId) && !blocked.has(toolId),
      blockedByTwoFactor: blocked.has(toolId),
      requiresTwoFactor: state.requirements.some((requirement) => (
        requirement.toolId === toolId && requirement.requiresTwoFactor
      ))
    })),
    twoFactorEnabled: user.twoFactorEnabled === true
  };
}

export async function grantDefaultToolAccess(userId, db = { query }) {
  for (const toolId of defaultToolIds) {
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
    const state = await getUserToolAccessState(req.user);
    if (state.blockedTools.includes(toolId)) {
      throw new AppError(403, 'TOOL_2FA_REQUIRED', 'Для цього інструмента потрібно увімкнути 2FA.');
    }
    if (!state.tools.includes(toolId)) {
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
