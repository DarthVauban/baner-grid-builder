ALTER TABLE chat_members
  ADD COLUMN member_role VARCHAR(16) NOT NULL DEFAULT 'member'
    CHECK (member_role IN ('owner', 'admin', 'member'));

UPDATE chat_members
SET member_role = 'owner'
FROM chat_conversations
WHERE chat_conversations.id = chat_members.conversation_id
  AND chat_conversations.conversation_type = 'group'
  AND chat_conversations.created_by = chat_members.user_id;

ALTER TABLE chat_conversations
  ADD COLUMN icon_data BYTEA,
  ADD COLUMN icon_mime VARCHAR(64);
