ALTER TABLE chat_conversations
  ALTER COLUMN direct_key DROP NOT NULL;

ALTER TABLE chat_conversations
  ADD COLUMN conversation_type VARCHAR(16) NOT NULL DEFAULT 'direct'
    CHECK (conversation_type IN ('direct', 'group')),
  ADD COLUMN title VARCHAR(120),
  ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE chat_message_reactions (
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX chat_message_reactions_message_idx
  ON chat_message_reactions(message_id, created_at);
