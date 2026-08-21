import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { ApiError, api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type { HoroshopCatalogVisibility } from '../types/horoshop-catalog';
import type {
  HoroshopPhotoAsset,
  HoroshopPhotoBatch,
  HoroshopPhotoDesktopDevice,
  HoroshopPhotoDesktopPairing,
  HoroshopPhotoDraft,
  HoroshopPhotoPublicationMode,
  HoroshopPhotoPublishProgress,
  HoroshopPhotoPublishResult,
  HoroshopPhotoSelection,
  HoroshopPhotoSelectionSummary,
  HoroshopPhotoSelectionProduct
} from '../types/horoshop-photo';
import '../styles/horoshop-photo-parser.css';

const photoTargetPageSize = 10;

function batchComplete(batch: HoroshopPhotoBatch | null | undefined) {
  return batch?.status === 'completed';
}

function statusLabel(draft: HoroshopPhotoDraft) {
  if (draft.parseStatus === 'queued') return 'У черзі';
  if (draft.parseStatus === 'running') return 'Парсинг';
  if (draft.parseStatus === 'ready') return 'Готово';
  if (draft.parseStatus === 'partial') return 'Частково';
  if (draft.parseStatus === 'failed') return 'Помилка';
  return 'Ще не оброблялось';
}

function publishLabel(draft: HoroshopPhotoDraft) {
  if (draft.publishStatus === 'publishing') return 'Публікується';
  if (draft.publishStatus === 'published') return 'Передано';
  if (draft.publishStatus === 'failed') return 'Не передано';
  return 'Чернетка';
}

function draftIsPublishable(draft: HoroshopPhotoDraft) {
  return Boolean(draft.id)
    && (draft.parseStatus === 'ready' || draft.parseStatus === 'partial')
    && draft.publishStatus !== 'published'
    && draft.publishStatus !== 'publishing'
    && draft.assets.some((asset) => asset.selected);
}

function publishResultHasFailures(result: HoroshopPhotoPublishResult) {
  return result.failedDrafts > 0 || result.failedArticles > 0 || result.failures.length > 0;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`;
  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
}

function BatchProgress({ batch }: { batch: HoroshopPhotoBatch }) {
  const completed = batch.counts.success + batch.counts.partial + batch.counts.failed;
  const total = batch.items.length || batch.requestedCount;
  const percent = total ? Math.min(100, Math.round((completed / total) * 100)) : 100;
  return <section className={`horoshop-photo-progress${batchComplete(batch) ? ' is-complete' : ''}`}>
    <header>
      <div>
        <strong>{batchComplete(batch) ? 'Обробку на десктопі завершено' : 'Десктопний парсер обробляє вибірку'}</strong>
        <span>{completed} із {total} позицій</span>
      </div>
      <b>{percent}%</b>
    </header>
    <div className="horoshop-photo-progress__track"><span style={{ width: `${percent}%` }} /></div>
    <footer>
      <span>Успішно: {batch.counts.success}</span>
      <span>Частково: {batch.counts.partial}</span>
      <span>Помилки: {batch.counts.failed}</span>
      <span>У черзі: {batch.counts.queued + batch.counts.running}</span>
    </footer>
  </section>;
}

function AssetGallery({
  draft,
  disabled,
  onChange
}: {
  draft: HoroshopPhotoDraft;
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  const ordered = [...draft.assets].sort((left, right) => left.sortOrder - right.sortOrder);
  const selected = ordered.filter((asset) => asset.selected);
  const selectedIds = selected.map((asset) => asset.id);

  function toggle(asset: HoroshopPhotoAsset) {
    onChange(asset.selected
      ? selectedIds.filter((id) => id !== asset.id)
      : [...selectedIds, asset.id]);
  }

  function move(assetId: string, direction: -1 | 1) {
    const index = selectedIds.indexOf(assetId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= selectedIds.length) return;
    const next = [...selectedIds];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
  }

  if (!ordered.length) return null;
  return <div className="horoshop-photo-assets">
    {ordered.map((asset) => {
      const selectedIndex = selectedIds.indexOf(asset.id);
      return <article className={`horoshop-photo-asset${asset.selected ? ' is-selected' : ''}`} key={asset.id}>
        <button type="button" className="horoshop-photo-asset__toggle" disabled={disabled} onClick={() => toggle(asset)}>
          <img src={asset.url} alt="" loading="lazy" />
          <span><Icon name={asset.selected ? 'check' : 'add'} size={15} /></span>
        </button>
        <small>{asset.width}×{asset.height} · {formatBytes(asset.size)}</small>
        {asset.selected && <div className="horoshop-photo-asset__order">
          <button type="button" disabled={disabled || selectedIndex <= 0} onClick={() => move(asset.id, -1)} aria-label="Перемістити фото ліворуч"><Icon name="chevronLeft" size={16} /></button>
          <b>{selectedIndex + 1}</b>
          <button type="button" disabled={disabled || selectedIndex >= selectedIds.length - 1} onClick={() => move(asset.id, 1)} aria-label="Перемістити фото праворуч"><Icon name="chevronRight" size={16} /></button>
        </div>}
      </article>;
    })}
  </div>;
}

function DraftRow({
  label,
  sku,
  imageUrl,
  canonicalUrl,
  draft,
  busy,
  onAssetsChange,
  onPublish
}: {
  label: string;
  sku: string;
  imageUrl: string;
  canonicalUrl: string;
  draft: HoroshopPhotoDraft;
  busy: boolean;
  onAssetsChange: (ids: string[]) => void;
  onPublish: () => void;
}) {
  const ready = draft.parseStatus === 'ready' || draft.parseStatus === 'partial';
  return <section className="horoshop-photo-target">
    <div className="horoshop-photo-target__identity">
      <span className="horoshop-photo-target__image">
        {imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <Icon name="savedBanners" size={20} />}
      </span>
      <div>
        <strong>{label}</strong>
        <small>{sku}</small>
        {canonicalUrl && <a className="horoshop-photo-target__link" href={canonicalUrl} target="_blank" rel="noreferrer">
          <Icon name="openInNew" size={13} /> Хорошоп
        </a>}
      </div>
    </div>
    {draft.sourceUrl && <a className="horoshop-photo-target__source-link" href={draft.sourceUrl} target="_blank" rel="noreferrer">
      <Icon name="openInNew" size={14} /> Джерело, вибране у десктопному парсері
    </a>}
    <div className="horoshop-photo-target__states">
      <span className={`horoshop-photo-status is-${draft.parseStatus}`}>{statusLabel(draft)}</span>
      <span className={`horoshop-photo-publish-status is-${draft.publishStatus}`}>{publishLabel(draft)}</span>
    </div>
    {draft.errorMessage && <p className="horoshop-photo-target__error">{draft.errorMessage}</p>}
    {draft.currentImages.length > 0 && <details className="horoshop-photo-current">
      <summary>Поточні фото у Хорошопі: {draft.currentImages.length}</summary>
      <div>{draft.currentImages.map((url) => <img src={url} alt="" loading="lazy" key={url} />)}</div>
    </details>}
    <AssetGallery draft={draft} disabled={busy} onChange={onAssetsChange} />
    {ready && draft.assets.some((asset) => asset.selected) && draft.publishStatus !== 'published' && <footer className="horoshop-photo-target__footer">
      <span>Обрано фото: {draft.assets.filter((asset) => asset.selected).length}</span>
      <button className="button button--primary button--small" type="button" disabled={busy || !draftIsPublishable(draft)} onClick={onPublish}>
        <Icon name="upload" size={16} /> Передати в Хорошоп
      </button>
    </footer>}
  </section>;
}

interface PhotoTarget {
  key: string;
  label: string;
  sku: string;
  imageUrl: string;
  canonicalUrl: string;
  draft: HoroshopPhotoDraft;
}

function targetTitle(title: string, sku: string, fallbackTitle = '') {
  const normalizedSku = sku.trim().toLocaleLowerCase('uk-UA');
  for (const candidate of [title, fallbackTitle]) {
    const normalized = candidate.trim();
    if (normalized && normalized.toLocaleLowerCase('uk-UA') !== normalizedSku) return normalized;
  }
  return 'Назва товару не вказана';
}

function flattenPhotoTargets(products: HoroshopPhotoSelectionProduct[]) {
  const targets: PhotoTarget[] = [];
  for (const product of products) {
    if (product.modifications.length) {
      for (const modification of product.modifications) targets.push({
        key: `${product.id}:${modification.id}`,
        label: targetTitle(modification.title, modification.sku, product.title),
        sku: modification.sku,
        imageUrl: modification.imageUrl || product.imageUrl,
        canonicalUrl: product.canonicalUrl,
        draft: modification.draft
      });
      continue;
    }
    if (product.commonDraft) targets.push({
      key: `${product.id}:product`,
      label: targetTitle(product.title, product.sku),
      sku: product.sku,
      imageUrl: product.imageUrl,
      canonicalUrl: product.canonicalUrl,
      draft: product.commonDraft
    });
  }
  return targets;
}

function selectionHasActiveDrafts(selection: HoroshopPhotoSelection | undefined) {
  return Boolean(selection?.products.some((product) => {
    const drafts = [product.commonDraft, ...product.modifications.map((modification) => modification.draft)];
    return drafts.some((draft) => draft?.parseStatus === 'queued' || draft?.parseStatus === 'running');
  }));
}

function ProductTarget({
  target,
  busyDraftIds,
  onAssetsChange,
  onPublish
}: {
  target: PhotoTarget;
  busyDraftIds: Set<string>;
  onAssetsChange: (draft: HoroshopPhotoDraft, ids: string[]) => void;
  onPublish: (draft: HoroshopPhotoDraft) => void;
}) {
  const busyKey = target.draft.id || target.key;
  return <DraftRow
    label={target.label}
    sku={target.sku}
    imageUrl={target.imageUrl}
    canonicalUrl={target.canonicalUrl}
    draft={target.draft}
    busy={busyDraftIds.has(busyKey)}
    onAssetsChange={(ids) => onAssetsChange(target.draft, ids)}
    onPublish={() => onPublish(target.draft)}
  />;
}

function TargetPager({
  page,
  pageCount,
  total,
  onChange
}: {
  page: number;
  pageCount: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  const first = (page - 1) * photoTargetPageSize + 1;
  const last = Math.min(page * photoTargetPageSize, total);
  return <nav className="horoshop-photo-target-pager" aria-label="Сторінки товарів вибірки">
    <span>Показано {first}–{last} із {total}</span>
    <div>
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Попередні товари">
        <Icon name="chevronLeft" size={16} />
      </button>
      <b>{page} / {pageCount}</b>
      <button type="button" disabled={page >= pageCount} onClick={() => onChange(page + 1)} aria-label="Наступні товари">
        <Icon name="chevronRight" size={16} />
      </button>
    </div>
  </nav>;
}

export function HoroshopPhotoParserPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const confirm = useConfirmDialog();
  const [selectionId, setSelectionId] = useState('');
  const [selectionMode, setSelectionMode] = useState<'list' | 'filter'>('list');
  const [selectionName, setSelectionName] = useState('');
  const [selectionInput, setSelectionInput] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterAvailability, setFilterAvailability] = useState('');
  const [filterVisibility, setFilterVisibility] = useState<HoroshopCatalogVisibility>('all');
  const [busyDraftIds, setBusyDraftIds] = useState<Set<string>>(() => new Set());
  const [batchId, setBatchId] = useState('');
  const [desktopPairing, setDesktopPairing] = useState<HoroshopPhotoDesktopPairing | null>(null);
  const [publicationMode, setPublicationMode] = useState<HoroshopPhotoPublicationMode>('replace');
  const [publishProgress, setPublishProgress] = useState<HoroshopPhotoPublishProgress | null>(null);
  const [publishOutcome, setPublishOutcome] = useState<HoroshopPhotoPublishResult | null>(null);
  const [targetPage, setTargetPage] = useState(1);
  const completedBatch = useRef('');
  const synchronizedBatchRevision = useRef('');
  const previousSelectionId = useRef('');

  const selections = useQuery({ queryKey: ['horoshop-photo-selections'], queryFn: api.horoshopPhotos.selections });
  const desktopDevices = useQuery({
    queryKey: ['horoshop-photo-desktop-devices'],
    queryFn: api.horoshopPhotos.desktopDevices,
    refetchInterval: 2_000,
    refetchIntervalInBackground: true
  });
  const selection = useQuery({
    queryKey: ['horoshop-photo-selection', selectionId],
    queryFn: ({ signal }) => api.horoshopPhotos.selection(selectionId, signal),
    enabled: Boolean(selectionId),
    refetchInterval: (query) => selectionHasActiveDrafts(query.state.data) ? 1_000 : false,
    refetchIntervalInBackground: true
  });
  const activeBatch = useQuery({
    queryKey: ['horoshop-photo-active-batch', selectionId],
    queryFn: () => api.horoshopPhotos.activeBatch(selectionId),
    enabled: Boolean(selectionId) && !batchId,
    refetchInterval: 2_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false
  });
  const filterCatalog = useQuery({
    queryKey: ['horoshop-photo-filter-catalog', filterSearch, filterCategory, filterAvailability, filterVisibility],
    queryFn: ({ signal }) => api.horoshopCatalog.list({
      search: filterSearch,
      category: filterCategory,
      availability: filterAvailability,
      visibility: filterVisibility,
      state: 'active',
      page: 1,
      pageSize: 10
    }, signal),
    enabled: selectionMode === 'filter'
  });
  const batch = useQuery({
    queryKey: ['horoshop-photo-batch', batchId],
    queryFn: () => api.horoshopPhotos.batch(batchId),
    enabled: Boolean(batchId),
    refetchInterval: (query) => batchComplete(query.state.data) ? false : 1_500,
    refetchIntervalInBackground: true
  });
  const createSelection = useMutation({ mutationFn: api.horoshopPhotos.createSelection });
  const createFilteredSelection = useMutation({ mutationFn: api.horoshopPhotos.createFilteredSelection });
  const createDesktopPairing = useMutation({ mutationFn: api.horoshopPhotos.createDesktopPairing });
  const parseSelection = useMutation({ mutationFn: api.horoshopPhotos.parseSelection });
  const publishSelection = useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: HoroshopPhotoPublicationMode }) =>
      api.horoshopPhotos.publishSelection(id, mode, setPublishProgress)
  });
  const photoTargets = useMemo(() => flattenPhotoTargets(selection.data?.products || []), [selection.data?.products]);
  const targetPageCount = Math.max(1, Math.ceil(photoTargets.length / photoTargetPageSize));
  const visiblePhotoTargets = useMemo(() => {
    const offset = (targetPage - 1) * photoTargetPageSize;
    return photoTargets.slice(offset, offset + photoTargetPageSize);
  }, [photoTargets, targetPage]);
  const connectedDevices = useMemo(
    () => (desktopDevices.data || []).filter((device) => !device.revokedAt),
    [desktopDevices.data]
  );

  useEffect(() => {
    if (!selectionId && selections.data?.[0]?.id) setSelectionId(selections.data[0].id);
  }, [selectionId, selections.data]);

  useEffect(() => setTargetPage(1), [selectionId]);

  useEffect(() => {
    setTargetPage((current) => Math.min(current, targetPageCount));
  }, [targetPageCount]);

  useEffect(() => {
    if (activeBatch.data?.id && activeBatch.data.selectionId === selectionId) setBatchId(activeBatch.data.id);
  }, [activeBatch.data?.id, activeBatch.data?.selectionId, selectionId]);

  useEffect(() => {
    if (previousSelectionId.current && previousSelectionId.current !== selectionId) {
      setBatchId('');
      setPublishProgress(null);
      setPublishOutcome(null);
      completedBatch.current = '';
      synchronizedBatchRevision.current = '';
    }
    previousSelectionId.current = selectionId;
  }, [selectionId]);

  useEffect(() => {
    const targetSelectionId = batch.data?.selectionId;
    if (!batch.data || !targetSelectionId) return;
    const revision = batch.data.items
      .map((item) => `${item.id}:${item.status}:${item.savedCount}:${item.completedAt || ''}`)
      .join('|');
    if (synchronizedBatchRevision.current === revision) return;
    synchronizedBatchRevision.current = revision;
    void queryClient.invalidateQueries({ queryKey: ['horoshop-photo-selection', targetSelectionId], exact: true });
  }, [batch.data, queryClient]);

  useEffect(() => {
    if (!desktopPairing || desktopPairing.status !== 'pending') return;
    const timer = window.setInterval(() => {
      void api.horoshopPhotos.desktopPairing(desktopPairing.id).then(async (current) => {
        setDesktopPairing((previous) => previous ? { ...previous, ...current } : current);
        if (current.status === 'claimed') {
          await queryClient.invalidateQueries({ queryKey: ['horoshop-photo-desktop-devices'] });
          showToast('Десктопний фото-парсер підключено.', 'success');
        }
      }).catch(() => {});
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [desktopPairing, queryClient, showToast]);

  useEffect(() => {
    if (!batch.data || !batchComplete(batch.data) || completedBatch.current === batch.data.id) return;
    completedBatch.current = batch.data.id;
    const completedBatchId = batch.data.id;
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['horoshop-photo-selection'] }),
      queryClient.invalidateQueries({ queryKey: ['horoshop-photo-selections'] }),
      queryClient.invalidateQueries({ queryKey: ['horoshop-photo-active-batch', batch.data.selectionId] })
    ]).finally(() => {
      setBatchId((current) => current === completedBatchId ? '' : current);
    });
  }, [batch.data, queryClient]);

  useEffect(() => {
    if (!batchId || !(batch.error instanceof ApiError) || batch.error.status !== 404) return;
    queryClient.removeQueries({ queryKey: ['horoshop-photo-batch', batchId], exact: true });
    setBatchId('');
    void queryClient.invalidateQueries({ queryKey: ['horoshop-photo-active-batch', selectionId] });
  }, [batch.error, batchId, queryClient, selectionId]);

  const displayedBatch = batch.data?.selectionId === selectionId
    ? batch.data
    : activeBatch.data?.selectionId === selectionId ? activeBatch.data : null;
  const parserBusy = Boolean(displayedBatch && !batchComplete(displayedBatch));
  const publishBusy = publishSelection.isPending;

  async function createFromInput() {
    const entries = selectionInput.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean);
    if (!entries.length) {
      showToast('Вставте хоча б одну назву або артикул товару.', 'error');
      return;
    }
    try {
      const created = await createSelection.mutateAsync({ name: selectionName, entries });
      await queryClient.invalidateQueries({ queryKey: ['horoshop-photo-selections'] });
      queryClient.setQueryData(['horoshop-photo-selection', created.id], created);
      setSelectionId(created.id);
      setSelectionName('');
      setSelectionInput('');
      showToast(`Вибірку створено. Знайдено товарів: ${created.products.length}.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося створити вибірку.', 'error');
    }
  }

  async function createFromFilter() {
    try {
      const created = await createFilteredSelection.mutateAsync({
        name: selectionName,
        filters: {
          search: filterSearch,
          category: filterCategory,
          availability: filterAvailability,
          visibility: filterVisibility
        }
      });
      await queryClient.invalidateQueries({ queryKey: ['horoshop-photo-selections'] });
      queryClient.setQueryData(['horoshop-photo-selection', created.id], created);
      setSelectionId(created.id);
      setSelectionName('');
      showToast(`Вибірку за фільтрами створено. Знайдено товарів: ${created.products.length}.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося створити вибірку за фільтрами.', 'error');
    }
  }

  async function startDesktopPairing() {
    try {
      const pairing = await createDesktopPairing.mutateAsync();
      setDesktopPairing(pairing);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося створити код підключення.', 'error');
    }
  }

  async function revokeDesktopDevice(device: HoroshopPhotoDesktopDevice) {
    const accepted = await confirm({
      title: 'Відключити десктопний парсер?',
      message: `Пристрій «${device.name}» втратить доступ. Незавершені завдання повернуться в чергу.`,
      confirmLabel: 'Відключити',
      tone: 'danger'
    });
    if (!accepted) return;
    try {
      await api.horoshopPhotos.revokeDesktopDevice(device.id);
      await queryClient.invalidateQueries({ queryKey: ['horoshop-photo-desktop-devices'] });
      showToast('Десктопний парсер відключено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося відключити парсер.', 'error');
    }
  }

  function setBusy(key: string, busy: boolean) {
    setBusyDraftIds((current) => {
      const next = new Set(current);
      if (busy) next.add(key); else next.delete(key);
      return next;
    });
  }

  async function updateAssets(draft: HoroshopPhotoDraft, assetIds: string[]) {
    if (!draft.id) return;
    setBusy(draft.id, true);
    try {
      await api.horoshopPhotos.selectAssets(draft.id, assetIds);
      await queryClient.invalidateQueries({ queryKey: ['horoshop-photo-selection', selectionId] });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося оновити порядок фотографій.', 'error');
    } finally {
      setBusy(draft.id, false);
    }
  }

  async function confirmReplace() {
    if (publicationMode !== 'replace') return true;
    return confirm({
      title: 'Замінити наявні фотографії?',
      message: 'Хорошоп видалить поточні фото у відповідному полі та замінить їх вибраною чернеткою. Цю дію не можна скасувати в робочому просторі.',
      confirmLabel: 'Замінити фотографії',
      tone: 'danger'
    });
  }

  async function publishDraft(draft: HoroshopPhotoDraft) {
    if (!draft.id || !(await confirmReplace())) return;
    setBusy(draft.id, true);
    try {
      await api.horoshopPhotos.publishDraft(draft.id, publicationMode);
      await queryClient.invalidateQueries({ queryKey: ['horoshop-photo-selection', selectionId] });
      showToast('Фотографії передано у Хорошоп.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося передати фотографії.', 'error');
    } finally {
      setBusy(draft.id, false);
    }
  }

  async function runSelectionParse() {
    if (!selectionId) return;
    try {
      const created = await parseSelection.mutateAsync(selectionId);
      completedBatch.current = '';
      setBatchId(created.id);
      showToast(`У десктопний парсер передано позицій: ${created.requestedCount}.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося передати вибірку в десктопний парсер.', 'error');
    }
  }

  async function runSelectionPublish() {
    if (!selectionId || !(await confirmReplace())) return;
    const publishingSelectionId = selectionId;
    setPublishOutcome(null);
    setPublishProgress({ stage: 'authenticating', totalDrafts: 0, processedDrafts: 0, currentArticle: '', percentage: 0 });
    try {
      const result = await publishSelection.mutateAsync({ id: publishingSelectionId, mode: publicationMode });
      if (publishResultHasFailures(result)) {
        setPublishOutcome(result);
        showToast(
          `Фото передано частково: успішно ${result.publishedDrafts}, не передано ${result.failedDrafts}. Перевірте деталі нижче.`,
          'error'
        );
      } else {
        showToast(`Передано чернеток: ${result.publishedDrafts}.`, 'success');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося опублікувати вибірку.', 'error');
    } finally {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['horoshop-photo-selection', publishingSelectionId], exact: true }),
        queryClient.invalidateQueries({ queryKey: ['horoshop-photo-selections'] })
      ]).catch(() => {});
    }
  }

  async function removeCurrentSelection() {
    if (!selectionId || !selection.data) return;
    const accepted = await confirm({
      title: 'Видалити вибірку?',
      message: 'Список товарів і непередані в Хорошоп чернетки фотографій буде видалено. Фото, які вже передані в Хорошоп, не зміняться.',
      confirmLabel: 'Видалити вибірку',
      tone: 'danger'
    });
    if (!accepted) return;
    const removedId = selectionId;
    try {
      await api.horoshopPhotos.removeSelection(removedId);
      const remaining = (queryClient.getQueryData<HoroshopPhotoSelectionSummary[]>(['horoshop-photo-selections']) || [])
        .filter((item) => item.id !== removedId);
      queryClient.setQueryData(['horoshop-photo-selections'], remaining);
      queryClient.removeQueries({ queryKey: ['horoshop-photo-selection', removedId], exact: true });
      if (displayedBatch?.selectionId === removedId) {
        if (displayedBatch.id === batchId) setBatchId('');
        queryClient.removeQueries({ queryKey: ['horoshop-photo-batch', displayedBatch.id], exact: true });
        queryClient.setQueryData(['horoshop-photo-active-batch', removedId], null);
      }
      setSelectionId(remaining[0]?.id || '');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['horoshop-photo-selections'] }),
        queryClient.invalidateQueries({ queryKey: ['horoshop-photo-active-batch'] })
      ]);
      showToast('Вибірку та її чергу десктопного парсера видалено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося видалити вибірку.', 'error');
    }
  }

  const counts = useMemo(() => ({
    products: selection.data?.products.length || 0,
    targets: photoTargets.length,
    ready: photoTargets.filter((target) => ['ready', 'partial'].includes(target.draft.parseStatus)).length
  }), [photoTargets, selection.data?.products.length]);
  const publishableCount = useMemo(() => photoTargets.filter((target) => (
    draftIsPublishable(target.draft)
  )).length, [photoTargets]);

  if (selections.isError) return <div className="horoshop-photo-page">
    <section className="task-list-state task-list-state--error">
      <Icon name="storefront" size={32} />
      <h1>Каталог Хорошоп недоступний</h1>
      <p>{selections.error instanceof Error ? selections.error.message : 'Підключіть магазин та виконайте синхронізацію каталогу.'}</p>
      <Link className="button button--primary" to="/admin/integrations">Відкрити інтеграції</Link>
    </section>
  </div>;

  return <div className="horoshop-photo-page">
    <header className="horoshop-photo-header">
      <div>
        <p className="eyebrow">Каталог Хорошоп</p>
        <h1>Фото товарів</h1>
        <p>Створюйте вибірки, обробляйте їх десктопним парсером і передавайте перевірені фото у Хорошоп.</p>
      </div>
      <div className="horoshop-photo-header__actions">
        <StyledSelect
          value={publicationMode}
          options={[
            { value: 'replace', label: 'Замінити наявні фото' },
            { value: 'append', label: 'Додати до наявних фото' }
          ]}
          onChange={(value) => setPublicationMode(value as HoroshopPhotoPublicationMode)}
          ariaLabel="Режим публікації фотографій"
          compact
        />
        <button className="button button--secondary" type="button" disabled={!selectionId || !connectedDevices.length || parserBusy || parseSelection.isPending} onClick={() => void runSelectionParse()}>
          <Icon name="refresh" size={17} /> Передати в парсер
        </button>
        <button className="button button--primary" type="button" disabled={!selectionId || publishBusy || busyDraftIds.size > 0 || publishableCount === 0} onClick={() => void runSelectionPublish()}>
          <Icon name="upload" size={17} /> Передати готові
        </button>
      </div>
    </header>

    <section className="horoshop-photo-desktop">
      <div className="horoshop-photo-desktop__intro">
        <span><Icon name="productSelection" size={22} /></span>
        <div>
          <strong>Десктопний фото-парсер</strong>
          <p>Він отримує вибірки, збирає посилання та фотографії й повертає готові чернетки в робочий простір.</p>
        </div>
      </div>
      <div className="horoshop-photo-desktop__devices">
        {connectedDevices.map((device) => <article key={device.id}>
          <span className="is-online" />
          <div><strong>{device.name}</strong><small>{device.lastSeenAt ? `Був на зв’язку: ${new Date(device.lastSeenAt).toLocaleString('uk-UA')}` : 'Ще не синхронізувався'}{device.appVersion ? ` · v${device.appVersion}` : ''}</small></div>
          <button className="button button--danger button--small" type="button" onClick={() => void revokeDesktopDevice(device)}>Відключити</button>
        </article>)}
        {!connectedDevices.length && !desktopDevices.isLoading && <p className="horoshop-photo-desktop__empty">Підключених парсерів ще немає.</p>}
      </div>
      {desktopPairing?.status === 'pending' ? <div className="horoshop-photo-desktop__pairing">
        <div><small>Адреса робочого простору</small><code>{window.location.origin}</code></div>
        <div><small>Одноразовий код</small><code>{desktopPairing.manualCode}</code></div>
        <button className="button button--secondary button--small" type="button" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}\n${desktopPairing.manualCode || ''}`)}>
          <Icon name="copy" size={15} /> Копіювати
        </button>
        <span>Діє до {new Date(desktopPairing.expiresAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}</span>
      </div> : <button className="button button--secondary" type="button" disabled={createDesktopPairing.isPending} onClick={() => void startDesktopPairing()}>
        <Icon name="add" size={16} /> {connectedDevices.length ? 'Підключити ще один парсер' : 'Підключити десктопний парсер'}
      </button>}
    </section>

    <section className="horoshop-photo-builder">
      <div className="horoshop-photo-builder__copy">
        <span><Icon name="productSelection" size={23} /></span>
        <div><strong>Нова вибірка товарів</strong><p>Вкажіть точний список назв чи артикулів або сформуйте групу фільтрами каталогу.</p></div>
      </div>
      <div className="horoshop-photo-builder__modes" role="group" aria-label="Спосіб створення вибірки">
        <button type="button" className={selectionMode === 'list' ? 'is-active' : ''} onClick={() => setSelectionMode('list')}>Назви та артикули</button>
        <button type="button" className={selectionMode === 'filter' ? 'is-active' : ''} onClick={() => setSelectionMode('filter')}>Фільтри каталогу</button>
      </div>
      <label><span>Назва вибірки</span><input value={selectionName} onChange={(event) => setSelectionName(event.target.value)} placeholder="Наприклад, Нові iPhone" /></label>
      {selectionMode === 'list' ? <label className="horoshop-photo-builder__entries"><span>Назви та артикули</span><textarea value={selectionInput} onChange={(event) => setSelectionInput(event.target.value)} placeholder={'IPHONE-15-128-BLK\nСмартфон Apple iPhone 15 128GB Black'} /></label> : <div className="horoshop-photo-builder__filters">
        <label><span>Пошук у каталозі</span><input value={filterSearch} onChange={(event) => setFilterSearch(event.target.value)} placeholder="Назва, артикул або бренд" /></label>
        <label><span>Розділ</span><StyledSelect
          value={filterCategory}
          options={[
            { value: '', label: 'Усі розділи' },
            ...(filterCatalog.data?.categories.map((category) => ({
              value: category.externalId,
              label: `${category.titles.uk || category.titles.ua || category.titles.ru || category.titles.en || category.externalId} · ${category.productCount}`
            })) || [])
          ]}
          onChange={setFilterCategory}
          ariaLabel="Розділ"
          searchable
        /></label>
        <label><span>Наявність</span><StyledSelect
          value={filterAvailability}
          options={[
            { value: '', label: 'Будь-яка' },
            ...(filterCatalog.data?.availabilityOptions.map((availability) => ({ value: availability, label: availability })) || [])
          ]}
          onChange={setFilterAvailability}
          ariaLabel="Наявність"
        /></label>
        <label><span>Видимість</span><StyledSelect
          value={filterVisibility}
          options={[
            { value: 'all', label: 'Усі товари' },
            { value: 'visible', label: 'Лише видимі' },
            { value: 'hidden', label: 'Лише приховані' }
          ]}
          onChange={(value) => setFilterVisibility(value as HoroshopCatalogVisibility)}
          ariaLabel="Видимість"
        /></label>
        <p>{filterCatalog.isLoading ? 'Рахуємо товари…' : `За цими умовами: ${filterCatalog.data?.total || 0} товарів`}</p>
      </div>}
      <button className="button button--primary" type="button" disabled={createSelection.isPending || createFilteredSelection.isPending} onClick={() => void (selectionMode === 'list' ? createFromInput() : createFromFilter())}>
        <Icon name="add" size={17} /> {createSelection.isPending || createFilteredSelection.isPending ? 'Створюємо…' : 'Створити вибірку'}
      </button>
    </section>

    <section className="horoshop-photo-selection-bar">
      <label><span>Поточна вибірка</span><StyledSelect
        value={selectionId}
        options={selections.data?.length
          ? selections.data.map((item) => ({ value: item.id, label: `${item.name} · ${item.matchedCount}` }))
          : [{ value: '', label: 'Вибірок ще немає', disabled: true }]}
        onChange={setSelectionId}
        disabled={!selections.data?.length}
        ariaLabel="Поточна вибірка товарів"
        searchable
      /></label>
      <div className="horoshop-photo-stats">
        <span><small>Товарів</small><b>{counts.products}</b></span>
        <span><small>Цілей</small><b>{counts.targets}</b></span>
        <span><small>Готово</small><b>{counts.ready}</b></span>
      </div>
      {selectionId && <button className="button button--danger button--small" type="button" onClick={() => void removeCurrentSelection()}><Icon name="delete" size={16} /> Видалити</button>}
    </section>

    {displayedBatch && <BatchProgress batch={displayedBatch} />}
    {publishProgress && publishBusy && <section className="horoshop-photo-progress is-publishing">
      <header><div><strong>{publishProgress.stage === 'authenticating' ? 'Авторизація у Хорошопі' : 'Передаємо фотографії'}</strong><span>{publishProgress.currentArticle || 'Готуємо пакет'}</span></div><b>{publishProgress.percentage}%</b></header>
      <div className="horoshop-photo-progress__track"><span style={{ width: `${publishProgress.percentage}%` }} /></div>
      <footer><span>{publishProgress.processedDrafts} із {publishProgress.totalDrafts || '—'} чернеток</span></footer>
    </section>}
    {publishOutcome && publishResultHasFailures(publishOutcome) && <section className="horoshop-photo-publish-warning" role="alert">
      <Icon name="alarm" size={20} />
      <div>
        <strong>Фото передано частково</strong>
        <p>
          Передано {publishOutcome.publishedDrafts} чернеток для {publishOutcome.publishedArticles} товарів.
          {' '}Не передано {publishOutcome.failedDrafts} чернеток для {publishOutcome.failedArticles} товарів.
        </p>
        {publishOutcome.failures.length > 0 && <ul>
          {publishOutcome.failures.slice(0, 5).map((failure, index) => <li key={`${failure.article}:${failure.code || ''}:${index}`}>
            <b>{failure.article || 'Товар без артикула'}:</b> {failure.message}
          </li>)}
          {publishOutcome.failures.length > 5 && <li>Ще помилок: {publishOutcome.failures.length - 5}.</li>}
        </ul>}
      </div>
    </section>}

    {selection.data && (selection.data.resolution.ambiguous.length > 0 || selection.data.resolution.unmatched.length > 0) && <section className="horoshop-photo-resolution">
      {selection.data.resolution.ambiguous.length > 0 && <div>
        <h2>Потрібно уточнити</h2>
        {selection.data.resolution.ambiguous.map((entry) => <article key={entry.input}>
          <strong>{entry.input}</strong>
          <div>{entry.candidates.map((candidate) => <button type="button" key={`${candidate.productId}:${candidate.modificationId || 'product'}`} onClick={async () => {
            const updated = await api.horoshopPhotos.addSelectionItem(selection.data.id, { ...candidate, inputValue: entry.input });
            queryClient.setQueryData(['horoshop-photo-selection', selection.data.id], updated);
            await queryClient.invalidateQueries({ queryKey: ['horoshop-photo-selections'] });
          }}>
            {candidate.imageUrl ? <img src={candidate.imageUrl} alt="" /> : <span><Icon name="savedBanners" size={18} /></span>}
            <span><b>{candidate.title}</b><small>{candidate.sku}</small></span>
            <Icon name="add" size={17} />
          </button>)}</div>
        </article>)}
      </div>}
      {selection.data.resolution.unmatched.length > 0 && <div><h2>Не знайдено</h2><p>{selection.data.resolution.unmatched.join(' · ')}</p></div>}
    </section>}

    <section className="horoshop-photo-products">
      {selection.isLoading && <div className="task-list-state"><span className="loading-screen__pulse" /><p>Завантажуємо вибірку…</p></div>}
      {!selectionId && !selection.isLoading && <div className="empty-state"><Icon name="productSelection" size={30} /><strong>Створіть першу вибірку</strong><span>Вставте назви або артикули товарів у поле вище.</span></div>}
      {selection.data && !selection.data.products.length && <div className="empty-state"><Icon name="search" size={30} /><strong>Точних збігів немає</strong><span>Перевірте блок уточнень і записи, які не були знайдені.</span></div>}
      <TargetPager page={targetPage} pageCount={targetPageCount} total={photoTargets.length} onChange={setTargetPage} />
      {visiblePhotoTargets.map((target) => <ProductTarget
        target={target}
        key={target.key}
        busyDraftIds={busyDraftIds}
        onAssetsChange={(draft, ids) => void updateAssets(draft, ids)}
        onPublish={(draft) => void publishDraft(draft)}
      />)}
      <TargetPager page={targetPage} pageCount={targetPageCount} total={photoTargets.length} onChange={setTargetPage} />
    </section>
  </div>;
}
