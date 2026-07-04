import { useState } from 'react';
import type { FormEvent } from 'react';
import type { BlogPublication } from '../types/publication';
import { Icon } from './Icon';

export function PublicationPublishModal({ publication, pending, onClose, onSubmit }: {
  publication: BlogPublication;
  pending: boolean;
  onClose: () => void;
  onSubmit: (url: string) => Promise<void>;
}) {
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = String(new FormData(event.currentTarget).get('publicationUrl') || '').trim();
    try {
      if (new URL(url).protocol !== 'https:') throw new Error();
    } catch { return setError('Вставте коректне HTTPS-посилання.'); }
    setError('');
    await onSubmit(url);
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal publication-publish-modal" role="dialog" aria-modal="true" aria-labelledby="publication-publish-title">
      <header className="modal__header"><div><p className="eyebrow">Завершення</p><h2 id="publication-publish-title">Статтю опубліковано</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={20} /></button></header>
      <form className="publication-publish-form" onSubmit={submit}>
        <p>Додайте посилання на готову статтю «{publication.title}».</p>
        {error && <div className="form-message form-message--error" role="alert">{error}</div>}
        <label className="field"><span>Посилання на статтю</span><input name="publicationUrl" type="url" placeholder="https://…" required autoFocus /></label>
        <footer className="modal__footer"><button className="button button--secondary" type="button" onClick={onClose}>Скасувати</button><button className="button button--primary" type="submit" disabled={pending}><Icon name="publication" size={17} /> {pending ? 'Зберігаємо…' : 'Позначити опублікованою'}</button></footer>
      </form>
    </section>
  </div>;
}
