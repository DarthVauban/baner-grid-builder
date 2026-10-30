-- A logout tombstone survives until the signed parent JWT expires. Only hashes
-- are stored; no workspace JWT, authorization code, or Search bearer token.
CREATE TABLE smart_search_sso_sessions (
  session_hash TEXT PRIMARY KEY CHECK (session_hash ~ '^[a-f0-9]{64}$'),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  UNIQUE (session_hash, user_id)
);

CREATE TABLE smart_search_sso_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT NOT NULL UNIQUE CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  client_id TEXT NOT NULL CHECK (client_id ~ '^[A-Za-z0-9_-]{3,100}$'),
  parent_session_hash TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL CHECK (length(redirect_uri) BETWEEN 1 AND 2048),
  code_challenge TEXT NOT NULL CHECK (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  scope TEXT NOT NULL DEFAULT 'smart-search:admin' CHECK (scope = 'smart-search:admin'),
  audience TEXT NOT NULL DEFAULT 'smart-search-admin' CHECK (audience = 'smart-search-admin'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  FOREIGN KEY (parent_session_hash, user_id)
    REFERENCES smart_search_sso_sessions(session_hash, user_id) ON DELETE NO ACTION,
  CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '60 seconds')
);

CREATE TABLE smart_search_sso_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  client_id TEXT NOT NULL CHECK (client_id ~ '^[A-Za-z0-9_-]{3,100}$'),
  parent_session_hash TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'smart-search:admin' CHECK (scope = 'smart-search:admin'),
  audience TEXT NOT NULL DEFAULT 'smart-search-admin' CHECK (audience = 'smart-search-admin'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  FOREIGN KEY (parent_session_hash, user_id)
    REFERENCES smart_search_sso_sessions(session_hash, user_id) ON DELETE NO ACTION,
  CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '8 hours')
);

-- This audit follows the existing action/actor/internal-ID convention. It
-- deliberately has no free-form payload in which credentials could be logged.
CREATE TABLE smart_search_sso_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('authorize', 'exchange', 'revoke', 'parent_logout')),
  entity_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX smart_search_sso_sessions_expiry_idx ON smart_search_sso_sessions(expires_at);
CREATE INDEX smart_search_sso_sessions_user_idx ON smart_search_sso_sessions(user_id);
CREATE INDEX smart_search_sso_codes_client_expiry_idx ON smart_search_sso_codes(client_id, expires_at);
CREATE INDEX smart_search_sso_codes_parent_idx ON smart_search_sso_codes(parent_session_hash);
CREATE INDEX smart_search_sso_codes_expiry_idx ON smart_search_sso_codes(expires_at);
CREATE INDEX smart_search_sso_tokens_client_expiry_idx ON smart_search_sso_tokens(client_id, expires_at);
CREATE INDEX smart_search_sso_tokens_parent_idx ON smart_search_sso_tokens(parent_session_hash);
CREATE INDEX smart_search_sso_tokens_expiry_idx ON smart_search_sso_tokens(expires_at);
CREATE INDEX smart_search_sso_audit_created_idx ON smart_search_sso_audit_log(created_at);
