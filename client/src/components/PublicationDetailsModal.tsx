import { useEffect } from 'react';
import { formatPublicationDate, isPublicationOverdue, materialTypeLabels, publicationStatusLabels } from '../lib/publication';
import type { BlogPublication } from '../types/publication';
import { Icon } from './Icon';

export function PublicationDetailsModal({ publication, onClose }: { publication: BlogPublication; onClose: () => void }) {
  const overdue = isPublicationOverdue(publication.status, publication.publishAt);
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal publication-details-modal" role="dialog" aria-modal="true" aria-labelledby="publication-details-title">
      <header className="modal__header"><div><p className="eyebrow">Публікація блогу</p><h2 id="publication-details-title">{publication.title}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={20} /></button></header>
      <div className="publication-details-modal__content">
        <div className="publication-details-modal__badges"><span className={`publication-status publication-status--${overdue ? 'overdue' : publication.status}`}>{overdue ? 'Прострочено' : publicationStatusLabels[publication.status]}</span></div>
        <section className="task-details-grid">
          <div><Icon name="calendar" size={18} /><span><small>Дата публікації</small><strong>{formatPublicationDate(publication.publishAt)}</strong></span></div>
          <div><Icon name="users" size={18} /><span><small>Відповідальний</small><strong>{publication.assignee?.name || 'Не призначено'}</strong></span></div>
          <div><Icon name="edit" size={18} /><span><small>Поставив(-ла) задачу</small><strong>{publication.creator.name}</strong></span></div>
          <div><Icon name="schedule" size={18} /><span><small>Оновлено</small><strong>{formatPublicationDate(publication.updatedAt)}</strong></span></div>
        </section>
        <section className="task-details-section"><h3>Опис</h3><p className={publication.description ? '' : 'task-details-section__muted'}>{publication.description || 'Опис не додано.'}</p></section>
        <section className="task-details-section"><h3>Матеріали <span>{publication.materials.length}</span></h3>{publication.materials.length ? <div className="publication-details-materials">{publication.materials.map((material) => <a href={material.url} target="_blank" rel="noreferrer" key={material.id || material.url}><span><Icon name="openInNew" size={17} /></span><span><strong>{material.label}</strong><small>{materialTypeLabels[material.type]}</small></span><Icon name="arrow" size={16} /></a>)}</div> : <p className="task-details-section__muted">Матеріали ще не додані.</p>}</section>
        {publication.publicationUrl && <a className="task-details-modal__meeting" href={publication.publicationUrl} target="_blank" rel="noreferrer"><Icon name="publication" size={18} /> Відкрити опубліковану статтю <Icon name="openInNew" size={16} /></a>}
      </div>
      <footer className="task-details-modal__footer"><button className="button button--secondary" type="button" onClick={onClose}>Закрити</button></footer>
    </section>
  </div>;
}
