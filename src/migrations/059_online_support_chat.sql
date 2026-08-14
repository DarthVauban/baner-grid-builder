ALTER TABLE user_tool_access
  DROP CONSTRAINT IF EXISTS user_tool_access_tool_id_check;

ALTER TABLE user_tool_access
  DROP CONSTRAINT IF EXISTS user_tool_access_constraint_1;

ALTER TABLE user_tool_access
  ADD CONSTRAINT user_tool_access_tool_id_check CHECK (tool_id IN (
    'banner_grid', 'product_selection', 'product_tables', 'blog_publications',
    'chat', 'applications', 'form_builder', 'used_smartphones_catalog', 'trade_in',
    'store_map', 'facebook_group_publications', 'horoshop_related_products',
    'online_support'
  ));

ALTER TABLE tool_security_requirements
  DROP CONSTRAINT IF EXISTS tool_security_requirements_tool_id_check;

ALTER TABLE tool_security_requirements
  DROP CONSTRAINT IF EXISTS tool_security_requirements_constraint_1;

ALTER TABLE tool_security_requirements
  ADD CONSTRAINT tool_security_requirements_tool_id_check CHECK (tool_id IN (
    'banner_grid', 'product_selection', 'product_tables', 'blog_publications',
    'chat', 'applications', 'form_builder', 'used_smartphones_catalog', 'trade_in',
    'store_map', 'facebook_group_publications', 'horoshop_related_products',
    'online_support'
  ));

INSERT INTO tool_security_requirements (tool_id, requires_two_factor)
VALUES ('online_support', FALSE)
ON CONFLICT (tool_id) DO NOTHING;

CREATE TABLE support_chat_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL DEFAULT 'Mobile Trend',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  allowed_origins JSONB NOT NULL DEFAULT '[]'::JSONB,
  accent_color VARCHAR(16) NOT NULL DEFAULT '#ffe000',
  welcome_text VARCHAR(500) NOT NULL DEFAULT 'Напишіть нам — оператор відповість якнайшвидше.',
  auto_reply_text VARCHAR(1000) NOT NULL DEFAULT 'Дякуємо! Ми отримали ваше повідомлення. Будь ласка, зачекайте — оператор долучиться якнайшвидше.',
  contact_form_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  contact_form_prompt VARCHAR(500) NOT NULL DEFAULT 'За бажанням залиште email або телефон, щоб ми могли зв’язатися з вами, якщо сторінку буде закрито.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT support_chat_sites_allowed_origins_array CHECK (jsonb_typeof(allowed_origins) = 'array')
);

INSERT INTO support_chat_sites (name)
SELECT 'Mobile Trend'
WHERE NOT EXISTS (SELECT 1 FROM support_chat_sites);

CREATE TABLE support_chat_visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES support_chat_sites(id) ON DELETE CASCADE,
  session_token_hash CHAR(64) NOT NULL UNIQUE,
  email VARCHAR(320),
  phone VARCHAR(40),
  first_page_url VARCHAR(4000) NOT NULL DEFAULT '',
  last_page_url VARCHAR(4000) NOT NULL DEFAULT '',
  last_page_title VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX support_chat_visitors_site_seen_idx
  ON support_chat_visitors(site_id, last_seen_at DESC);

CREATE TABLE support_chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES support_chat_sites(id) ON DELETE CASCADE,
  visitor_id UUID NOT NULL REFERENCES support_chat_visitors(id) ON DELETE CASCADE,
  status VARCHAR(24) NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW', 'OPEN', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED')),
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  auto_reply_sent_at TIMESTAMPTZ,
  first_response_at TIMESTAMPTZ,
  operator_last_read_at TIMESTAMPTZ,
  visitor_last_read_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, visitor_id)
);

CREATE INDEX support_chat_conversations_queue_idx
  ON support_chat_conversations(status, updated_at DESC);

CREATE INDEX support_chat_conversations_assignee_idx
  ON support_chat_conversations(assigned_user_id, updated_at DESC);

CREATE TABLE support_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES support_chat_conversations(id) ON DELETE CASCADE,
  sender_type VARCHAR(16) NOT NULL CHECK (sender_type IN ('visitor', 'operator', 'system')),
  sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  client_message_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, client_message_id),
  CONSTRAINT support_chat_message_sender_check CHECK (
    (sender_type = 'operator' AND sender_user_id IS NOT NULL)
    OR (sender_type IN ('visitor', 'system') AND sender_user_id IS NULL)
  )
);

CREATE INDEX support_chat_messages_conversation_idx
  ON support_chat_messages(conversation_id, created_at, id);

CREATE TABLE support_chat_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES support_chat_conversations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('CREATED', 'ASSIGNED', 'STATUS_CHANGED', 'CONTACT_UPDATED')),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX support_chat_events_conversation_idx
  ON support_chat_events(conversation_id, created_at DESC);
