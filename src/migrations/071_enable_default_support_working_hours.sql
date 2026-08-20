ALTER TABLE support_chat_sites
  ALTER COLUMN working_hours_enabled SET DEFAULT TRUE;

UPDATE support_chat_sites
SET working_hours_enabled = TRUE,
    updated_at = NOW()
WHERE working_hours_enabled = FALSE
  AND working_hours_schedule = '{
    "monday": {"enabled": true, "start": "09:00", "end": "18:00"},
    "tuesday": {"enabled": true, "start": "09:00", "end": "18:00"},
    "wednesday": {"enabled": true, "start": "09:00", "end": "18:00"},
    "thursday": {"enabled": true, "start": "09:00", "end": "18:00"},
    "friday": {"enabled": true, "start": "09:00", "end": "18:00"},
    "saturday": {"enabled": false, "start": "10:00", "end": "17:00"},
    "sunday": {"enabled": false, "start": "10:00", "end": "17:00"}
  }'::JSONB;
