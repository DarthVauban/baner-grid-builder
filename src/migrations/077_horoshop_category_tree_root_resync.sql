-- Force one scheduled refresh after supporting catalog roots with non-exported technical parents.
UPDATE search_horoshop_connections
SET last_sync_at = NULL,
    updated_at = NOW()
WHERE status = 'connected'
  AND last_sync_at IS NOT NULL;
