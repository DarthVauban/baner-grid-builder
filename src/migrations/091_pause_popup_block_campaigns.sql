BEGIN;

-- The original popup editor cannot render block layouts. Preserve their documents,
-- published snapshots, contacts and history for future work, but stop their display.
UPDATE popup_banner_campaigns
SET status = 'paused', updated_at = NOW()
WHERE campaign_type = 'block' AND status = 'active';

COMMIT;
