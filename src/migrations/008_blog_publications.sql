ALTER TABLE user_tool_access
  DROP CONSTRAINT IF EXISTS user_tool_access_tool_id_check;

ALTER TABLE user_tool_access
  ADD CONSTRAINT user_tool_access_tool_id_check CHECK (tool_id IN (
    'banner_grid', 'product_selection', 'product_tables', 'blog_publications'
  ));

INSERT INTO user_tool_access (user_id, tool_id)
SELECT id, 'blog_publications' FROM users
ON CONFLICT (user_id, tool_id) DO NOTHING;

CREATE TABLE blog_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assignee_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (status IN (
    'planned', 'ready', 'published', 'cancelled'
  )),
  publish_at TIMESTAMPTZ NOT NULL,
  publication_url VARCHAR(4000) NOT NULL DEFAULT '',
  reminder_sent_at TIMESTAMPTZ,
  overdue_notified_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX blog_publications_publish_idx ON blog_publications(status, publish_at);
CREATE INDEX blog_publications_assignee_idx ON blog_publications(assignee_id, status, publish_at);

CREATE TABLE blog_publication_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID NOT NULL REFERENCES blog_publications(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN (
    'google_doc', 'drive_folder', 'drive_file', 'image', 'link'
  )),
  label VARCHAR(160) NOT NULL,
  url VARCHAR(4000) NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX blog_publication_materials_publication_idx
  ON blog_publication_materials(publication_id, position);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS publication_id UUID REFERENCES blog_publications(id) ON DELETE CASCADE;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'task_invitation', 'invitation_accepted', 'invitation_declined',
    'task_updated', 'task_completed', 'task_cancelled', 'participant_removed',
    'task_reminder', 'task_overdue',
    'publication_assigned', 'publication_updated', 'publication_ready',
    'publication_published', 'publication_cancelled',
    'publication_reminder', 'publication_overdue'
  ));
