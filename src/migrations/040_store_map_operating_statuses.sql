ALTER TABLE store_map_points
  DROP CONSTRAINT IF EXISTS store_map_points_open_status_override_check;

-- pg-mem assigns a generated name to inline CHECK constraints. Keeping this
-- fallback makes local/test databases follow the same status contract as PostgreSQL.
ALTER TABLE store_map_points
  DROP CONSTRAINT IF EXISTS store_map_points_constraint_3;

UPDATE store_map_points
SET open_status_override = 'AUTO'
WHERE open_status_override = 'OPEN';

ALTER TABLE store_map_points
  ADD CONSTRAINT store_map_points_open_status_override_check
  CHECK (open_status_override IN ('AUTO', 'TEMPORARILY_CLOSED', 'CLOSED'));
