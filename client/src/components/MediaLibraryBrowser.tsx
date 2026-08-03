import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from './Icon';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type { MediaAsset } from '../types/media';
import '../styles/media-library.css';

const acceptedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];

export function resolveMediaAssetUrl(url: string) {
  try {
    return new URL(url, window.location.origin).href;
  } catch {
    return url;
  }
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`;
  return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
}

export function MediaLibraryBrowser({ onSelect }: { onSelect?: (asset: MediaAsset) => void }) {
  const { showToast } = useToast();
  const confirm = useConfirmDialog();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [editing, setEditing] = useState<MediaAsset | null>(null);
  const [editName, setEditName] = useState('');
  const [editAlt, setEditAlt] = useState('');

  const media = useQuery({
    queryKey: ['media-library', search.trim(), page],
    queryFn: () => api.media.list({ search: search.trim() || undefined, page, pageSize: 30 })
  });
  const update = useMutation({
    mutationFn: ({ id, name, altText }: { id: string; name: string; altText: string }) => api.media.update(id, { name, altText })
  });
  const remove = useMutation({ mutationFn: api.media.remove });

  async function uploadFile(file: File) {
    if (!acceptedImageTypes.includes(file.type)) {
      showToast('Підтримуються PNG, JPG, WebP, AVIF та GIF.', 'error');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      showToast('Зображення має бути до 15 МБ.', 'error');
      return;
    }
    setUploadProgress(0);
    try {
      const asset = await api.media.upload(file, setUploadProgress);
      await queryClient.invalidateQueries({ queryKey: ['media-library'] });
      showToast(`«${file.name}» конвертовано у WebP і збережено.`);
      onSelect?.(asset);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося завантажити зображення.', 'error');
    } finally {
      setUploadProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function copyUrl(asset: MediaAsset) {
    try {
      await navigator.clipboard.writeText(resolveMediaAssetUrl(asset.url));
      showToast('Посилання на зображення скопійовано.');
    } catch {
      showToast('Не вдалося скопіювати посилання.', 'error');
    }
  }

  function openEdit(asset: MediaAsset) {
    setEditing(asset);
    setEditName(asset.name);
    setEditAlt(asset.altText);
  }

  async function saveEdit() {
    if (!editing || !editName.trim()) return;
    try {
      await update.mutateAsync({ id: editing.id, name: editName.trim(), altText: editAlt.trim() });
      await queryClient.invalidateQueries({ queryKey: ['media-library'] });
      setEditing(null);
      showToast('Дані зображення оновлено.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося оновити зображення.', 'error');
    }
  }

  async function deleteAsset(asset: MediaAsset) {
    const approved = await confirm({
      title: 'Видалити зображення?',
      message: `Файл «${asset.name}» буде видалено зі сховища. Посилання на нього перестане працювати.`,
      confirmLabel: 'Видалити',
      tone: 'danger'
    });
    if (!approved) return;
    try {
      await remove.mutateAsync(asset.id);
      await queryClient.invalidateQueries({ queryKey: ['media-library'] });
      showToast('Зображення видалено.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося видалити зображення.', 'error');
    }
  }

  const feed = media.data;
  const pageCount = Math.max(1, Math.ceil((feed?.total || 0) / (feed?.pageSize || 30)));

  return <div className="media-library-browser">
    <section
      className={`media-upload-zone${dragActive ? ' media-upload-zone--active' : ''}`}
      onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false); }}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        const file = event.dataTransfer.files[0];
        if (file) void uploadFile(file);
      }}
    >
      <span className="media-upload-zone__icon"><Icon name="upload" size={27} /></span>
      <div><strong>Перетягніть зображення сюди</strong><small>PNG, JPG, WebP, AVIF або GIF до 15 МБ. Файл автоматично стане WebP.</small></div>
      <button className="button button--primary" type="button" disabled={uploadProgress !== null} onClick={() => inputRef.current?.click()}>
        <Icon name="upload" size={18} /> {uploadProgress === null ? 'Завантажити' : `Обробка ${uploadProgress}%`}
      </button>
      <input
        ref={inputRef}
        className="media-upload-input"
        type="file"
        accept={acceptedImageTypes.join(',')}
        aria-label="Завантажити зображення"
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); }}
      />
      {uploadProgress !== null && <span className="media-upload-progress"><i style={{ width: `${uploadProgress}%` }} /></span>}
    </section>

    <div className="media-library-toolbar">
      <label className="media-library-search"><Icon name="search" size={18} /><input value={search} placeholder="Пошук за назвою або alt-текстом" aria-label="Пошук зображень" onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
      <span>{feed?.total || 0} зображень</span>
    </div>

    {media.isLoading && <div className="media-library-state"><span className="loading-screen__pulse" /><p>Завантажуємо файли…</p></div>}
    {media.isError && <div className="media-library-state media-library-state--error"><p>{media.error instanceof Error ? media.error.message : 'Не вдалося завантажити сховище.'}</p><button className="button button--secondary" type="button" onClick={() => void media.refetch()}>Спробувати ще</button></div>}
    {!media.isLoading && !media.isError && !feed?.items.length && <div className="media-library-state"><span className="media-library-state__icon"><Icon name="image" size={30} /></span><h3>{search ? 'Нічого не знайдено' : 'Сховище поки порожнє'}</h3><p>{search ? 'Змініть пошуковий запит.' : 'Завантажте перше зображення — воно одразу буде оптимізоване.'}</p></div>}

    {Boolean(feed?.items.length) && <div className="media-library-grid">
      {feed!.items.map((asset) => <article className="media-asset-card" key={asset.id}>
        <div className="media-asset-card__preview"><img src={asset.url} alt={asset.altText || asset.name} loading="lazy" /></div>
        <div className="media-asset-card__body">
          <strong title={asset.name}>{asset.name}</strong>
          <span>{asset.width}×{asset.height} · {formatBytes(asset.size)} · WebP</span>
          <small>{asset.createdBy?.name || 'Системний файл'} · {new Date(asset.createdAt).toLocaleDateString('uk-UA')}</small>
        </div>
        <div className="media-asset-card__actions">
          {onSelect && <button className="button button--primary" type="button" onClick={() => onSelect(asset)}><Icon name="check" size={16} /> Вставити</button>}
          <button className="icon-button" type="button" title="Копіювати URL" aria-label={`Копіювати URL ${asset.name}`} onClick={() => void copyUrl(asset)}><Icon name="copy" size={17} /></button>
          <button className="icon-button" type="button" title="Редагувати" aria-label={`Редагувати ${asset.name}`} onClick={() => openEdit(asset)}><Icon name="edit" size={17} /></button>
          <button className="icon-button icon-button--danger" type="button" title="Видалити" aria-label={`Видалити ${asset.name}`} onClick={() => void deleteAsset(asset)}><Icon name="delete" size={17} /></button>
        </div>
      </article>)}
    </div>}

    {pageCount > 1 && <nav className="media-library-pagination" aria-label="Сторінки файлового сховища">
      <button className="button button--secondary" type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Назад</button>
      <span>Сторінка {page} з {pageCount}</span>
      <button className="button button--secondary" type="button" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Далі</button>
    </nav>}

    {editing && <div className="modal-backdrop modal-backdrop--nested" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setEditing(null); }}>
      <section className="modal media-edit-modal" role="dialog" aria-modal="true" aria-labelledby="media-edit-title">
        <header className="modal__header"><div><p className="eyebrow">Метадані</p><h2 id="media-edit-title">Редагувати зображення</h2></div><button className="icon-button" type="button" onClick={() => setEditing(null)} aria-label="Закрити"><Icon name="close" size={21} /></button></header>
        <div className="media-edit-modal__body">
          <label className="field"><span>Назва файлу</span><input value={editName} maxLength={255} onChange={(event) => setEditName(event.target.value)} /></label>
          <label className="field"><span>Alt-текст</span><textarea value={editAlt} rows={3} maxLength={500} onChange={(event) => setEditAlt(event.target.value)} /></label>
          <div className="modal__footer"><button className="button button--secondary" type="button" onClick={() => setEditing(null)}>Скасувати</button><button className="button button--primary" type="button" disabled={!editName.trim() || update.isPending} onClick={() => void saveEdit()}>Зберегти</button></div>
        </div>
      </section>
    </div>}
  </div>;
}

export function MediaPickerDialog({ onClose, onSelect }: { onClose: () => void; onSelect: (asset: MediaAsset) => void }) {
  return <div className="modal-backdrop media-picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="modal media-picker-modal" role="dialog" aria-modal="true" aria-labelledby="media-picker-title">
      <header className="modal__header"><div><p className="eyebrow">Файлове сховище</p><h2 id="media-picker-title">Виберіть зображення</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" size={21} /></button></header>
      <div className="media-picker-modal__body"><MediaLibraryBrowser onSelect={(asset) => { onSelect(asset); onClose(); }} /></div>
    </section>
  </div>;
}
