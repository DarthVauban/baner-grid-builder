ALTER TABLE support_chat_sites
  ADD COLUMN IF NOT EXISTS working_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS working_hours_timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Kyiv',
  ADD COLUMN IF NOT EXISTS working_hours_schedule JSONB NOT NULL DEFAULT '{
    "monday": {"enabled": true, "start": "09:00", "end": "18:00"},
    "tuesday": {"enabled": true, "start": "09:00", "end": "18:00"},
    "wednesday": {"enabled": true, "start": "09:00", "end": "18:00"},
    "thursday": {"enabled": true, "start": "09:00", "end": "18:00"},
    "friday": {"enabled": true, "start": "09:00", "end": "18:00"},
    "saturday": {"enabled": false, "start": "10:00", "end": "17:00"},
    "sunday": {"enabled": false, "start": "10:00", "end": "17:00"}
  }'::JSONB,
  ADD COLUMN IF NOT EXISTS offline_reply_text VARCHAR(1000) NOT NULL DEFAULT 'Дякуємо! Зараз ми не працюємо. Менеджер відповість у робочий час. Щоб ми могли обов’язково зв’язатися з вами, залиште, будь ласка, ваше ім’я та номер телефону у формі нижче.';

ALTER TABLE support_chat_sites
  DROP CONSTRAINT IF EXISTS support_chat_sites_working_hours_schedule_object;

ALTER TABLE support_chat_sites
  ADD CONSTRAINT support_chat_sites_working_hours_schedule_object
  CHECK (jsonb_typeof(working_hours_schedule) = 'object');

ALTER TABLE support_chat_conversations
  ADD COLUMN IF NOT EXISTS last_offline_reply_at TIMESTAMPTZ;
