BEGIN;

ALTER TABLE application_form_campaigns
  ADD COLUMN target_mode VARCHAR(30) NOT NULL DEFAULT 'products'
    CHECK (target_mode IN ('all_products', 'products', 'category', 'sticker')),
  ADD COLUMN category_external_id TEXT,
  ADD COLUMN sticker_external_id TEXT,
  ADD CONSTRAINT application_form_campaigns_targeting_check CHECK (
    (target_mode IN ('all_products', 'products')
      AND category_external_id IS NULL
      AND sticker_external_id IS NULL)
    OR (target_mode = 'category'
      AND category_external_id IS NOT NULL
      AND sticker_external_id IS NULL)
    OR (target_mode = 'sticker'
      AND category_external_id IS NULL
      AND sticker_external_id IS NOT NULL)
  );

CREATE INDEX application_form_campaigns_targeting_idx
  ON application_form_campaigns (
    connection_id,
    connection_generation,
    target_mode,
    category_external_id,
    sticker_external_id
  )
  WHERE status = 'active' AND archived_at IS NULL;

COMMIT;
