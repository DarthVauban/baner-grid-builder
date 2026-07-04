ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'task_invitation', 'invitation_accepted', 'invitation_declined',
    'task_updated', 'task_completed', 'task_cancelled', 'participant_removed',
    'task_reminder', 'task_overdue'
  ));
