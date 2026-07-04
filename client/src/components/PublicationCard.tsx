import { formatPublicationDate, isPublicationOverdue, materialTypeLabels, publicationStatusLabels } from '../lib/publication';
import { getInitials } from '../lib/user';
import type { BlogPublication, PublicationStatus } from '../types/publication';
import { Icon } from './Icon';

export function PublicationCard({ publication, viewMode, canEdit, busy, onOpen, onShare, onEdit, onStatus }: {
  publication: BlogPublication;
  viewMode: 'list' | 'grid';
  canEdit: boolean;
  busy: boolean;
  onOpen: (publication: BlogPublication) => void;
  onShare: (publication: BlogPublication) => void;
  onEdit: (publication: BlogPublication) => void;
  onStatus: (publication: BlogPublication, status: PublicationStatus) => void;
}) {
  const overdue = isPublicationOverdue(publication.status, publication.publishAt);

  return (
    <article className={`publication-card publication-card--${viewMode}${overdue ? ' publication-card--overdue' : ''}`}>
      <header>
        <span className="publication-card__icon"><Icon name="blogPublications" size={21} /></span>
        <div><span className={`publication-status publication-status--${overdue ? 'overdue' : publication.status}`}>{overdue ? 'Прострочено' : publicationStatusLabels[publication.status]}</span><h2>{publication.title}</h2></div>
      </header>
      <div className="publication-card__meta">
        <span className={overdue ? 'publication-card__date publication-card__date--overdue' : 'publication-card__date'}><Icon name="calendar" size={16} /><span><small>Публікація</small><strong>{formatPublicationDate(publication.publishAt)}</strong></span></span>
        <span>{publication.assignee ? <span className="mini-avatar mini-avatar--accepted">{getInitials(publication.assignee.name)}</span> : <span className="mini-avatar"><Icon name="users" size={14} /></span>}<span><small>Відповідальний</small><strong>{publication.assignee?.name || 'Не призначено'}</strong></span></span>
        <span><span className="mini-avatar">{getInitials(publication.creator.name)}</span><span><small>Поставив(-ла) задачу</small><strong>{publication.creator.name}</strong></span></span>
      </div>
      {publication.description && <p>{publication.description}</p>}
      <div className="publication-card__resources">
        {publication.materials.length > 0 && <div className="publication-card__materials">{publication.materials.slice(0, 3).map((material) => <a href={material.url} target="_blank" rel="noreferrer" key={material.id || material.url}><Icon name="openInNew" size={14} /> {material.label || materialTypeLabels[material.type]}</a>)}{publication.materials.length > 3 && <span>+{publication.materials.length - 3}</span>}</div>}
        {publication.publicationUrl && <a className="publication-card__published-link" href={publication.publicationUrl} target="_blank" rel="noreferrer"><Icon name="openInNew" size={15} /> Відкрити статтю</a>}
      </div>
      <footer>
        <button className="task-action task-action--details" type="button" onClick={() => onOpen(publication)}><Icon name="visibility" size={15} /> Деталі</button>
        <button className="task-action" type="button" onClick={() => onShare(publication)}><Icon name="share" size={15} /> Поділитися</button>
        {canEdit && ['planned', 'ready'].includes(publication.status) && <button className="task-action" type="button" disabled={busy} onClick={() => onEdit(publication)}><Icon name="edit" size={15} /> Редагувати</button>}
        {canEdit && publication.status === 'planned' && <button className="task-action task-action--success" type="button" disabled={busy} onClick={() => onStatus(publication, 'ready')}><Icon name="check" size={15} /> Матеріали готові</button>}
        {canEdit && publication.status === 'ready' && <button className="task-action task-action--success" type="button" disabled={busy} onClick={() => onStatus(publication, 'published')}><Icon name="publication" size={15} /> Опубліковано</button>}
        {canEdit && ['planned', 'ready'].includes(publication.status) && <button className="task-action task-action--danger" type="button" disabled={busy} onClick={() => onStatus(publication, 'cancelled')}><Icon name="close" size={15} /> Скасувати</button>}
      </footer>
    </article>
  );
}
