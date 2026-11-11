BEGIN;

-- Keep the reviewed snapshot intact when the catalog did not expose feed data.
-- Persist the complete remote state before the worker sends its first import.
ALTER TABLE search_horoshop_feed_operation_items ADD COLUMN resolved_before JSONB;
ALTER TABLE search_horoshop_feed_operation_items ADD COLUMN resolved_target JSONB;

COMMIT;
