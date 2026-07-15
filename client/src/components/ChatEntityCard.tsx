import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatApplicationDate } from '../lib/application';
import { formatCatalogDate } from '../lib/catalog';
import { formatPublicationDate, materialTypeLabels, publicationStatusLabels } from '../lib/publication';
import { formatTaskDateValue, taskTypeLabels } from '../lib/task';
import { useToast } from '../toast/ToastContext';
import type { ApplicationRecord, ApplicationStatus } from '../types/application';
import type { ChatEntity } from '../types/chat';
import type { Task } from '../types/task';
import type { BlogPublication } from '../types/publication';
import { ApplicationDetailsModal } from './ApplicationDetailsModal';
import { Icon } from './Icon';
import { TaskDetailsModal } from './TaskDetailsModal';
import { PublicationDetailsModal } from './PublicationDetailsModal';

export function ChatEntityCard({ entity, conversationId }: { entity: ChatEntity; conversationId: string }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [taskDetails, setTaskDetails] = useState<Task | null>(null);
  const [publicationDetails, setPublicationDetails] = useState<BlogPublication | null>(null);
  const [applicationDetails, setApplicationDetails] = useState<ApplicationRecord | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const respond = useMutation({
    mutationFn: ({ id, response }: { id: string; response: 'accepted' | 'declined' }) => api.tasks.respond(id, response)
  });
  const setApplicationStatus = useMutation({
    mutationFn: ({ id, status, version, comment }: { id: string; status: ApplicationStatus; version: number; comment: string }) =>
      api.applications.setStatus(id, status, version, comment)
  });
  const claimApplication = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => api.applications.claim(id, version)
  });
  const addApplicationComment = useMutation({
    mutationFn: ({ id, text, version }: { id: string; text: string; version: number }) =>
      api.applications.addComment(id, text, version)
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
      if (taskDetails) setTaskDetails(await api.tasks.get(entity.id));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося відповісти на запрошення.', 'error');
    }
  }

  async function openDetails() {
    if (!entity.available || loadingDetails) return;
    setLoadingDetails(true);
    try {
      if (entity.type === 'task') setTaskDetails(await api.tasks.get(entity.id));
      else if (entity.type === 'publication') setPublicationDetails(await api.publications.get(entity.id));
      else if (entity.type === 'application') setApplicationDetails(await api.applications.get(entity.id));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося відкрити картку.', 'error');
    } finally {
      setLoadingDetails(false);
    }
  }

  async function shareEntity(type: 'task' | 'publication' | 'application' | 'catalog_product', id: string) {
    const path = type === 'task'
      ? `/tasks?task=${encodeURIComponent(id)}`
      : type === 'publication'
        ? `/tools/blog-publications?publication=${encodeURIComponent(id)}`
        : type === 'application'
          ? `/tools/applications?application=${encodeURIComponent(id)}`
          : `/catalog/products?product=${encodeURIComponent(id)}`;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      showToast('Посилання скопійовано.');
    } catch {
      showToast('Не вдалося скопіювати посилання.', 'error');
    }
  }

  async function refreshApplication(application: ApplicationRecord) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['chat-messages', conversationId] }),
      queryClient.invalidateQueries({ queryKey: ['applications'] }),
      queryClient.invalidateQueries({ queryKey: ['application-counts'] }),
      queryClient.invalidateQueries({ queryKey: ['shared-application', application.id] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    ]);
  }

  async function changeApplicationStatus(application: ApplicationRecord, status: ApplicationStatus, comment: string) {
    try {
      const updated = await setApplicationStatus.mutateAsync({ id: application.id, status, version: application.version, comment });
      setApplicationDetails(updated);
      await refreshApplication(updated);
      showToast('Статус заявки змінено.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося змінити статус заявки.', 'error');
    }
  }

  async function claimApplicationCard(application: ApplicationRecord) {
    try {
      const updated = await claimApplication.mutateAsync({ id: application.id, version: application.version });
      setApplicationDetails(updated);
      await refreshApplication(updated);
      showToast('Заявку взято в роботу.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося взяти заявку в роботу.', 'error');
    }
  }

  async function createApplicationComment(application: ApplicationRecord, text: string) {
    try {
      const updated = await addApplicationComment.mutateAsync({ id: application.id, text, version: application.version });
      setApplicationDetails(updated);
      await refreshApplication(updated);
      showToast('Коментар додано.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося додати коментар.', 'error');
    }
  }

  if (!entity.available) {
    return <article className="chat-entity chat-entity--unavailable"><Icon name="visibility" size={18} /><span><strong>Об’єкт недоступний</strong><small>Його видалено або у вас немає доступу.</small></span></article>;
  }

  if (entity.type === 'task') {
    const task = entity.data;
    const pending = !task.isOwner && task.myResponseStatus === 'pending' && task.status === 'active';
    const statusLabel = task.status === 'completed' ? 'Виконано' : task.status === 'cancelled' ? 'Скасовано' : pending ? 'Потрібна відповідь' : 'Активна';
    return <><article className="chat-entity chat-entity--task">
      <header><span><Icon name="tasks" size={28} /></span><div><div className="chat-entity__kicker"><small>{taskTypeLabels[task.type]}</small><b>{statusLabel}</b></div><strong>{task.title}</strong></div></header>
      {task.description && <p>{task.description}</p>}
      <div className="chat-entity__details"><span><Icon name="schedule" size={18} /><span><small>Початок</small><strong>{task.startsAt ? formatTaskDateValue(task.startsAt, task.isAllDay) : 'Не вказано'}</strong></span></span><span><Icon name="deadline" size={18} /><span><small>Завершення</small><strong>{formatTaskDateValue(task.dueAt, task.isAllDay)}</strong></span></span><span><Icon name="users" size={18} /><span><small>Власник</small><strong>{task.owner.name}</strong></span></span>{task.participantCount > 0 && <span><Icon name="users" size={18} /><span><small>Учасники</small><strong>{task.participantCount}</strong></span></span>}</div>
      <footer>
        {pending && <><button className="button button--primary button--small" type="button" disabled={respond.isPending} onClick={() => void respondToTask('accepted')}>Прийняти</button><button className="button button--danger button--small" type="button" disabled={respond.isPending} onClick={() => void respondToTask('declined')}>Відхилити</button></>}
        {task.meetingUrl && <a className="button button--secondary button--small" href={task.meetingUrl} target="_blank" rel="noreferrer">Приєднатися <Icon name="openInNew" size={14} /></a>}
        <button className="button button--secondary button--small" type="button" disabled={loadingDetails} onClick={() => void openDetails()}>Відкрити <Icon name="arrow" size={14} /></button>
      </footer>
    </article>{taskDetails && <TaskDetailsModal task={taskDetails} busy={respond.isPending} onClose={() => setTaskDetails(null)} onShare={(task) => void shareEntity('task', task.id)} onRespond={(_, response) => void respondToTask(response)} />}</>;
  }

  if (entity.type === 'application') {
    const application = entity.data;
    const title = application.customerName || application.productTitle || `Заявка №${application.number}`;
    const applicationBusy = setApplicationStatus.isPending || claimApplication.isPending || addApplicationComment.isPending;
    return <><article className="chat-entity chat-entity--application">
      <header><span><Icon name="tasks" size={28} /></span><div><div className="chat-entity__kicker"><small>Заявка №{application.number}</small><b>{application.statusLabel}</b></div><strong>{title}</strong></div></header>
      {application.productTitle && <p>{application.productTitle}</p>}
      <div className="chat-entity__details">
        <span><Icon name="calendar" size={18} /><span><small>Створено</small><strong>{formatApplicationDate(application.createdAt)}</strong></span></span>
        <span><Icon name="publication" size={18} /><span><small>Форма</small><strong>{application.formName}</strong></span></span>
        <span><Icon name="phone" size={18} /><span><small>Банк</small><strong>{application.bankLabel || 'Не вказано'}</strong></span></span>
        <span><Icon name="productSelection" size={18} /><span><small>Товар</small><strong>{application.productTitle || 'Не визначено'}</strong></span></span>
      </div>
      <footer>
        {application.sourceUrl && <a className="button button--secondary button--small" href={application.sourceUrl} target="_blank" rel="noreferrer">Товар <Icon name="openInNew" size={14} /></a>}
        <button className="button button--secondary button--small" type="button" disabled={loadingDetails} onClick={() => void openDetails()}>Відкрити картку <Icon name="arrow" size={14} /></button>
      </footer>
    </article>{applicationDetails && <ApplicationDetailsModal application={applicationDetails} busy={applicationBusy} onClose={() => setApplicationDetails(null)} onShare={(item) => void shareEntity('application', item.id)} onStatus={(item, nextStatus, comment) => void changeApplicationStatus(item, nextStatus, comment)} onClaim={(item) => void claimApplicationCard(item)} onComment={(item, text) => void createApplicationComment(item, text)} />}</>;
  }

  if (entity.type === 'catalog_product') {
    const product = entity.data;
    return <article className="chat-entity chat-entity--catalog-product">
      <header><span>{product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <Icon name="phone" size={28} />}</span><div><div className="chat-entity__kicker"><small>{product.productCode} · {product.conditionLabel}</small><b>{product.publicationStatusLabel}</b></div><strong>{product.name}</strong></div></header>
      <div className="chat-entity__details">
        <span><Icon name="publication" size={18} /><span><small>Ціна</small><strong>{product.priceLabel}</strong></span></span>
        <span><Icon name="productSelection" size={18} /><span><small>Наявність</small><strong>{product.availabilityLabel}</strong></span></span>
        <span><Icon name="calendar" size={18} /><span><small>Оновлено</small><strong>{formatCatalogDate(product.updatedAt)}</strong></span></span>
      </div>
      <footer>
        <a className="button button--secondary button--small" href={`/catalog/products?product=${encodeURIComponent(entity.id)}`}>Відкрити <Icon name="arrow" size={14} /></a>
        <button className="button button--secondary button--small" type="button" onClick={() => void shareEntity('catalog_product', entity.id)}>Копіювати <Icon name="copy" size={14} /></button>
      </footer>
    </article>;
  }

  const publication = entity.data;
  return <><article className="chat-entity chat-entity--publication">
    <header><span><Icon name="blogPublications" size={28} /></span><div><div className="chat-entity__kicker"><small>Публікація блогу</small><b>{publicationStatusLabels[publication.status]}</b></div><strong>{publication.title}</strong></div></header>
    {publication.description && <p>{publication.description}</p>}
    <div className="chat-entity__details"><span><Icon name="calendar" size={18} /><span><small>Дата публікації</small><strong>{formatPublicationDate(publication.publishAt)}</strong></span></span><span><Icon name="users" size={18} /><span><small>Відповідальний</small><strong>{publication.assignee?.name || 'Не призначено'}</strong></span></span><span><Icon name="edit" size={18} /><span><small>Поставив(-ла)</small><strong>{publication.creator.name}</strong></span></span></div>
    {publication.materials.length > 0 && <div className="chat-entity__materials">{publication.materials.map((material) => <a href={material.url} target="_blank" rel="noreferrer" key={material.id || material.url}><Icon name="openInNew" size={15} /> {material.label || materialTypeLabels[material.type]}</a>)}</div>}
    <footer>{publication.publicationUrl && <a className="button button--primary button--small" href={publication.publicationUrl} target="_blank" rel="noreferrer">Відкрити статтю <Icon name="openInNew" size={14} /></a>}<button className="button button--secondary button--small" type="button" disabled={loadingDetails} onClick={() => void openDetails()}>Відкрити картку <Icon name="arrow" size={14} /></button></footer>
  </article>{publicationDetails && <PublicationDetailsModal publication={publicationDetails} onClose={() => setPublicationDetails(null)} onShare={(item) => void shareEntity('publication', item.id)} />}</>;
}
