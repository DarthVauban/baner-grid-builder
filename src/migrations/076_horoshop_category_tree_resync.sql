-- Force one scheduled refresh after switching pages/export to parent-scoped category-tree loading.
UPDATE search_horoshop_connections
SET last_sync_at = NULL,
    updated_at = NOW()
WHERE status = 'connected'
  AND last_sync_at IS NOT NULL;
