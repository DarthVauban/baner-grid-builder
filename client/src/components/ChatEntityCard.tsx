import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatPublicationDate, materialTypeLabels, publicationStatusLabels } from '../lib/publication';
import { formatTaskDateValue, taskTypeLabels } from '../lib/task';
import { useToast } from '../toast/ToastContext';
import type { ChatEntity } from '../types/chat';
import { Icon } from './Icon';

export function ChatEntityCard({ entity, conversationId }: { entity: ChatEntity; conversationId: string }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const respond = useMutation({
    mutationFn: ({ id, response }: { id: string; response: 'accepted' | 'declined' }) => api.tasks.respond(id, response)
  });

  async function respondToTask(response: 'accepted' | 'declined') {
    if (entity.type !== 'task') return;
    try {
      await respond.mutateAsync({ id: entity.id, response });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['chat-messages', conversationId] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['task-counts'] })
      ]);
      showToast(response === 'accepted' ? 'Запрошення прийнято.' : 'Запрошення відхилено.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося відповісти на запрошення.', 'error');
    }
  }

  if (!entity.available) {
    return <article className="chat-entity chat-entity--unavailable"><Icon name="visibility" size={18} /><span><strong>Об’єкт недоступний</strong><small>Його видалено або у вас немає доступу.</small></span></article>;
  }

  if (entity.type === 'task') {
    const task = entity.data;
    const pending = !task.isOwner && task.myResponseStatus === 'pending' && task.status === 'active';
    const statusLabel = task.status === 'completed' ? 'Виконано' : task.status === 'cancelled' ? 'Скасовано' : pending ? 'Потрібна відповідь' : 'Активна';
    return <article className="chat-entity chat-entity--task">
      <header><span><Icon name="tasks" size={23} /></span><div><div className="chat-entity__kicker"><small>{taskTypeLabels[task.type]}</small><b>{statusLabel}</b></div><strong>{task.title}</strong></div></header>
      {task.description && <p>{task.description}</p>}
      <div className="chat-entity__details"><span><Icon name="schedule" size={15} /><span><small>Початок</small><strong>{task.startsAt ? formatTaskDateValue(task.startsAt, task.isAllDay) : 'Не вказано'}</strong></span></span><span><Icon name="deadline" size={15} /><span><small>Завершення</small><strong>{formatTaskDateValue(task.dueAt, task.isAllDay)}</strong></span></span><span><Icon name="users" size={15} /><span><small>Власник</small><strong>{task.owner.name}</strong></span></span>{task.participantCount > 0 && <span><Icon name="users" size={15} /><span><small>Учасники</small><strong>{task.participantCount}</strong></span></span>}</div>
      <footer>
        {pending && <><button className="button button--primary button--small" type="button" disabled={respond.isPending} onClick={() => void respondToTask('accepted')}>Прийняти</button><button className="button button--danger button--small" type="button" disabled={respond.isPending} onClick={() => void respondToTask('declined')}>Відхилити</button></>}
        {task.meetingUrl && <a className="button button--secondary button--small" href={task.meetingUrl} target="_blank" rel="noreferrer">Приєднатися <Icon name="openInNew" size={14} /></a>}
        <Link className="button button--secondary button--small" to={`/tasks?task=${encodeURIComponent(entity.id)}`}>Відкрити <Icon name="arrow" size={14} /></Link>
      </footer>
    </article>;
  }

  const publication = entity.data;
  return <article className="chat-entity chat-entity--publication">
    <header><span><Icon name="blogPublications" size={23} /></span><div><div className="chat-entity__kicker"><small>Публікація блогу</small><b>{publicationStatusLabels[publication.status]}</b></div><strong>{publication.title}</strong></div></header>
    {publication.description && <p>{publication.description}</p>}
    <div className="chat-entity__details"><span><Icon name="calendar" size={15} /><span><small>Дата публікації</small><strong>{formatPublicationDate(publication.publishAt)}</strong></span></span><span><Icon name="users" size={15} /><span><small>Відповідальний</small><strong>{publication.assignee?.name || 'Не призначено'}</strong></span></span><span><Icon name="edit" size={15} /><span><small>Поставив(-ла)</small><strong>{publication.creator.name}</strong></span></span></div>
    {publication.materials.length > 0 && <div className="chat-entity__materials">{publication.materials.map((material) => <a href={material.url} target="_blank" rel="noreferrer" key={material.id || material.url}><Icon name="openInNew" size={13} /> {material.label || materialTypeLabels[material.type]}</a>)}</div>}
    <footer>{publication.publicationUrl && <a className="button button--primary button--small" href={publication.publicationUrl} target="_blank" rel="noreferrer">Відкрити статтю <Icon name="openInNew" size={14} /></a>}<Link className="button button--secondary button--small" to={`/tools/blog-publications?publication=${encodeURIComponent(entity.id)}`}>Відкрити картку <Icon name="arrow" size={14} /></Link></footer>
  </article>;
}
