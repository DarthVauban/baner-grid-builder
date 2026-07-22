ALTER TABLE application_form_fields
  ADD COLUMN IF NOT EXISTS show_in_summary BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE application_form_fields
SET show_in_summary = TRUE
WHERE system_field_type IS NOT NULL;

ALTER TABLE application_values
  ADD COLUMN IF NOT EXISTS show_in_summary_snapshot BOOLEAN NOT NULL DEFAULT FALSE;
