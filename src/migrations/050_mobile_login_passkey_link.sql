ALTER TABLE user_passkey_challenges
  ADD COLUMN IF NOT EXISTS mobile_login_request_id UUID
    REFERENCES mobile_login_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS user_passkey_challenges_mobile_login_idx
  ON user_passkey_challenges(mobile_login_request_id)
  WHERE mobile_login_request_id IS NOT NULL;
