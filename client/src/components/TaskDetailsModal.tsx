import { useEffect } from 'react';
import { formatTaskDateValue, isTaskOverdue, taskTypeLabels } from '../lib/task';
import { getInitials } from '../lib/user';
import type { ParticipantResponse, Task } from '../types/task';
import { Icon } from './Icon';

interface TaskDetailsModalProps {
  task: Task;
  busy?: boolean;
  onClose: () => void;
  onShare: (task: Task) => void;
  onRespond: (task: Task, response: 'accepted' | 'declined') => void;
}

const responseLabels: Record<ParticipantResponse, string> = {
  pending: 'Очікує відповіді',
  accepted: 'Прийнято',
  declined: 'Відхилено'
};

function formatMinutes(value: number): string {
  if (value % 1440 === 0) return `${value / 1440} дн.`;
  if (value % 60 === 0) return `${value / 60} год.`;
  return `${value} хв.`;
}

export function TaskDetailsModal({ task, busy, onClose, onShare, onRespond }: TaskDetailsModalProps) {
  const overdue = isTaskOverdue(task);
  const pendingInvitation = !task.isOwner && task.myResponseStatus === 'pending';

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal task-details-modal" role="dialog" aria-modal="true" aria-labelledby="task-details-title">
        <header className="modal__header">
          <div>
            <p className="eyebrow">{taskTypeLabels[task.type]}</p>
            <h2 id="task-details-title">{task.title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={20} /></button>
        </header>

        <div className="task-details-modal__content">
          <div className="task-details-modal__badges">
            {task.status === 'active' && !overdue && <span className="task-badge task-badge--success">Активна</span>}
            {task.status === 'completed' && <span className="task-badge task-badge--success">Виконано</span>}
            {task.status === 'cancelled' && <span className="task-badge">Скасовано</span>}
            {overdue && <span className="task-badge task-badge--danger">Прострочено</span>}
            {task.isAllDay && <span className="task-badge">Увесь день</span>}
          </div>

          <section className="task-details-section">
            <h3>Опис</h3>
            <p className={task.description ? '' : 'task-details-section__muted'}>{task.description || 'Опис не додано.'}</p>
          </section>

          <section className="task-details-grid">
            <div><Icon name="schedule" size={18} /><span><small>Початок</small><strong>{task.startsAt ? formatTaskDateValue(task.startsAt, task.isAllDay) : 'Не вказано'}</strong></span></div>
            <div className={overdue ? 'task-details-grid__overdue' : ''}><Icon name="deadline" size={18} /><span><small>Завершення</small><strong>{formatTaskDateValue(task.dueAt, task.isAllDay)}</strong></span></div>
            <div><Icon name="users" size={18} /><span><small>Власник</small><strong>{task.owner.name}</strong></span></div>
            {task.location && <div><Icon name="location" size={18} /><span><small>Місце</small><strong>{task.location}</strong></span></div>}
          </section>

          {task.meetingUrl && <a className="task-details-modal__meeting" href={task.meetingUrl} target="_blank" rel="noreferrer"><Icon name="onlineMeeting" size={19} /> Приєднатися до онлайн-зустрічі <Icon name="openInNew" size={16} /></a>}

          <section className="task-details-section">
            <h3>Учасники <span>{task.participants.length}</span></h3>
            {task.participants.length ? (
              <div className="task-details-participants">
                {task.participants.map((participant) => (
                  <article key={participant.id}>
                    <span className={`mini-avatar mini-avatar--${participant.responseStatus}`}>{getInitials(participant.name)}</span>
                    <span><strong>{participant.name}</strong><small>{participant.email}</small></span>
                    <span className={`task-badge task-badge--${participant.responseStatus === 'accepted' ? 'success' : participant.responseStatus === 'declined' ? 'danger' : 'pending'}`}>{responseLabels[participant.responseStatus]}</span>
                  </article>
                ))}
              </div>
            ) : <p className="task-details-section__muted">До справи нікого не залучено.</p>}
          </section>

          <section className="task-details-section">
            <h3>Нагадування</h3>
            <p>{task.reminder?.enabled
              ? `За ${formatMinutes(task.reminder.remindBeforeMinutes)} до завершення${task.reminder.repeatIntervalMinutes ? `, повтор кожні ${formatMinutes(task.reminder.repeatIntervalMinutes)}` : ''}.`
              : 'Нагадування вимкнено.'}</p>
          </section>
        </div>

        <footer className="task-details-modal__footer">
          {pendingInvitation && <><button className="button button--primary" type="button" disabled={busy} onClick={() => onRespond(task, 'accepted')}><Icon name="check" size={17} /> Прийняти</button><button className="button button--danger" type="button" disabled={busy} onClick={() => onRespond(task, 'declined')}><Icon name="close" size={17} /> Відхилити</button></>}
          <button className="button button--secondary" type="button" onClick={() => onShare(task)}><Icon name="share" size={17} /> Поділитися</button>
          <button className="button button--secondary" type="button" onClick={onClose}>Закрити</button>
        </footer>
      </section>
    </div>
  );
}
