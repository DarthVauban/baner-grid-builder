import { useState } from 'react';
import type { FormEvent } from 'react';
import type { ReminderSettings, Task } from '../types/task';

interface ReminderModalProps {
  task: Task;
  onClose: () => void;
  onSubmit: (settings: ReminderSettings) => Promise<void>;
}

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
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити">×</button>
        </header>
        <form onSubmit={submit} className="reminder-form">
          <p className="reminder-form__task">{task.title}</p>
          {error && <div className="form-message form-message--error">{error}</div>}
          <label className="check-field"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>Нагадувати мені</span></label>
          {enabled && <>
            <label className="field"><span>Коли почати</span><select value={before} onChange={(event) => setBefore(Number(event.target.value))}>
              <option value={5}>За 5 хвилин</option><option value={15}>За 15 хвилин</option><option value={30}>За 30 хвилин</option>
              <option value={60}>За 1 годину</option><option value={180}>За 3 години</option><option value={1440}>За 1 день</option><option value={10080}>За 1 тиждень</option>
            </select></label>
            <label className="field"><span>Повторення</span><select value={repeat ?? ''} onChange={(event) => setRepeat(event.target.value ? Number(event.target.value) : null)}>
              <option value="">Одне нагадування</option><option value={15}>Кожні 15 хвилин</option><option value={30}>Кожні 30 хвилин</option>
              <option value={60}>Щогодини</option><option value={1440}>Щодня</option>
            </select></label>
          </>}
          <footer className="modal__footer"><button className="button button--secondary" type="button" onClick={onClose}>Скасувати</button><button className="button button--primary" type="submit" disabled={pending}>{pending ? 'Зберігаємо…' : 'Зберегти'}</button></footer>
        </form>
      </section>
    </div>
  );
}
