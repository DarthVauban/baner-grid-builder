import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from './Icon';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type { MediaAsset, MediaFolder } from '../types/media';
import '../styles/media-library.css';

const acceptedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];

type FolderDialog =
  | { mode: 'create'; folder: null }
  | { mode: 'rename'; folder: MediaFolder };

type MediaUploadStatus = 'queued' | 'uploading' | 'processing' | 'success' | 'error';

interface MediaUploadItem {
  id: string;
  name: string;
  progress: number;
  status: MediaUploadStatus;
  error?: string;
}

const uploadStatusLabels: Record<MediaUploadStatus, string> = {
  queued: 'У черзі',
  uploading: 'Завантаження',
  processing: 'Обробка у WebP',
  success: 'Готово',
  error: 'Помилка'
};

let mediaUploadSequence = 0;

function createUploadItem(file: File): MediaUploadItem {
  mediaUploadSequence += 1;
  return {
    id: `${Date.now()}-${mediaUploadSequence}`,
    name: file.name,
    progress: 0,
    status: 'queued'
  };
}

function validateUploadFile(file: File) {
  if (!acceptedImageTypes.includes(file.type)) return 'Підтримуються PNG, JPG, WebP, AVIF та GIF.';
  if (file.size > 15 * 1024 * 1024) return 'Зображення має бути до 15 МБ.';
  return '';
}

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
  const completionTimers = useRef(new Set<number>());
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [uploadItems, setUploadItems] = useState<MediaUploadItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [editing, setEditing] = useState<MediaAsset | null>(null);
  const [editName, setEditName] = useState('');
  const [editAlt, setEditAlt] = useState('');
  const [folderDialog, setFolderDialog] = useState<FolderDialog | null>(null);
  const [folderName, setFolderName] = useState('');
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(() => new Set());

  const folders = useQuery({
    queryKey: ['media-library-folders', currentFolderId],
    queryFn: () => api.media.folders(currentFolderId || undefined)
  });
  const media = useQuery({
    queryKey: ['media-library', currentFolderId, search.trim(), page],
    queryFn: () => api.media.list({
      search: search.trim() || undefined,
      folderId: currentFolderId || undefined,
      page,
      pageSize: 30
    })
  });
  const update = useMutation({
    mutationFn: ({ id, name, altText }: { id: string; name: string; altText: string }) => api.media.update(id, { name, altText })
  });
  const remove = useMutation({ mutationFn: api.media.remove });
  const removeMany = useMutation({ mutationFn: api.media.removeMany });
  const selectFolderAssets = useMutation({
    mutationFn: () => api.media.selection(currentFolderId || undefined)
  });
  const createFolder = useMutation({ mutationFn: api.media.createFolder });
  const renameFolder = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.media.updateFolder(id, name)
  });
  const removeFolder = useMutation({ mutationFn: api.media.removeFolder });

  useEffect(() => () => {
    completionTimers.current.forEach((timer) => window.clearTimeout(timer));
    completionTimers.current.clear();
  }, []);

  function openFolder(folderId: string | null) {
    setCurrentFolderId(folderId);
    setSearch('');
    setPage(1);
    setSelectedAssetIds(new Set());
  }

  function updateUploadItem(id: string, input: Partial<MediaUploadItem>) {
    setUploadItems((items) => items.map((item) => item.id === id ? { ...item, ...input } : item));
  }

  function scheduleCompletedUploadRemoval(id: string) {
    const timer = window.setTimeout(() => {
      setUploadItems((items) => items.filter((item) => item.id !== id));
      completionTimers.current.delete(timer);
    }, 1600);
    completionTimers.current.add(timer);
  }

  async function uploadOne(file: File, item: MediaUploadItem) {
    updateUploadItem(item.id, { status: 'uploading', progress: 0 });
    try {
      const asset = await api.media.upload(file, (progress) => {
        updateUploadItem(item.id, {
          progress,
          status: progress >= 99 ? 'processing' : 'uploading'
        });
      }, currentFolderId || undefined);
      updateUploadItem(item.id, { status: 'success', progress: 100 });
      scheduleCompletedUploadRemoval(item.id);
      return asset;
    } catch (error) {
      updateUploadItem(item.id, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Не вдалося завантажити зображення.'
      });
      return null;
    }
  }

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    const entries = files.map((file) => ({ file, item: createUploadItem(file), error: validateUploadFile(file) }));
    setUploadItems((items) => [...items, ...entries.map(({ item, error }) => error
      ? { ...item, status: 'error' as const, error }
      : item)]);
    if (inputRef.current) inputRef.current.value = '';

    const validEntries = entries.filter((entry) => !entry.error);
    const uploadedAssets: MediaAsset[] = [];
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(3, validEntries.length) }, async () => {
      while (nextIndex < validEntries.length) {
        const entry = validEntries[nextIndex];
        nextIndex += 1;
        const asset = await uploadOne(entry.file, entry.item);
        if (asset) uploadedAssets.push(asset);
      }
    });
    await Promise.all(workers);
    if (uploadedAssets.length) await queryClient.invalidateQueries({ queryKey: ['media-library'] });

    if (files.length === 1 && uploadedAssets[0]) {
      showToast(`«${files[0].name}» конвертовано у WebP і збережено.`);
      onSelect?.(uploadedAssets[0]);
      return;
    }
    if (uploadedAssets.length === files.length) {
      showToast(`Завантажено й оброблено файлів: ${uploadedAssets.length}.`);
    } else {
      showToast(`Завантажено ${uploadedAssets.length} із ${files.length} файлів. Перевірте помилки у списку.`, 'error');
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
      setSelectedAssetIds((current) => {
        const next = new Set(current);
        next.delete(asset.id);
        return next;
      });
      showToast('Зображення видалено.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося видалити зображення.', 'error');
    }
  }

  function toggleAssetSelection(assetId: string) {
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  }

  async function selectAllInFolder() {
    try {
      const result = await selectFolderAssets.mutateAsync();
      setSelectedAssetIds(new Set(result.ids));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося виділити файли папки.', 'error');
    }
  }

  async function deleteSelectedAssets() {
    const ids = [...selectedAssetIds];
    if (!ids.length) return;
    const approved = await confirm({
      title: 'Видалити вибрані файли?',
      message: `Буде безповоротно видалено файлів: ${ids.length}. Посилання на них перестануть працювати.`,
      confirmLabel: `Видалити (${ids.length})`,
      tone: 'danger'
    });
    if (!approved) return;
    try {
      const result = await removeMany.mutateAsync(ids);
      setSelectedAssetIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ['media-library'] });
      showToast(`Видалено файлів: ${result.deleted}.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося видалити вибрані файли.', 'error');
    }
  }

  function openCreateFolder() {
    setFolderName('');
    setFolderDialog({ mode: 'create', folder: null });
  }

  function openRenameFolder(folder: MediaFolder) {
    setFolderName(folder.name);
    setFolderDialog({ mode: 'rename', folder });
  }

  async function saveFolder() {
    const name = folderName.trim();
    if (!folderDialog || !name) return;
    try {
      if (folderDialog.mode === 'create') {
        await createFolder.mutateAsync({ name, parentId: currentFolderId });
        showToast(`Папку «${name}» створено.`);
      } else {
        await renameFolder.mutateAsync({ id: folderDialog.folder.id, name });
        showToast('Папку перейменовано.');
      }
      await queryClient.invalidateQueries({ queryKey: ['media-library-folders'] });
      setFolderDialog(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти папку.', 'error');
    }
  }

  async function deleteFolder(folder: MediaFolder) {
    const approved = await confirm({
      title: 'Видалити папку?',
      message: `Папку «${folder.name}» буде видалено. Це можливо лише тоді, коли в ній немає файлів і вкладених папок.`,
      confirmLabel: 'Видалити',
      tone: 'danger'
    });
    if (!approved) return;
    try {
      await removeFolder.mutateAsync(folder.id);
      await queryClient.invalidateQueries({ queryKey: ['media-library-folders'] });
      showToast('Папку видалено.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося видалити папку.', 'error');
    }
  }

  const feed = media.data;
  const folderFeed = folders.data;
  const visibleFolders = (folderFeed?.items || []).filter((folder) => (
    !search.trim() || folder.name.toLocaleLowerCase('uk-UA').includes(search.trim().toLocaleLowerCase('uk-UA'))
  ));
  const pageCount = Math.max(1, Math.ceil((feed?.total || 0) / (feed?.pageSize || 30)));
  const isLoading = media.isLoading || folders.isLoading;
  const loadError = media.error || folders.error;
  const hasContent = visibleFolders.length > 0 || Boolean(feed?.items.length);
  const currentFolder = folderFeed?.breadcrumbs.at(-1);
  const folderBusy = createFolder.isPending || renameFolder.isPending;

  return <div className="media-library-browser">
    <section
      className={`media-upload-zone${dragActive ? ' media-upload-zone--active' : ''}`}
      onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false); }}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        void uploadFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <span className="media-upload-zone__icon"><Icon name="upload" size={27} /></span>
      <div>
        <strong>Перетягніть одне або кілька зображень сюди</strong>
        <small>PNG, JPG, WebP, AVIF або GIF до 15 МБ. Файли автоматично стануть WebP{currentFolder ? ` і потраплять у «${currentFolder.name}»` : ''}.</small>
      </div>
      <button className="button button--primary" type="button" onClick={() => inputRef.current?.click()}>
        <Icon name="upload" size={18} /> Вибрати файли
      </button>
      <input
        ref={inputRef}
        className="media-upload-input"
        type="file"
        multiple
        accept={acceptedImageTypes.join(',')}
        aria-label="Завантажити зображення"
        onChange={(event) => void uploadFiles(Array.from(event.target.files || []))}
      />
    </section>

    {uploadItems.length > 0 && <section className="media-upload-list" aria-label="Прогрес завантаження файлів" aria-live="polite">
      {uploadItems.map((item) => <article className={`media-upload-row media-upload-row--${item.status}`} key={item.id}>
        <div className="media-upload-row__heading">
          <strong title={item.name}>{item.name}</strong>
          <span>{uploadStatusLabels[item.status]} · {Math.round(item.progress)}%</span>
        </div>
        <progress aria-label={`Завантаження ${item.name}`} max={100} value={item.progress}>{item.progress}%</progress>
        {item.error && <small>{item.error}</small>}
        {item.status === 'error' && <button className="icon-button" type="button" aria-label={`Прибрати ${item.name}`} onClick={() => setUploadItems((items) => items.filter((candidate) => candidate.id !== item.id))}><Icon name="close" size={16} /></button>}
      </article>)}
    </section>}

    <div className="media-folder-navigation">
      <nav className="media-folder-breadcrumbs" aria-label="Шлях у файловому сховищі">
        <button type="button" className={!currentFolderId ? 'is-current' : ''} onClick={() => openFolder(null)}><Icon name="storage" size={16} /> Сховище</button>
        {(folderFeed?.breadcrumbs || []).map((folder) => <span key={folder.id}>
          <Icon name="chevronRight" size={14} />
          <button type="button" className={folder.id === currentFolderId ? 'is-current' : ''} onClick={() => openFolder(folder.id)}>{folder.name}</button>
        </span>)}
      </nav>
      <button className="button button--secondary button--small" type="button" onClick={openCreateFolder}><Icon name="add" size={17} /> Нова папка</button>
    </div>

    <div className="media-library-toolbar">
      <label className="media-library-search"><Icon name="search" size={18} /><input value={search} placeholder="Пошук у поточній папці" aria-label="Пошук зображень і папок" onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
      <span>{visibleFolders.length} папок · {feed?.total || 0} зображень</span>
    </div>

    {selectedAssetIds.size > 0 && <div className="media-library-selection" role="toolbar" aria-label="Дії з вибраними файлами">
      <strong><Icon name="check" size={17} /> Вибрано: {selectedAssetIds.size}</strong>
      <div>
        <button className="button button--secondary button--small" type="button" disabled={selectFolderAssets.isPending} onClick={() => void selectAllInFolder()}>
          {selectFolderAssets.isPending ? 'Виділяємо…' : 'Виділити усі'}
        </button>
        <button className="button button--secondary button--small" type="button" onClick={() => setSelectedAssetIds(new Set())}>Зняти виділення</button>
        <button className="button button--danger button--small" type="button" disabled={removeMany.isPending} onClick={() => void deleteSelectedAssets()}><Icon name="delete" size={16} /> {removeMany.isPending ? 'Видаляємо…' : `Видалити (${selectedAssetIds.size})`}</button>
      </div>
    </div>}

    {isLoading && <div className="media-library-state"><span className="loading-screen__pulse" /><p>Завантажуємо файли…</p></div>}
    {!isLoading && loadError && <div className="media-library-state media-library-state--error"><p>{loadError instanceof Error ? loadError.message : 'Не вдалося завантажити сховище.'}</p><button className="button button--secondary" type="button" onClick={() => { void media.refetch(); void folders.refetch(); }}>Спробувати ще</button></div>}
    {!isLoading && !loadError && !hasContent && <div className="media-library-state"><span className="media-library-state__icon"><Icon name={search ? 'search' : 'folder'} size={30} /></span><h3>{search ? 'Нічого не знайдено' : 'Ця папка порожня'}</h3><p>{search ? 'Змініть пошуковий запит.' : 'Створіть вкладену папку або завантажте перше зображення.'}</p></div>}

    {visibleFolders.length > 0 && <div className="media-folder-grid">
      {visibleFolders.map((folder) => <article className="media-folder-card" key={folder.id}>
        <button className="media-folder-card__open" type="button" onClick={() => openFolder(folder.id)}>
          <span className="media-folder-card__icon"><Icon name="folder" size={28} /></span>
          <span><strong title={folder.name}>{folder.name}</strong><small>Папка</small></span>
        </button>
        <div className="media-folder-card__actions">
          <button className="icon-button" type="button" title="Перейменувати" aria-label={`Перейменувати папку ${folder.name}`} onClick={() => openRenameFolder(folder)}><Icon name="edit" size={17} /></button>
          <button className="icon-button icon-button--danger" type="button" title="Видалити" aria-label={`Видалити папку ${folder.name}`} onClick={() => void deleteFolder(folder)}><Icon name="delete" size={17} /></button>
        </div>
      </article>)}
    </div>}

    {Boolean(feed?.items.length) && <div className="media-library-grid">
      {feed!.items.map((asset) => <article className={`media-asset-card${selectedAssetIds.has(asset.id) ? ' media-asset-card--selected' : ''}`} key={asset.id}>
        <label className="media-asset-card__select" title={`Виділити ${asset.name}`}>
          <input type="checkbox" checked={selectedAssetIds.has(asset.id)} aria-label={`Виділити ${asset.name}`} onChange={() => toggleAssetSelection(asset.id)} />
          <span><Icon name="check" size={13} /></span>
        </label>
        <div className="media-asset-card__preview"><img src={asset.url} alt={asset.altText || asset.name} loading="lazy" /></div>
        <div className="media-asset-card__body">
          <div className="media-asset-card__details">
            <strong title={asset.name}>{asset.name}</strong>
            <span>{asset.width}×{asset.height} · {formatBytes(asset.size)} · WebP</span>
            <small>{asset.createdBy?.name || 'Системний файл'} · {new Date(asset.createdAt).toLocaleDateString('uk-UA')}</small>
          </div>
          <div className="media-asset-card__actions">
            {onSelect && <button className="button button--primary media-asset-card__insert" type="button" onClick={() => onSelect(asset)}><Icon name="check" size={16} /> Вставити</button>}
            <div className="media-asset-card__tools">
              <button className="icon-button" type="button" title="Копіювати URL" aria-label={`Копіювати URL ${asset.name}`} onClick={() => void copyUrl(asset)}><Icon name="copy" size={17} /></button>
              <button className="icon-button" type="button" title="Редагувати" aria-label={`Редагувати ${asset.name}`} onClick={() => openEdit(asset)}><Icon name="edit" size={17} /></button>
              <button className="icon-button icon-button--danger" type="button" title="Видалити" aria-label={`Видалити ${asset.name}`} onClick={() => void deleteAsset(asset)}><Icon name="delete" size={17} /></button>
            </div>
          </div>
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

    {folderDialog && <div className="modal-backdrop modal-backdrop--nested" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setFolderDialog(null); }}>
      <section className="modal media-folder-modal" role="dialog" aria-modal="true" aria-labelledby="media-folder-title">
        <header className="modal__header"><div><p className="eyebrow">Файлове сховище</p><h2 id="media-folder-title">{folderDialog.mode === 'create' ? 'Нова папка' : 'Перейменувати папку'}</h2></div><button className="icon-button" type="button" onClick={() => setFolderDialog(null)} aria-label="Закрити"><Icon name="close" size={21} /></button></header>
        <div className="media-folder-modal__body">
          <label className="field"><span>Назва папки</span><input value={folderName} maxLength={120} autoFocus onChange={(event) => setFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void saveFolder(); }} /></label>
          <div className="modal__footer"><button className="button button--secondary" type="button" onClick={() => setFolderDialog(null)}>Скасувати</button><button className="button button--primary" type="button" disabled={!folderName.trim() || folderBusy} onClick={() => void saveFolder()}>{folderDialog.mode === 'create' ? 'Створити' : 'Зберегти'}</button></div>
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
