-- A draft may be queued only once at a time. Older deployments could create
-- duplicate desktop runs when automatic queue materialization and the manual
-- "send to parser" action happened concurrently.
UPDATE search_horoshop_photo_runs
SET status = 'failed',
    error_message = 'Дубльоване завдання черги скасовано.',
    error_details = '[{"stage":"queue","message":"Дубльоване завдання черги скасовано."}]'::JSONB,
    lease_expires_at = NULL,
    completed_at = NOW()
WHERE id IN (
  SELECT redundant.id
  FROM search_horoshop_photo_runs AS redundant
  INNER JOIN search_horoshop_photo_runs AS keeper
    ON keeper.draft_id = redundant.draft_id
   AND keeper.id <> redundant.id
  WHERE redundant.status IN ('queued', 'running')
    AND keeper.status IN ('queued', 'running')
    AND (
      (keeper.status = 'running' AND redundant.status = 'queued')
      OR (
        keeper.status = redundant.status
        AND (
          keeper.created_at < redundant.created_at
          OR (keeper.created_at = redundant.created_at AND keeper.id::TEXT < redundant.id::TEXT)
        )
      )
    )
);

CREATE UNIQUE INDEX search_horoshop_photo_runs_active_draft_idx
  ON search_horoshop_photo_runs (draft_id)
  WHERE status IN ('queued', 'running');
