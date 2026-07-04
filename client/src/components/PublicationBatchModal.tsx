import { useState } from 'react';
import type { FormEvent } from 'react';
import { toLocalDateTime } from '../lib/task';
import type { PublicationInput, PublicationPerson } from '../types/publication';
import { Icon } from './Icon';
import { PublicationAssigneePicker } from './PublicationAssigneePicker';

interface BatchRow { id: number; title: string; publishAt: string }
let nextRowId = 0;
function newRow(days = 1): BatchRow {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  date.setHours(10, 0, 0, 0);
  return { id: ++nextRowId, title: '', publishAt: toLocalDateTime(date) };
}

export function PublicationBatchModal({ currentUser, onClose, onSubmit }: {
  currentUser: PublicationPerson;
  onClose: () => void;
  onSubmit: (items: Array<Pick<PublicationInput, 'title' | 'publishAt' | 'assigneeId'>>) => Promise<void>;
}) {
  const [assignee, setAssignee] = useState(currentUser);
  const [rows, setRows] = useState<BatchRow[]>([newRow(1), newRow(2), newRow(3)]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const completeRows = rows.filter((row) => row.title.trim() && row.publishAt);
    if (!completeRows.length) return setError('Заповніть хоча б одну публікацію.');
    setPending(true);
    setError('');
    try {
      await onSubmit(completeRows.map((row) => ({
        title: row.title.trim(),
        publishAt: new Date(row.publishAt).toISOString(),
        assigneeId: assignee.id
      })));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не вдалося створити публікації.');
    } finally { setPending(false); }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal publication-batch-modal" role="dialog" aria-modal="true" aria-labelledby="publication-batch-title">
        <header className="modal__header"><div><p className="eyebrow">Швидке планування</p><h2 id="publication-batch-title">Створити декілька публікацій</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={20} /></button></header>
        <form className="publication-batch-form" onSubmit={submit}>
          {error && <div className="form-message form-message--error" role="alert">{error}</div>}
          <div className="field"><span>Спільний відповідальний</span><PublicationAssigneePicker value={assignee} self={currentUser} onChange={setAssignee} /></div>
          <div className="publication-batch-rows">
            <div className="publication-batch-rows__head"><span>Назва</span><span>Дата й час</span><span /></div>
            {rows.map((row) => <div className="publication-batch-row" key={row.id}>
              <input value={row.title} maxLength={200} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, title: event.target.value } : item))} placeholder="Робоча назва статті" />
              <input type="datetime-local" value={row.publishAt} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, publishAt: event.target.value } : item))} />
              <button type="button" disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} aria-label="Видалити рядок"><Icon name="delete" size={17} /></button>
            </div>)}
          </div>
          <button className="button button--add" type="button" onClick={() => setRows((current) => [...current, newRow(current.length + 1)])}><Icon name="add" size={17} /> Додати ще публікацію</button>
          <footer className="modal__footer"><span className="publication-batch-form__count">Буде створено: {rows.filter((row) => row.title.trim()).length}</span><button className="button button--secondary" type="button" onClick={onClose}>Скасувати</button><button className="button button--primary" type="submit" disabled={pending}>{pending ? 'Створюємо…' : 'Створити картки'}</button></footer>
        </form>
      </section>
    </div>
  );
}
