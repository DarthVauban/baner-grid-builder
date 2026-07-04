import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatPublicationDate, publicationStatusLabels } from '../lib/publication';
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
    return <article className="chat-entity chat-entity--task">
      <header><span><Icon name="tasks" size={19} /></span><div><small>{taskTypeLabels[task.type]}</small><strong>{task.title}</strong></div></header>
      <div className="chat-entity__details"><span><Icon name="deadline" size={14} /> {formatTaskDateValue(task.dueAt, task.isAllDay)}</span><span><Icon name="users" size={14} /> {task.owner.name}</span></div>
      <footer>
        {pending && <><button className="button button--primary button--small" type="button" disabled={respond.isPending} onClick={() => void respondToTask('accepted')}>Прийняти</button><button className="button button--danger button--small" type="button" disabled={respond.isPending} onClick={() => void respondToTask('declined')}>Відхилити</button></>}
        <Link className="button button--secondary button--small" to={`/tasks?task=${encodeURIComponent(entity.id)}`}>Відкрити <Icon name="arrow" size={14} /></Link>
      </footer>
    </article>;
  }

  const publication = entity.data;
  return <article className="chat-entity chat-entity--publication">
    <header><span><Icon name="blogPublications" size={19} /></span><div><small>{publicationStatusLabels[publication.status]}</small><strong>{publication.title}</strong></div></header>
    <div className="chat-entity__details"><span><Icon name="calendar" size={14} /> {formatPublicationDate(publication.publishAt)}</span><span><Icon name="users" size={14} /> {publication.assignee?.name || 'Не призначено'}</span></div>
    <footer><Link className="button button--secondary button--small" to={`/tools/blog-publications?publication=${encodeURIComponent(entity.id)}`}>Відкрити <Icon name="arrow" size={14} /></Link></footer>
  </article>;
}
