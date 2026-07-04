import { formatTaskDateValue, isTaskOverdue, taskTypeLabels } from '../lib/task';
import { getInitials } from '../lib/user';
import type { Task, TaskStatus, TaskType } from '../types/task';
import { Icon } from './Icon';
import type { IconName } from './Icon';

interface TaskCardProps {
  task: Task;
  viewMode: 'list' | 'grid';
  busy?: boolean;
  onOpen: (task: Task) => void;
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

const taskTypeIcons: Record<TaskType, IconName> = {
  general: 'check',
  reminder: 'alarm',
  deadline: 'deadline',
  offline_meeting: 'offlineMeeting',
  online_meeting: 'onlineMeeting',
  call: 'phone',
  event: 'calendar',
  publication: 'publication',
  other: 'other'
};

export function TaskCard({ task, viewMode, busy, onOpen, onEdit, onRespond, onStatus, onReminder, onDelete }: TaskCardProps) {
  const overdue = isTaskOverdue(task);
  const pendingInvitation = !task.isOwner && task.myResponseStatus === 'pending';

  function openFromCard(event: React.MouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest('button, a, input, select, textarea, label')) return;
    onOpen(task);
  }

  function openFromKeyboard(event: React.KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    onOpen(task);
  }

  return (
    <article
      className={`task-card task-card--${viewMode} task-card--${task.type}${overdue ? ' task-card--overdue' : ''}${pendingInvitation ? ' task-card--invitation' : ''}`}
      role="group"
      tabIndex={0}
      aria-label={`Відкрити справу «${task.title}»`}
      onClick={openFromCard}
      onKeyDown={openFromKeyboard}
    >
      <div className="task-card__mark" aria-hidden="true"><Icon name={taskTypeIcons[task.type]} size={21} /></div>
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
          <span className="task-card__time"><Icon name="schedule" size={16} /><span><small>Початок</small><strong>{task.startsAt ? formatTaskDateValue(task.startsAt, task.isAllDay) : 'Не вказано'}</strong></span></span>
          <span className={overdue ? 'task-card__time task-card__date--overdue' : 'task-card__time'}><Icon name="deadline" size={16} /><span><small>Завершення</small><strong>{formatTaskDateValue(task.dueAt, task.isAllDay)}</strong></span></span>
          {task.location && <span><Icon name="location" size={16} /> {task.location}</span>}
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
              <a className="task-card__join" href={task.meetingUrl} target="_blank" rel="noreferrer">Приєднатися <Icon name="openInNew" size={15} /></a>
            )}
          </div>
        )}

        <footer className="task-card__actions">
          <button className="task-action task-action--details" type="button" onClick={() => onOpen(task)}><Icon name="visibility" size={15} /> Деталі</button>
          {pendingInvitation ? (
            <>
              <button className="button button--primary button--small" type="button" disabled={busy} onClick={() => onRespond(task, 'accepted')}>Прийняти</button>
              <button className="button button--secondary button--small" type="button" disabled={busy} onClick={() => onRespond(task, 'declined')}>Відхилити</button>
            </>
          ) : (
            <>
              {task.status === 'active' && <button className="task-action" type="button" disabled={busy} onClick={() => onReminder(task)}><Icon name="alarm" size={15} /> Нагадування</button>}
              {task.isOwner && task.status === 'active' && <button className="task-action" type="button" disabled={busy} onClick={() => onEdit(task)}><Icon name="edit" size={15} /> Редагувати</button>}
              {task.isOwner && task.status === 'active' && <button className="task-action task-action--success" type="button" disabled={busy} onClick={() => onStatus(task, 'completed')}><Icon name="check" size={15} /> Виконано</button>}
              {task.isOwner && task.status === 'active' && task.participants.length > 0 && <button className="task-action task-action--danger" type="button" disabled={busy} onClick={() => onStatus(task, 'cancelled')}><Icon name="close" size={15} /> Скасувати</button>}
              {task.isOwner && task.participants.length === 0 && <button className="task-action task-action--danger" type="button" disabled={busy} onClick={() => onDelete(task)}><Icon name="delete" size={15} /> Видалити</button>}
            </>
          )}
        </footer>
      </div>
    </article>
  );
}
