ALTER TABLE support_chat_visitors
  ADD COLUMN session_transport VARCHAR(8) NOT NULL DEFAULT 'legacy',
  ADD COLUMN session_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  ADD COLUMN session_revoked_at TIMESTAMPTZ,
  ADD COLUMN session_revoked_by UUID REFERENCES users(id) ON DELETE SET NULL;
