ALTER TABLE support_chat_events
  DROP CONSTRAINT IF EXISTS support_chat_events_event_type_check;

ALTER TABLE support_chat_events
  ADD CONSTRAINT support_chat_events_event_type_check CHECK (event_type IN (
    'CREATED', 'ASSIGNED', 'STATUS_CHANGED', 'CONTACT_UPDATED'
  ));
