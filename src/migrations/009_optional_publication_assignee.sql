ALTER TABLE blog_publications
  ALTER COLUMN assignee_id DROP NOT NULL;

ALTER TABLE blog_publications
  DROP CONSTRAINT IF EXISTS blog_publications_assignee_id_fkey;

ALTER TABLE blog_publications
  ADD CONSTRAINT blog_publications_assignee_id_fkey
  FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL;
