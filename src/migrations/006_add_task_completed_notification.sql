ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'task_invitation', 'invitation_accepted', 'invitation_declined',
    'task_updated', 'task_completed', 'task_cancelled', 'participant_removed',
    'task_reminder', 'task_overdue',
    'publication_assigned', 'publication_updated', 'publication_ready',
    'publication_published', 'publication_cancelled',
    'publication_reminder', 'publication_overdue'
  ));
