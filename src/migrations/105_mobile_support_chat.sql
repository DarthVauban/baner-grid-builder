CREATE TABLE user_support_chat_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE mobile_devices
  ADD COLUMN support_chat_contract_version INTEGER NOT NULL DEFAULT 0
    CHECK (support_chat_contract_version IN (0, 1));

-- Existing history is numbered, in its original order, under the conversation
-- row lock on first access. This avoids a blocking whole-history migration.
ALTER TABLE support_chat_conversations
  ADD COLUMN message_sequence_initialized BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN message_sequence_counter BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN operator_last_read_sequence BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN operator_last_read_message_id UUID;

ALTER TABLE support_chat_messages ADD COLUMN message_sequence BIGINT;
CREATE UNIQUE INDEX support_chat_messages_sequence_idx
  ON support_chat_messages(conversation_id, message_sequence);
CREATE INDEX support_chat_conversations_cursor_idx
  ON support_chat_conversations(updated_at DESC, id DESC);

ALTER TABLE mobile_push_outbox
  DROP CONSTRAINT IF EXISTS mobile_push_outbox_kind_check;
ALTER TABLE mobile_push_outbox DROP CONSTRAINT IF EXISTS mobile_push_outbox_constraint_1;
ALTER TABLE mobile_push_outbox ADD CONSTRAINT mobile_push_outbox_kind_check
  CHECK (kind IN ('login_request', 'workspace_notification', 'device_revoked', 'support_chat_message'));
ALTER TABLE mobile_push_outbox
  DROP CONSTRAINT IF EXISTS mobile_push_outbox_status_check;
ALTER TABLE mobile_push_outbox DROP CONSTRAINT IF EXISTS mobile_push_outbox_constraint_3;
ALTER TABLE mobile_push_outbox ADD CONSTRAINT mobile_push_outbox_status_check
  CHECK (status IN ('pending', 'processing', 'delivered', 'retry', 'failed', 'cancelled'));
ALTER TABLE mobile_push_outbox
  ADD COLUMN support_message_id UUID REFERENCES support_chat_messages(id) ON DELETE CASCADE,
  ADD COLUMN expires_at TIMESTAMPTZ;
ALTER TABLE mobile_push_outbox ADD CONSTRAINT mobile_push_outbox_support_check CHECK (
  kind <> 'support_chat_message' OR
  (support_message_id IS NOT NULL AND expires_at IS NOT NULL
    AND notification_id IS NULL AND login_request_id IS NULL)
);
CREATE UNIQUE INDEX mobile_push_outbox_support_device_idx
  ON mobile_push_outbox(device_id, support_message_id) WHERE support_message_id IS NOT NULL;
