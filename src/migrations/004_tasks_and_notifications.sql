CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL DEFAULT 'general' CHECK (type IN (
    'general', 'reminder', 'deadline', 'offline_meeting', 'online_meeting',
    'call', 'event', 'publication', 'other'
  )),
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
  starts_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ NOT NULL,
  location VARCHAR(500) NOT NULL DEFAULT '',
  meeting_url VARCHAR(4000) NOT NULL DEFAULT '',
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (starts_at IS NULL OR due_at >= starts_at)
);

CREATE INDEX tasks_owner_due_idx ON tasks(owner_id, due_at);
CREATE INDEX tasks_status_due_idx ON tasks(status, due_at);

CREATE TABLE task_participants (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (response_status IN ('pending', 'accepted', 'declined')),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX task_participants_user_status_idx ON task_participants(user_id, response_status);

CREATE TABLE task_reminder_settings (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  remind_before_minutes INTEGER NOT NULL DEFAULT 30 CHECK (remind_before_minutes BETWEEN 5 AND 43200),
  repeat_interval_minutes INTEGER CHECK (repeat_interval_minutes IS NULL OR repeat_interval_minutes BETWEEN 5 AND 10080),
  next_reminder_at TIMESTAMPTZ,
  last_reminded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX task_reminder_due_idx ON task_reminder_settings(next_reminder_at)
  WHERE enabled = TRUE AND next_reminder_at IS NOT NULL;

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  type VARCHAR(40) NOT NULL CHECK (type IN (
    'task_invitation', 'invitation_accepted', 'invitation_declined',
    'task_updated', 'task_completed', 'task_cancelled', 'participant_removed',
    'task_reminder', 'task_overdue'
  )),
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX notifications_user_created_idx ON notifications(user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;
