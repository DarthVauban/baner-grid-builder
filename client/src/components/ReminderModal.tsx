import { useState } from 'react';
import type { FormEvent } from 'react';
import type { ReminderSettings, Task } from '../types/task';
import { Icon } from './Icon';
import { StyledSelect } from './StyledSelect';

interface ReminderModalProps {
  task: Task;
  onClose: () => void;
  onSubmit: (settings: ReminderSettings) => Promise<void>;
}

const remindBeforeOptions = [
  { value: 5, label: 'За 5 хвилин' },
  { value: 15, label: 'За 15 хвилин' },
  { value: 30, label: 'За 30 хвилин' },
  { value: 60, label: 'За 1 годину' },
  { value: 180, label: 'За 3 години' },
  { value: 1440, label: 'За 1 день' },
  { value: 10080, label: 'За 1 тиждень' }
];

const repeatOptions = [
  { value: '' as const, label: 'Одне нагадування' },
  { value: 15, label: 'Кожні 15 хвилин' },
  { value: 30, label: 'Кожні 30 хвилин' },
  { value: 60, label: 'Щогодини' },
  { value: 1440, label: 'Щодня' }
];

export function ReminderModal({ task, onClose, onSubmit }: ReminderModalProps) {
  const [enabled, setEnabled] = useState(task.reminder?.enabled ?? true);
  const [before, setBefore] = useState(task.reminder?.remindBeforeMinutes ?? 30);
  const [repeat, setRepeat] = useState<number | null>(task.reminder?.repeatIntervalMinutes ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await onSubmit({ enabled, remindBeforeMinutes: before, repeatIntervalMinutes: repeat });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не вдалося зберегти нагадування.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal reminder-modal" role="dialog" aria-modal="true" aria-labelledby="reminder-title">
        <header className="modal__header">
          <div><p className="eyebrow">Персональні налаштування</p><h2 id="reminder-title">Нагадування</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={20} /></button>
        </header>
        <form onSubmit={submit} className="reminder-form">
          <p className="reminder-form__task">{task.title}</p>
          {error && <div className="form-message form-message--error">{error}</div>}
          <label className="check-field"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>Нагадувати мені</span></label>
          {enabled && <>
            <div className="field"><span>Коли почати</span><StyledSelect value={before} options={remindBeforeOptions} onChange={setBefore} ariaLabel="Коли почати нагадування" /></div>
            <div className="field"><span>Повторення</span><StyledSelect value={repeat ?? ''} options={repeatOptions} onChange={(value) => setRepeat(value === '' ? null : Number(value))} ariaLabel="Повторення нагадування" /></div>
          </>}
          <footer className="modal__footer"><button className="button button--secondary" type="button" onClick={onClose}>Скасувати</button><button className="button button--primary" type="submit" disabled={pending}>{pending ? 'Зберігаємо…' : 'Зберегти'}</button></footer>
        </form>
      </section>
    </div>
  );
}
