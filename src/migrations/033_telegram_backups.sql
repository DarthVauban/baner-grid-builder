CREATE TABLE backup_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  automatic_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  schedule_type VARCHAR(20) NOT NULL DEFAULT 'daily'
    CHECK (schedule_type IN ('daily', 'weekly')),
  schedule_time TIME NOT NULL DEFAULT '03:00',
  schedule_weekday SMALLINT NOT NULL DEFAULT 1
    CHECK (schedule_weekday BETWEEN 1 AND 7),
  timezone VARCHAR(80) NOT NULL DEFAULT 'Europe/Kyiv',
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO backup_settings (id)
VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE backup_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger VARCHAR(20) NOT NULL CHECK (trigger IN ('manual', 'scheduled', 'restore')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed')),
  file_name VARCHAR(255) NOT NULL DEFAULT '',
  size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  telegram_message_id BIGINT,
  error_message TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX backup_runs_started_idx ON backup_runs(started_at DESC);
