ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

UPDATE applications
SET assigned_to = last_changed_by,
    assigned_at = COALESCE(assigned_at, updated_at)
WHERE assigned_to IS NULL
  AND last_changed_by IS NOT NULL
  AND status IN ('in_progress', 'rejected', 'closed');

CREATE INDEX IF NOT EXISTS applications_assignment_status_idx
  ON applications(assigned_to, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS applications_unassigned_status_idx
  ON applications(status, updated_at DESC)
  WHERE assigned_to IS NULL;
