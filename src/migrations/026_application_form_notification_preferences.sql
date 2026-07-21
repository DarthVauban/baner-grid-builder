CREATE TABLE user_application_form_notification_preferences (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES application_forms(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, form_id)
);

CREATE INDEX user_application_form_notification_preferences_form_idx
  ON user_application_form_notification_preferences(form_id, enabled);
