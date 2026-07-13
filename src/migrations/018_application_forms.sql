ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN (
    'admin', 'editor', 'content_manager', 'manager'
  ));

ALTER TABLE user_tool_access
  DROP CONSTRAINT IF EXISTS user_tool_access_tool_id_check;

ALTER TABLE user_tool_access
  DROP CONSTRAINT IF EXISTS user_tool_access_constraint_1;

ALTER TABLE user_tool_access
  ADD CONSTRAINT user_tool_access_tool_id_check CHECK (tool_id IN (
    'banner_grid', 'product_selection', 'product_tables', 'blog_publications',
    'chat', 'applications', 'form_builder'
  ));

ALTER TABLE tool_security_requirements
  DROP CONSTRAINT IF EXISTS tool_security_requirements_tool_id_check;

ALTER TABLE tool_security_requirements
  DROP CONSTRAINT IF EXISTS tool_security_requirements_constraint_1;

ALTER TABLE tool_security_requirements
  ADD CONSTRAINT tool_security_requirements_tool_id_check CHECK (tool_id IN (
    'banner_grid', 'product_selection', 'product_tables', 'blog_publications',
    'chat', 'applications', 'form_builder'
  ));

INSERT INTO tool_security_requirements (tool_id, requires_two_factor)
VALUES
  ('applications', FALSE),
  ('form_builder', FALSE)
ON CONFLICT (tool_id) DO NOTHING;

CREATE TABLE application_banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(160) NOT NULL,
  value VARCHAR(120) NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX application_banks_active_order_idx
  ON application_banks(active, sort_order, lower(label));

CREATE TABLE application_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(160) NOT NULL,
  title VARCHAR(220) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  button_text VARCHAR(120) NOT NULL DEFAULT 'Залишити заявку',
  success_message VARCHAR(240) NOT NULL DEFAULT 'Заявку надіслано. Менеджер звʼяжеться з вами.',
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'published', 'disabled', 'archived'
  )),
  settings JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(settings) = 'object'),
  styles JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(styles) = 'object'),
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX application_forms_status_updated_idx
  ON application_forms(status, updated_at DESC);

CREATE TABLE application_form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES application_forms(id) ON DELETE CASCADE,
  key VARCHAR(80) NOT NULL,
  label VARCHAR(160) NOT NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN (
    'text', 'textarea', 'select', 'radio', 'checkbox', 'email', 'phone', 'number'
  )),
  placeholder VARCHAR(180) NOT NULL DEFAULT '',
  help_text VARCHAR(240) NOT NULL DEFAULT '',
  default_value TEXT NOT NULL DEFAULT '',
  required BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  system BOOLEAN NOT NULL DEFAULT FALSE,
  system_field_type VARCHAR(30),
  sort_order INTEGER NOT NULL DEFAULT 0,
  validation JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(validation) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (form_id, key)
);

CREATE INDEX application_form_fields_form_order_idx
  ON application_form_fields(form_id, sort_order);

CREATE TABLE application_form_field_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES application_form_fields(id) ON DELETE CASCADE,
  label VARCHAR(160) NOT NULL,
  value VARCHAR(120) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (field_id, value)
);

CREATE INDEX application_form_field_options_order_idx
  ON application_form_field_options(field_id, sort_order);

CREATE TABLE application_number_sequence (
  scope VARCHAR(30) PRIMARY KEY,
  next_number INTEGER NOT NULL CHECK (next_number BETWEEN 1 AND 100000)
);

INSERT INTO application_number_sequence (scope, next_number)
VALUES ('default', 1)
ON CONFLICT (scope) DO NOTHING;

CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_number VARCHAR(5) NOT NULL UNIQUE,
  form_id UUID REFERENCES application_forms(id) ON DELETE SET NULL,
  form_public_id UUID NOT NULL,
  form_name_snapshot VARCHAR(160) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN (
    'new', 'in_progress', 'rejected', 'closed'
  )),
  source_url VARCHAR(4000) NOT NULL DEFAULT '',
  canonical_url VARCHAR(4000) NOT NULL DEFAULT '',
  page_title VARCHAR(500) NOT NULL DEFAULT '',
  referrer VARCHAR(4000) NOT NULL DEFAULT '',
  utm JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(utm) = 'object'),
  user_agent VARCHAR(500) NOT NULL DEFAULT '',
  source VARCHAR(80) NOT NULL DEFAULT 'public_form',
  idempotency_key VARCHAR(160),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  last_changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX applications_form_idempotency_idx
  ON applications(form_public_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE INDEX applications_status_updated_idx
  ON applications(status, updated_at DESC);

CREATE INDEX applications_created_idx
  ON applications(created_at DESC);

CREATE TABLE application_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  field_id UUID REFERENCES application_form_fields(id) ON DELETE SET NULL,
  field_key_snapshot VARCHAR(80) NOT NULL,
  field_label_snapshot VARCHAR(160) NOT NULL,
  field_type_snapshot VARCHAR(30) NOT NULL,
  system_field_type VARCHAR(30),
  value TEXT NOT NULL DEFAULT '',
  option_label_snapshot VARCHAR(160) NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX application_values_application_order_idx
  ON application_values(application_id, sort_order);

CREATE TABLE application_product_snapshots (
  application_id UUID PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL DEFAULT '',
  url VARCHAR(4000) NOT NULL DEFAULT '',
  image_url VARCHAR(4000) NOT NULL DEFAULT '',
  price VARCHAR(120) NOT NULL DEFAULT '',
  old_price VARCHAR(120) NOT NULL DEFAULT '',
  currency VARCHAR(20) NOT NULL DEFAULT '',
  sku VARCHAR(160) NOT NULL DEFAULT '',
  product_code VARCHAR(160) NOT NULL DEFAULT '',
  availability VARCHAR(160) NOT NULL DEFAULT '',
  external_product_id VARCHAR(180) NOT NULL DEFAULT '',
  domain VARCHAR(255) NOT NULL DEFAULT '',
  raw_safe_data JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(raw_safe_data) = 'object'),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE application_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  previous_status VARCHAR(20),
  new_status VARCHAR(20) NOT NULL CHECK (new_status IN (
    'new', 'in_progress', 'rejected', 'closed'
  )),
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX application_status_history_application_idx
  ON application_status_history(application_id, created_at DESC);

CREATE TABLE application_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX application_comments_application_idx
  ON application_comments(application_id, created_at);

CREATE TABLE application_button_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  form_id UUID NOT NULL REFERENCES application_forms(id) ON DELETE CASCADE,
  selector VARCHAR(500) NOT NULL,
  insert_position VARCHAR(30) NOT NULL DEFAULT 'after' CHECK (insert_position IN (
    'start', 'end', 'before', 'after'
  )),
  text VARCHAR(120) NOT NULL DEFAULT 'Залишити заявку',
  styles JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(styles) = 'object'),
  css_class VARCHAR(120) NOT NULL DEFAULT '',
  full_width BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  product_selectors JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(product_selectors) = 'object'),
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX application_button_configurations_form_idx
  ON application_button_configurations(form_id, updated_at DESC);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS application_id UUID REFERENCES applications(id) ON DELETE CASCADE;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_constraint_1;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'task_invitation', 'invitation_accepted', 'invitation_declined',
    'task_updated', 'task_completed', 'task_cancelled', 'participant_removed',
    'task_reminder', 'task_overdue',
    'publication_assigned', 'publication_updated', 'publication_ready',
    'publication_published', 'publication_cancelled',
    'publication_reminder', 'publication_overdue',
    'application_created', 'application_status_changed', 'application_comment_added'
  ));
