ALTER TABLE application_forms
  ADD COLUMN IF NOT EXISTS form_type VARCHAR(20) NOT NULL DEFAULT 'simple';

ALTER TABLE application_forms
  DROP CONSTRAINT IF EXISTS application_forms_form_type_check;

ALTER TABLE application_forms
  ADD CONSTRAINT application_forms_form_type_check
  CHECK (form_type IN ('simple', 'workflow'));

ALTER TABLE application_forms
  ADD COLUMN IF NOT EXISTS workflow_definition JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE application_forms
  DROP CONSTRAINT IF EXISTS application_forms_workflow_definition_check;

ALTER TABLE application_forms
  ADD CONSTRAINT application_forms_workflow_definition_check
  CHECK (jsonb_typeof(workflow_definition) = 'object');

CREATE INDEX IF NOT EXISTS application_forms_type_status_updated_idx
  ON application_forms(form_type, status, updated_at DESC);

ALTER TABLE application_values
  ADD COLUMN IF NOT EXISTS step_id_snapshot VARCHAR(120),
  ADD COLUMN IF NOT EXISTS step_title_snapshot VARCHAR(220),
  ADD COLUMN IF NOT EXISTS step_description_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS step_sort_order_snapshot INTEGER;
