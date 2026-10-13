import { useState, type FormEvent } from 'react';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import type { BannerLinkTemplate } from '../types/workspace';
import { useToast } from '../toast/ToastContext';
import { Icon } from './Icon';

export function BannerLinkTemplateManager({ templates, loading, error, onRetry, onChanged }: {
  templates: BannerLinkTemplate[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const confirm = useConfirmDialog();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [pending, setPending] = useState(false);

  const resetForm = () => { setEditingId(null); setName(''); setBaseUrl(''); };
  const edit = (template: BannerLinkTemplate) => {
    setEditingId(template.id); setName(template.name); setBaseUrl(template.baseUrl);
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    try {
      const input = { name: name.trim(), baseUrl: baseUrl.trim() };
      if (editingId) await api.banners.linkTemplates.update(editingId, input);
      else await api.banners.linkTemplates.create(input);
      await onChanged();
      showToast(editingId ? 'Шаблон оновлено.' : 'Шаблон створено.');
      resetForm();
    } catch (saveError) {
      showToast(saveError instanceof Error ? saveError.message : 'Не вдалося зберегти шаблон.', 'error');
    } finally { setPending(false); }
  };
  const remove = async (template: BannerLinkTemplate) => {
    if (!await confirm({ title: 'Видалити шаблон?', message: `Шаблон «${template.name}» буде видалено. Посилання вже створених банерів залишаться повними й незмінними.`, confirmLabel: 'Видалити', tone: 'danger' })) return;
    setPending(true);
    try {
      await api.banners.linkTemplates.remove(template.id);
      await onChanged();
      if (editingId === template.id) resetForm();
      showToast('Шаблон видалено.');
    } catch (removeError) {
      showToast(removeError instanceof Error ? removeError.message : 'Не вдалося видалити шаблон.', 'error');
    } finally { setPending(false); }
  };

  return <section className="banner-link-templates" aria-label="Шаблони посилань">
    <div className="banner-link-templates__heading"><div><strong>Шаблони посилань</strong><p>Збережіть адресу сайту й додавайте до неї лише шлях сторінки в кожному банері.</p></div><button className="button button--secondary button--small" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}><Icon name="link" size={16} /> {open ? 'Згорнути' : 'Налаштувати шаблони'}</button></div>
    {open && <div className="banner-link-templates__content">
      {loading && <p>Завантажуємо шаблони…</p>}
      {error && <p role="alert">Не вдалося завантажити шаблони. <button className="button button--secondary button--small" type="button" onClick={onRetry}>Повторити</button></p>}
      {!loading && !error && !templates.length && <p>Шаблонів поки немає.</p>}
      {!!templates.length && <ul>{templates.map((template) => <li key={template.id}><div><strong>{template.name}</strong><code>{template.baseUrl}</code></div><div><button className="button button--secondary button--small" type="button" disabled={pending} onClick={() => edit(template)}>Змінити</button><button className="button button--danger button--small" type="button" disabled={pending} onClick={() => void remove(template)}>Видалити</button></div></li>)}</ul>}
      <form className="banner-link-templates__form" onSubmit={(event) => void save(event)}><label className="field"><span>Назва шаблону</span><input value={name} maxLength={100} required onChange={(event) => setName(event.target.value)} placeholder="Наприклад, Mobile Trend" /></label><label className="field"><span>Базова адреса</span><input type="url" value={baseUrl} maxLength={2000} required onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://mobiletrend.com.ua" /></label><div><button className="button button--primary button--small" type="submit" disabled={pending || !name.trim() || !baseUrl.trim()}>{pending ? 'Зберігаємо…' : editingId ? 'Зберегти зміни' : 'Додати шаблон'}</button>{editingId && <button className="button button--secondary button--small" type="button" disabled={pending} onClick={resetForm}>Скасувати</button>}</div></form>
    </div>}
  </section>;
}
