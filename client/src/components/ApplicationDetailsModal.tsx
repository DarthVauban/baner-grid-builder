import { useEffect, useState } from 'react';
import { applicationStatusLabels, customerName, formatApplicationDate } from '../lib/application';
import { copyToClipboard } from '../lib/banner-generator';
import { useToast } from '../toast/ToastContext';
import type { ApplicationRecord, ApplicationStatus } from '../types/application';
import { Icon } from './Icon';
import { StyledSelect } from './StyledSelect';

interface Props {
  application: ApplicationRecord;
  busy?: boolean;
  onClose: () => void;
  onShare: (application: ApplicationRecord) => void;
  onStatus: (application: ApplicationRecord, status: ApplicationStatus, comment: string) => void;
  onClaim: (application: ApplicationRecord) => void;
  onComment: (application: ApplicationRecord, text: string) => void;
  canDelete?: boolean;
  deleteBusy?: boolean;
  onDelete?: (application: ApplicationRecord, code: string) => Promise<void> | void;
}

function ProductImagePreview({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (!src || failed) return <span><Icon name="productSelection" size={30} /></span>;
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

export function ApplicationDetailsModal({ application, busy, onClose, onShare, onStatus, onClaim, onComment, canDelete = false, deleteBusy = false, onDelete }: Props) {
  const [status, setStatus] = useState<ApplicationStatus>(application.status);
  const [statusComment, setStatusComment] = useState('');
  const [comment, setComment] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteCode, setDeleteCode] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const { showToast } = useToast();

  useEffect(() => setStatus(application.status), [application.status]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (deleteOpen) setDeleteOpen(false);
      else onClose();
    };
    document.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', close);
    };
  }, [deleteOpen, onClose]);

  const productTitle = application.product?.title || application.pageTitle || 'Товар не визначено';
  const sourceUrl = application.product?.url || application.sourceUrl;
  const productCode = application.product?.productCode || '';
  const utmEntries = Object.entries(application.utm || {}).filter(([, value]) => value);
  const canClaim = application.status === 'new' && !application.assignedManager;
  const summaryValues = application.values.filter((value) => value.showInSummary);
  const additionalValues = application.values.filter((value) => !value.showInSummary);

  async function copyProductText(label: string, value: string) {
    const text = value.trim();
    if (!text) return;
    try {
      await copyToClipboard(text);
      showToast(`${label} скопійовано.`);
    } catch {
      showToast(`Не вдалося скопіювати ${label.toLowerCase()}.`, 'error');
    }
  }

  async function confirmDelete() {
    if (!onDelete || !deleteCode.trim()) return;
    setDeleteError('');
    try {
      await onDelete(application, deleteCode.trim());
      setDeleteCode('');
      setDeleteOpen(false);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Не вдалося видалити заявку.');
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal application-details-modal" role="dialog" aria-modal="true" aria-labelledby="application-details-title">
      <header className="modal__header">
        <div>
          <p className="eyebrow">Заявка №{application.number}</p>
          <h2 id="application-details-title">{customerName(application.customer.firstName, application.customer.lastName)}</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={20} /></button>
      </header>

      <div className="application-details-modal__content">
        <section className="application-product-preview">
          <ProductImagePreview src={application.product?.imageProxyUrl || application.product?.imageUrl} />
          <div>
            <div className="application-details-modal__badges">
              <span className={`application-status application-status--${application.status}`}>{application.statusLabel}</span>
              <span className={application.assignedManager ? 'application-manager-pill' : 'application-manager-pill application-manager-pill--empty'}>{application.assignedManager?.name || 'Не взято в роботу'}</span>
            </div>
            <div className="application-product-preview__title">
              <h3>{productTitle}</h3>
              <button className="icon-button application-product-preview__copy" type="button" onClick={() => void copyProductText('Назву товару', productTitle)} aria-label="Скопіювати назву товару" title="Скопіювати назву товару"><Icon name="copy" size={15} /></button>
            </div>
            <dl>
              {application.product?.price && <><dt>Ціна</dt><dd>{application.product.price} {application.product.currency}</dd></>}
              {application.product?.oldPrice && <><dt>Стара ціна</dt><dd>{application.product.oldPrice}</dd></>}
              {application.product?.sku && <><dt>SKU</dt><dd>{application.product.sku}</dd></>}
              {application.product?.productCode && <><dt>Код</dt><dd>{application.product.productCode}</dd></>}
              {application.product?.availability && <><dt>Наявність</dt><dd>{application.product.availability}</dd></>}
              {application.product?.domain && <><dt>Домен</dt><dd>{application.product.domain}</dd></>}
            </dl>
            {(sourceUrl || productCode) && <div className="application-product-preview__actions">
              {sourceUrl && <a className="button button--secondary button--small" href={sourceUrl} target="_blank" rel="noreferrer">Перейти до товару <Icon name="openInNew" size={14} /></a>}
              {productCode && <button className="button button--secondary button--small" type="button" onClick={() => void copyProductText('Код товару', productCode)}><Icon name="copy" size={14} /> Скопіювати код товару</button>}
            </div>}
          </div>
        </section>

        <section className="task-details-grid">
          <div><Icon name="users" size={18} /><span><small>Покупець</small><strong>{customerName(application.customer.firstName, application.customer.lastName)}</strong></span></div>
          <div><Icon name="phone" size={18} /><span><small>Телефон</small><strong>{application.customer.phone ? <a href={`tel:${application.customer.phone}`}>{application.customer.phone}</a> : 'Не вказано'}</strong></span></div>
          <div><Icon name="publication" size={18} /><span><small>Банк</small><strong>{application.customer.bankLabel || 'Не вказано'}</strong></span></div>
          <div><Icon name="schedule" size={18} /><span><small>Створено</small><strong>{formatApplicationDate(application.createdAt)}</strong></span></div>
          <div><Icon name="edit" size={18} /><span><small>Форма</small><strong>{application.formName}</strong></span></div>
          <div><Icon name="calendar" size={18} /><span><small>Оновлено</small><strong>{formatApplicationDate(application.updatedAt)}</strong></span></div>
          <div><Icon name="users" size={18} /><span><small>Менеджер</small><strong>{application.assignedManager ? application.assignedManager.name : 'Не взято в роботу'}</strong></span></div>
          <div><Icon name="schedule" size={18} /><span><small>Взято в роботу</small><strong>{application.assignedManager?.assignedAt ? formatApplicationDate(application.assignedManager.assignedAt) : '—'}</strong></span></div>
          {summaryValues.map((value) => <div key={value.id}><Icon name="edit" size={18} /><span><small>{value.label}</small><strong>{value.optionLabel || value.value || 'Не заповнено'}</strong></span></div>)}
        </section>

        <section className="task-details-section">
          <h3>Джерело заявки</h3>
          <div className="application-source-grid">
            <article><small>Сторінка</small>{application.sourceUrl ? <a href={application.sourceUrl} target="_blank" rel="noreferrer">{application.sourceUrl}</a> : <strong>Не вказано</strong>}</article>
            <article><small>Заголовок</small><strong>{application.pageTitle || 'Не вказано'}</strong></article>
            <article><small>Referrer</small>{application.referrer ? <a href={application.referrer} target="_blank" rel="noreferrer">{application.referrer}</a> : <strong>Не вказано</strong>}</article>
            <article><small>UTM</small>{utmEntries.length ? <div className="application-utm-list">{utmEntries.map(([key, value]) => <span key={key}>{key}: {value}</span>)}</div> : <strong>Не передано</strong>}</article>
          </div>
        </section>

        {additionalValues.length > 0 && <section className="task-details-section">
          <h3>Додаткові відповіді <span>{additionalValues.length}</span></h3>
          <div className="application-answer-list">
            {additionalValues.map((value) => <article key={value.id}><small>{value.label}</small><strong>{value.optionLabel || value.value || 'Не заповнено'}</strong></article>)}
          </div>
        </section>}

        <section className="task-details-section application-status-editor">
          <h3>Статус</h3>
          <div>
            <div className="field"><span>Новий статус</span><StyledSelect value={status} options={Object.entries(applicationStatusLabels).map(([value, label]) => ({ value: value as ApplicationStatus, label }))} onChange={setStatus} ariaLabel="Новий статус заявки" /></div>
            <label className="field"><span>Коментар до зміни</span><input value={statusComment} onChange={(event) => setStatusComment(event.target.value)} maxLength={1000} placeholder="Необовʼязково" /></label>
            <button className="button button--primary" type="button" disabled={busy || status === application.status} onClick={() => { onStatus(application, status, statusComment); setStatusComment(''); }}>Змінити статус</button>
          </div>
        </section>

        <section className="task-details-section">
          <h3>Внутрішні коментарі <span>{application.comments.length}</span></h3>
          <div className="application-comments">
            {application.comments.map((item) => <article key={item.id}><strong>{item.user.name}</strong><p>{item.text}</p><time>{formatApplicationDate(item.createdAt)}</time></article>)}
            {!application.comments.length && <p className="task-details-section__muted">Коментарів поки немає.</p>}
          </div>
          <form className="application-comment-form" onSubmit={(event) => { event.preventDefault(); if (comment.trim()) { onComment(application, comment.trim()); setComment(''); } }}>
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={3000} placeholder="Додати внутрішній коментар" rows={3} />
            <button className="button button--secondary" type="submit" disabled={busy || !comment.trim()}>Додати</button>
          </form>
        </section>

        <section className="task-details-section">
          <h3>Історія статусів</h3>
          <div className="application-history">
            {application.history.map((item) => <article key={item.id}><span>{item.newStatusLabel}</span><small>{formatApplicationDate(item.createdAt)}{item.changedBy?.name ? ` · ${item.changedBy.name}` : ''}</small>{item.comment && <p>{item.comment}</p>}</article>)}
          </div>
        </section>
      </div>

      <footer className="task-details-modal__footer">
        {canDelete && <button className="button button--danger" type="button" disabled={busy || deleteBusy} onClick={() => { setDeleteCode(''); setDeleteError(''); setDeleteOpen(true); }}><Icon name="delete" size={17} /> Видалити заявку</button>}
        {canClaim && <button className="button button--primary" type="button" disabled={busy} onClick={() => onClaim(application)}>Взяти в роботу</button>}
        <button className="button button--secondary" type="button" onClick={() => onShare(application)}><Icon name="share" size={17} /> Поділитися</button>
        <button className="button button--secondary" type="button" onClick={onClose}>Закрити</button>
      </footer>
    </section>
    {deleteOpen && <div className="modal-backdrop modal-backdrop--nested" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDeleteOpen(false)}>
      <section className="modal application-delete-modal" role="dialog" aria-modal="true" aria-labelledby="application-delete-title">
        <header className="modal__header">
          <div>
            <p className="eyebrow">Видалення заявки №{application.number}</p>
            <h2 id="application-delete-title">Підтвердіть дію</h2>
          </div>
          <button className="icon-button" type="button" onClick={() => setDeleteOpen(false)} aria-label="Закрити"><Icon name="close" size={20} /></button>
        </header>
        <div className="application-delete-modal__content">
          <div className="form-message form-message--error" role="alert">Заявку буде повністю видалено із системи. Цю дію неможливо скасувати.</div>
          {deleteError && <div className="form-message form-message--error" role="alert">{deleteError}</div>}
          <label className="field">
            <span>Код із застосунку аутентифікатора</span>
            <input value={deleteCode} onChange={(event) => setDeleteCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6} autoFocus placeholder="6-значний код" />
          </label>
        </div>
        <footer className="modal__footer application-delete-modal__footer">
          <button className="button button--secondary" type="button" disabled={deleteBusy} onClick={() => setDeleteOpen(false)}>Скасувати</button>
          <button className="button button--danger" type="button" disabled={deleteBusy || deleteCode.trim().length !== 6} onClick={() => void confirmDelete()}><Icon name="delete" size={17} /> Видалити назавжди</button>
        </footer>
      </section>
    </div>}
  </div>;
}
