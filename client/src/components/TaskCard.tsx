import { formatTaskDate, isTaskOverdue, taskTypeLabels, taskTypeMarks } from '../lib/task';
import { getInitials } from '../lib/user';
import type { Task, TaskStatus } from '../types/task';

interface TaskCardProps {
  task: Task;
  busy?: boolean;
  onEdit: (task: Task) => void;
  onRespond: (task: Task, response: 'accepted' | 'declined') => void;
  onStatus: (task: Task, status: TaskStatus) => void;
  onReminder: (task: Task) => void;
  onDelete: (task: Task) => void;
}

const responseLabels = {
  pending: 'Очікує',
  accepted: 'Прийнято',
  declined: 'Відхилено'
};

export function TaskCard({ task, busy, onEdit, onRespond, onStatus, onReminder, onDelete }: TaskCardProps) {
  const overdue = isTaskOverdue(task);
  const pendingInvitation = !task.isOwner && task.myResponseStatus === 'pending';

  return (
    <article className={`task-card task-card--${task.type}${overdue ? ' task-card--overdue' : ''}${pendingInvitation ? ' task-card--invitation' : ''}`}>
      <div className="task-card__mark" aria-hidden="true">{taskTypeMarks[task.type]}</div>
      <div className="task-card__body">
        <div className="task-card__meta">
          <span>{taskTypeLabels[task.type]}</span>
          {pendingInvitation && <span className="task-badge task-badge--pending">Потрібна відповідь</span>}
          {task.status === 'completed' && <span className="task-badge task-badge--success">Виконано</span>}
          {task.status === 'cancelled' && <span className="task-badge">Скасовано</span>}
          {overdue && <span className="task-badge task-badge--danger">Прострочено</span>}
        </div>
        <h2>{task.title}</h2>
        {task.description && <p className="task-card__description">{task.description}</p>}

        <div className="task-card__details">
          <span className={overdue ? 'task-card__date task-card__date--overdue' : 'task-card__date'}>◷ {formatTaskDate(task)}</span>
          {task.location && <span>⌖ {task.location}</span>}
          {!task.isOwner && <span>Власник: {task.owner.name}</span>}
        </div>

        {(task.participants.length > 0 || task.meetingUrl) && (
          <div className="task-card__people-row">
            {task.participants.length > 0 && (
              <div className="task-card__participants" aria-label="Учасники">
                {task.participants.slice(0, 5).map((participant) => (
                  <span key={participant.id} className={`mini-avatar mini-avatar--${participant.responseStatus}`} title={`${participant.name}: ${responseLabels[participant.responseStatus]}`}>
                    {getInitials(participant.name)}
                  </span>
                ))}
                {task.participants.length > 5 && <span className="mini-avatar">+{task.participants.length - 5}</span>}
              </div>
            )}
            {task.meetingUrl && (
              <a className="task-card__join" href={task.meetingUrl} target="_blank" rel="noreferrer">Приєднатися ↗</a>
            )}
          </div>
        )}

        <footer className="task-card__actions">
          {pendingInvitation ? (
            <>
              <button className="button button--primary button--small" type="button" disabled={busy} onClick={() => onRespond(task, 'accepted')}>Прийняти</button>
              <button className="button button--secondary button--small" type="button" disabled={busy} onClick={() => onRespond(task, 'declined')}>Відхилити</button>
            </>
          ) : (
            <>
              {task.status === 'active' && <button className="task-action" type="button" disabled={busy} onClick={() => onReminder(task)}>⏰ Нагадування</button>}
              {task.isOwner && task.status === 'active' && <button className="task-action" type="button" disabled={busy} onClick={() => onEdit(task)}>Редагувати</button>}
              {task.isOwner && task.status === 'active' && <button className="task-action task-action--success" type="button" disabled={busy} onClick={() => onStatus(task, 'completed')}>Виконано</button>}
              {task.isOwner && task.status === 'active' && task.participants.length > 0 && <button className="task-action task-action--danger" type="button" disabled={busy} onClick={() => onStatus(task, 'cancelled')}>Скасувати</button>}
              {task.isOwner && task.participants.length === 0 && <button className="task-action task-action--danger" type="button" disabled={busy} onClick={() => onDelete(task)}>Видалити</button>}
            </>
          )}
        </footer>
      </div>
    </article>
  );
}
