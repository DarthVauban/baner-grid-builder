import { pool } from '../../db/pool.js';

export function serializeMaterial(row) {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    url: row.url
  };
}

export function serializePublication(row, materials = []) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    publishAt: row.publish_at,
    publicationUrl: row.publication_url,
    creator: { id: row.creator_id, name: row.creator_name, email: row.creator_email },
    assignee: { id: row.assignee_id, name: row.assignee_name, email: row.assignee_email },
    materials,
    publishedAt: row.published_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function loadPublication(id, db = pool) {
  const result = await db.query(
    `SELECT publication.*,
            creator.name AS creator_name, creator.email AS creator_email,
            assignee.name AS assignee_name, assignee.email AS assignee_email
     FROM blog_publications AS publication
     JOIN users AS creator ON creator.id = publication.creator_id
     JOIN users AS assignee ON assignee.id = publication.assignee_id
     WHERE publication.id = $1`,
    [id]
  );
  if (!result.rows[0]) return null;
  const materials = await db.query(
    `SELECT id, type, label, url
     FROM blog_publication_materials
     WHERE publication_id = $1
     ORDER BY position, created_at`,
    [id]
  );
  return serializePublication(result.rows[0], materials.rows.map(serializeMaterial));
}

export async function assertApprovedAssignees(db, ids) {
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) return false;
  const placeholders = uniqueIds.map((_, index) => `$${index + 1}`).join(', ');
  const result = await db.query(
    `SELECT id FROM users WHERE status = 'approved' AND id IN (${placeholders})`,
    uniqueIds
  );
  return result.rows.length === uniqueIds.length;
}

export async function replaceMaterials(db, publicationId, materials) {
  await db.query('DELETE FROM blog_publication_materials WHERE publication_id = $1', [publicationId]);
  for (const [position, material] of materials.entries()) {
    await db.query(
      `INSERT INTO blog_publication_materials (publication_id, type, label, url, position)
       VALUES ($1, $2, $3, $4, $5)`,
      [publicationId, material.type, material.label, material.url, position]
    );
  }
}
