ALTER TABLE support_chat_visitors
  ADD COLUMN IF NOT EXISTS name VARCHAR(160);
