import { query } from '../../db/pool.js';
import { getUserToolAccess } from '../access/access.service.js';
import { loadPublication } from '../publications/publication.service.js';
import { loadTaskView } from '../tasks/task.service.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const entityLinkMatchers = [
  { type: 'task', path: '/tasks', parameter: 'task' },
  { type: 'publication', path: '/tools/blog-publications', parameter: 'publication' }
];

export function directConversationKey(firstUserId, secondUserId) {
  return [firstUserId, secondUserId].sort().join(':');
}

export function extractEntityReferences(body, allowedOrigins) {
  const references = [];
  const seen = new Set();
  const origins = new Set((Array.isArray(allowedOrigins) ? allowedOrigins : [allowedOrigins]).filter(Boolean));
  const urlPattern = /https?:\/\/[^\s<>"']+/gi;
  for (const match of body.matchAll(urlPattern)) {
    const raw = match[0].replace(/[),.;!?]+$/g, '');
    try {
      const url = new URL(raw);
      if (!origins.has(url.origin)) continue;
      const matcher = entityLinkMatchers.find((candidate) => candidate.path === url.pathname);
      const type = matcher?.type;
      const id = matcher ? url.searchParams.get(matcher.parameter) : null;
      if (!type || !id || !uuidPattern.test(id)) continue;
      const key = `${type}:${id}`;
      if (!seen.has(key)) {
        seen.add(key);
        references.push({ type, id });
      }
    } catch {
      // Invalid links remain ordinary message text.
    }
  }
  return references.slice(0, 10);
}

async function hydrateTask(reference, viewer) {
  const task = await loadTaskView(reference.id, viewer.id);
  if (!task) return { ...reference, available: false };
  return {
    ...reference,
    available: true,
    data: {
      title: task.title,
      type: task.type,
      status: task.status,
      startsAt: task.startsAt,
      dueAt: task.dueAt,
      isAllDay: task.isAllDay,
      owner: task.owner,
      description: task.description,
      participantCount: task.participants.length,
      meetingUrl: task.meetingUrl,
      isOwner: task.isOwner,
      myResponseStatus: task.myResponseStatus
    }
  };
}

async function hydratePublication(reference, viewer) {
  const access = await getUserToolAccess(viewer);
  if (!access.includes('blog_publications')) return { ...reference, available: false };
  const publication = await loadPublication(reference.id);
  if (!publication) return { ...reference, available: false };
  return {
    ...reference,
    available: true,
    data: {
      title: publication.title,
      description: publication.description,
      status: publication.status,
      publishAt: publication.publishAt,
      creator: publication.creator,
      assignee: publication.assignee,
      materials: publication.materials.slice(0, 3),
      publicationUrl: publication.publicationUrl
    }
  };
}

const entityHydrators = {
  task: hydrateTask,
  publication: hydratePublication
};

export async function hydrateEntityReferences(references, viewer) {
  return Promise.all((references || []).map((reference) => {
    const hydrate = entityHydrators[reference.type];
    return hydrate ? hydrate(reference, viewer) : { ...reference, available: false };
  }));
}

export async function serializeChatMessage(row, viewer, allowedOrigins = []) {
  const storedReferences = Array.isArray(row.entity_references) ? row.entity_references : JSON.parse(row.entity_references || '[]');
  const references = storedReferences.length ? storedReferences : extractEntityReferences(row.body, allowedOrigins);
  return {
    id: row.id,
    conversationId: row.conversation_id,
    body: row.body,
    sender: { id: row.sender_id, name: row.sender_name, email: row.sender_email },
    own: row.sender_id === viewer.id,
    entities: await hydrateEntityReferences(references, viewer),
    createdAt: row.created_at
  };
}

export async function loadConversationMembers(conversationId, db = { query }) {
  const result = await db.query(
    'SELECT user_id FROM chat_members WHERE conversation_id = $1 ORDER BY user_id',
    [conversationId]
  );
  return result.rows.map((row) => row.user_id);
}

export async function assertConversationMember(conversationId, userId, db = { query }) {
  const result = await db.query(
    'SELECT 1 FROM chat_members WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId]
  );
  return Boolean(result.rows[0]);
}
