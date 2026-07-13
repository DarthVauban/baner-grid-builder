import { useState } from 'react';
import type { FormEvent } from 'react';
import { detectMaterial, materialTypeLabels } from '../lib/publication';
import { toLocalDateTime } from '../lib/task';
import type { BlogPublication, PublicationInput, PublicationMaterial, PublicationMaterialType, PublicationPerson } from '../types/publication';
import { DateTimePicker } from './DateTimePicker';
import { Icon } from './Icon';
import { PublicationAssigneePicker } from './PublicationAssigneePicker';

function defaultPublishAt() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setHours(10, 0, 0, 0);
  return toLocalDateTime(date);
}

export function PublicationFormModal({ publication, onClose, onSubmit }: {
  publication?: BlogPublication | null;
  onClose: () => void;
  onSubmit: (input: PublicationInput) => Promise<void>;
}) {
  const [assignee, setAssignee] = useState<PublicationPerson | null>(publication?.assignee || null);
  const [publishAt, setPublishAt] = useState(publication ? toLocalDateTime(publication.publishAt) : defaultPublishAt());
  const [materials, setMaterials] = useState<PublicationMaterial[]>(publication?.materials || []);
  const [materialInput, setMaterialInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  function addMaterials() {
    const urls = materialInput.split(/\s+/).map((item) => item.trim()).filter(Boolean);
    const valid = urls.filter((url) => {
      try { return new URL(url).protocol === 'https:'; } catch { return false; }
    });
    if (!valid.length) return setError('Вставте коректне HTTPS-посилання.');
    setMaterials((current) => [
      ...current,
      ...valid.filter((url) => !current.some((item) => item.url === url)).map(detectMaterial)
    ]);
    setMaterialInput('');
    setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    try {
      await onSubmit({
        title: String(form.get('title') || ''),
        description: String(form.get('description') || ''),
        publishAt: new Date(publishAt).toISOString(),
        assigneeId: assignee?.id || null,
        materials: materials.map(({ type, label, url }) => ({ type, label, url }))
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не вдалося зберегти публікацію.');
    } finally { setPending(false); }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal publication-form-modal" role="dialog" aria-modal="true" aria-labelledby="publication-form-title">
        <header className="modal__header"><div><p className="eyebrow">{publication ? 'Редагування' : 'Нова картка'}</p><h2 id="publication-form-title">{publication ? 'Редагувати публікацію' : 'Запланувати публікацію'}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={20} /></button></header>
        <form className="publication-form" onSubmit={submit}>
          {error && <div className="form-message form-message--error publication-form__wide" role="alert">{error}</div>}
          <label className="field publication-form__wide"><span>Робоча назва</span><input name="title" defaultValue={publication?.title || ''} maxLength={200} required autoFocus placeholder="Наприклад, Огляд нової моделі" /></label>
          <label className="field publication-form__wide"><span>Опис та інструкції</span><textarea name="description" defaultValue={publication?.description || ''} rows={4} maxLength={5000} placeholder="Що важливо врахувати під час публікації" /></label>
          <DateTimePicker label="Дата й час публікації" value={publishAt} onChange={setPublishAt} required />
          <div className="field"><span>Відповідальний</span><PublicationAssigneePicker value={assignee} onChange={setAssignee} /></div>

          <section className="publication-materials publication-form__wide">
            <header><div><h3>Матеріали</h3><p>Вставте посилання на Google Docs, папки чи файли Google Drive.</p></div><span>{materials.length}</span></header>
            <div className="publication-materials__add"><textarea value={materialInput} onChange={(event) => setMaterialInput(event.target.value)} rows={2} placeholder="Вставте одне або декілька HTTPS-посилань" /><button className="button button--secondary" type="button" onClick={addMaterials}><Icon name="add" size={17} /> Додати</button></div>
            {materials.length > 0 && <div className="publication-materials__list">{materials.map((material, index) => (
              <article key={`${material.url}-${index}`}>
                <select value={material.type} onChange={(event) => setMaterials((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value as PublicationMaterialType } : item))}>{Object.entries(materialTypeLabels).map(([type, label]) => <option value={type} key={type}>{label}</option>)}</select>
                <input value={material.label} maxLength={160} onChange={(event) => setMaterials((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} aria-label="Назва матеріалу" />
                <a href={material.url} target="_blank" rel="noreferrer" title={material.url}><Icon name="openInNew" size={16} /></a>
                <button type="button" onClick={() => setMaterials((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="Видалити матеріал"><Icon name="delete" size={16} /></button>
              </article>
            ))}</div>}
          </section>

          <footer className="modal__footer publication-form__wide"><button className="button button--secondary" type="button" onClick={onClose}>Скасувати</button><button className="button button--primary" type="submit" disabled={pending}>{pending ? 'Зберігаємо…' : publication ? 'Зберегти зміни' : 'Створити картку'}</button></footer>
        </form>
      </section>
    </div>
  );
}
