import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { MediaFolderPickerDialog } from '../components/MediaLibraryBrowser';
import type { MediaFolderSelection } from '../components/MediaLibraryBrowser';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import {
  catalogPhotoGoogleSearchUrl,
  catalogPhotoParserBatchIsBusy,
  catalogPhotoParserBatchIsComplete,
  catalogPhotoParserStatusLabels
} from '../lib/catalog-photo-parser';
import { useToast } from '../toast/ToastContext';
import type {
  CatalogPhotoParserBatch,
  CatalogPhotoParserPhotoStatus,
  CatalogPhotoParserProduct,
  CatalogPhotoParserRun
} from '../types/catalog';

const pageSize = 50;
const parserFolderStorageKey = 'mt-catalog-photo-parser-folder';

function loadStoredFolderSelection(): MediaFolderSelection | null {
  try {
    const stored = JSON.parse(window.localStorage.getItem(parserFolderStorageKey) || 'null') as MediaFolderSelection | null;
    return stored?.folder?.id ? stored : null;
  } catch {
    return null;
  }
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('uk-UA', { dateStyle: 'medium', timeStyle: 'short' });
}

function RunStatus({ run }: { run: CatalogPhotoParserRun | null }) {
  if (!run) return <span className="catalog-photo-parser-status is-idle">Ще не оброблявся</span>;
  return <span className={`catalog-photo-parser-status is-${run.status}`}>
    {run.status === 'running' && <span className="catalog-photo-parser-spinner" aria-hidden="true" />}
    {catalogPhotoParserStatusLabels[run.status]}
    {run.savedCount > 0 && ` · ${run.savedCount} фото`}
  </span>;
}

function BatchProgress({ batch }: { batch: CatalogPhotoParserBatch }) {
  const complete = batch.counts.success + batch.counts.partial + batch.counts.failed;
  const percent = batch.requestedCount ? Math.round((complete / batch.requestedCount) * 100) : 100;
  const isComplete = catalogPhotoParserBatchIsComplete(batch);
  return <section className={`catalog-photo-parser-progress${isComplete ? ' is-complete' : ''}`}>
    <header>
      <div>
        <strong>{isComplete ? 'Пакет завершено' : 'Масовий парсинг виконується'}</strong>
        <span>{complete} із {batch.requestedCount} товарів</span>
      </div>
      <b>{percent}%</b>
    </header>
    <div className="catalog-photo-parser-progress__track" aria-label={`Виконано ${percent}%`}>
      <span style={{ width: `${percent}%` }} />
    </div>
    <footer>
      <span className="is-success">Успішно: {batch.counts.success}</span>
      <span className="is-partial">Частково: {batch.counts.partial}</span>
      <span className="is-failed">Помилки: {batch.counts.failed}</span>
      <span>У черзі: {batch.counts.queued + batch.counts.running}</span>
    </footer>
  </section>;
}

function ProductRow({
  product,
  sourceUrl,
  run,
  saving,
  onChange,
  onSave
}: {
  product: CatalogPhotoParserProduct;
  sourceUrl: string;
  run: CatalogPhotoParserRun | null;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return <article className={`catalog-photo-parser-product${run?.status ? ` is-${run.status}` : ''}`}>
    <div className="catalog-photo-parser-product__image">
      {product.mainImageUrl
        ? <img src={product.mainImageUrl} alt="" loading="lazy" />
        : <Icon name="savedBanners" size={22} />}
      <span>{product.photoCount}</span>
    </div>
    <div className="catalog-photo-parser-product__identity">
      <strong title={product.name}>{product.name}</strong>
      <span>{product.productCode}</span>
    </div>
    <label className="catalog-photo-parser-product__url">
      <span>Посилання на товар у магазині</span>
      <input
        type="url"
        value={sourceUrl}
        placeholder="https://..."
        onChange={(event) => onChange(event.target.value)}
        onBlur={onSave}
        disabled={saving || run?.status === 'running'}
      />
      {saving && <small>Зберігаємо…</small>}
    </label>
    <div className="catalog-photo-parser-product__state">
      <RunStatus run={run} />
      {run?.errorMessage && <small title={run.errorMessage}>{run.errorMessage}</small>}
    </div>
    <div className="catalog-photo-parser-product__actions">
      <Link
        className="button button--secondary button--small"
        to={`/catalog/products?product=${encodeURIComponent(product.id)}`}
        target="_blank"
        rel="noreferrer"
        title="Відкрити картку товару"
      >
        <Icon name="openInNew" size={15} /> Товар
      </Link>
      <button
        className="button button--secondary button--small"
        type="button"
        onClick={() => window.open(catalogPhotoGoogleSearchUrl(product.name), '_blank', 'noopener,noreferrer')}
        title="Знайти товар у Google"
      >
        <Icon name="search" size={15} /> Google
      </button>
    </div>
  </article>;
}

function ErrorList({ search }: { search: string }) {
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);
  const result = useQuery({
    queryKey: ['catalog-photo-parser-errors', deferredSearch, page],
    queryFn: () => api.catalog.photoParser.errors({ search: deferredSearch, page, pageSize: 25 }),
    placeholderData: keepPreviousData
  });
  const clearErrors = useMutation({
    mutationFn: api.catalog.photoParser.clearErrors,
    onSuccess: async ({ clearedCount }) => {
      setPage(1);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['catalog-photo-parser-errors'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog-photo-parser-products'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-system-metrics'] })
      ]);
      showToast(clearedCount
        ? `Журнал очищено. Приховано записів: ${clearedCount}.`
        : 'Журнал помилок уже порожній.', 'success');
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : 'Не вдалося очистити журнал помилок.', 'error');
    }
  });

  useEffect(() => setPage(1), [deferredSearch]);

  async function clearErrorLog() {
    const accepted = await confirm({
      title: 'Очистити журнал помилок?',
      message: 'Усі поточні повідомлення про помилки фотопарсера буде приховано. Товари, фотографії та технічна історія пакетів залишаться без змін.',
      confirmLabel: 'Очистити журнал',
      tone: 'danger'
    });
    if (accepted) clearErrors.mutate();
  }

  if (result.isLoading) return <div className="empty-state catalog-photo-parser-empty"><span className="catalog-photo-parser-spinner" /> Завантажуємо помилки…</div>;
  if (result.isError) return <div className="empty-state catalog-photo-parser-empty">Не вдалося завантажити журнал помилок.</div>;
  if (!result.data?.items.length) return <div className="empty-state catalog-photo-parser-empty"><Icon name="check" size={28} /><strong>Помилок немає</strong><span>Тут з’являться товари, оброблені частково або з помилкою.</span></div>;

  return <>
    <div className="catalog-photo-parser-error-toolbar">
      <div>
        <strong>Журнал помилок</strong>
        <span>Записів: {result.data.total}</span>
      </div>
      <button className="button button--danger button--small" type="button" disabled={clearErrors.isPending} onClick={() => void clearErrorLog()}>
        <Icon name="delete" size={15} />
        {clearErrors.isPending ? 'Очищення…' : 'Очистити журнал'}
      </button>
    </div>
    <div className="catalog-photo-parser-errors">
      {result.data.items.map((run) => <article className={`catalog-photo-parser-error is-${run.status}`} key={run.id}>
        <header>
          <div className="catalog-photo-parser-error__product">
            {run.mainImageUrl
              ? <img src={run.mainImageUrl} alt="" loading="lazy" />
              : <span><Icon name="savedBanners" size={19} /></span>}
            <div><strong>{run.productName}</strong><small>{run.productCode}</small></div>
          </div>
          <RunStatus run={run} />
        </header>
        <a href={run.sourceUrl} target="_blank" rel="noreferrer">{run.sourceUrl}</a>
        <p>{run.errorMessage || 'Частину фотографій не вдалося обробити.'}</p>
        {run.errors.length > 0 && <details>
          <summary>Деталі ({run.errors.length})</summary>
          <ul>
            {run.errors.map((error, index) => <li key={`${error.sourceUrl || error.stage}-${index}`}>
              <strong>{error.stage}</strong>
              <span>{error.message}</span>
              {error.sourceUrl && <a href={error.sourceUrl} target="_blank" rel="noreferrer">Проблемне фото</a>}
            </li>)}
          </ul>
        </details>}
        <footer>Знайдено: {run.foundCount} · збережено: {run.savedCount} · пропущено: {run.skippedCount} · {formatDate(run.completedAt)}</footer>
      </article>)}
    </div>
    {result.data.pageCount > 1 && <div className="catalog-audit-pagination">
      <button className="button button--secondary button--small" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Назад</button>
      <span>{page} / {result.data.pageCount}</span>
      <button className="button button--secondary button--small" type="button" disabled={page >= result.data.pageCount} onClick={() => setPage((value) => value + 1)}>Далі</button>
    </div>}
  </>;
}

export function CatalogPhotoParserPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'errors' ? 'errors' : 'parser';
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [photoStatus, setPhotoStatus] = useState<CatalogPhotoParserPhotoStatus>('all');
  const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [batchId, setBatchId] = useState('');
  const [folderSelection, setFolderSelection] = useState<MediaFolderSelection | null>(loadStoredFolderSelection);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const dirtyIds = useRef(new Set<string>());
  const completedBatchId = useRef('');

  const products = useQuery({
    queryKey: ['catalog-photo-parser-products', deferredSearch, photoStatus, page],
    queryFn: () => api.catalog.photoParser.products({
      search: deferredSearch,
      photoStatus,
      page,
      pageSize
    }),
    placeholderData: keepPreviousData,
    enabled: tab === 'parser'
  });
  const activeBatch = useQuery({
    queryKey: ['catalog-photo-parser-active-batch'],
    queryFn: api.catalog.photoParser.activeBatch,
    enabled: tab === 'parser' && !batchId,
    refetchOnWindowFocus: false
  });
  const batch = useQuery({
    queryKey: ['catalog-photo-parser-batch', batchId],
    queryFn: () => api.catalog.photoParser.batch(batchId),
    enabled: Boolean(batchId),
    refetchInterval: (query) => catalogPhotoParserBatchIsComplete(query.state.data) ? false : 1500,
    refetchIntervalInBackground: true
  });
  const startBatch = useMutation({
    mutationFn: api.catalog.photoParser.startBatch
  });
  const errorSummary = useQuery({
    queryKey: ['catalog-photo-parser-errors', 'summary'],
    queryFn: () => api.catalog.photoParser.errors({ page: 1, pageSize: 10 }),
    staleTime: 4_000
  });

  useEffect(() => {
    if (activeBatch.data?.id) setBatchId(activeBatch.data.id);
  }, [activeBatch.data?.id]);

  useEffect(() => {
    if (!products.data) return;
    setDrafts((current) => {
      const next = { ...current };
      products.data.items.forEach((product) => {
        if (!dirtyIds.current.has(product.id)) next[product.id] = product.sourceUrl;
      });
      return next;
    });
  }, [products.data]);

  useEffect(() => {
    const currentBatch = batch.data;
    if (!currentBatch || !catalogPhotoParserBatchIsComplete(currentBatch) || completedBatchId.current === currentBatch.id) return;
    completedBatchId.current = currentBatch.id;
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['catalog-photo-parser-products'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-photo-parser-errors'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] })
    ]);
  }, [batch.data, queryClient]);

  useEffect(() => setPage(1), [deferredSearch, photoStatus]);

  const currentBatchRuns = useMemo(() => new Map(
    (batch.data?.items || []).map((run) => [run.productId, run])
  ), [batch.data?.items]);
  const displayedBatch = batch.data || activeBatch.data || null;
  const parserBusy = catalogPhotoParserBatchIsBusy(displayedBatch);
  const selectedFolderPath = folderSelection?.breadcrumbs.map((folder) => folder.name).join(' / ') || '';

  function chooseFolder(selection: MediaFolderSelection) {
    setFolderSelection(selection.folder ? selection : null);
    setFolderPickerOpen(false);
    if (selection.folder) window.localStorage.setItem(parserFolderStorageKey, JSON.stringify(selection));
    else window.localStorage.removeItem(parserFolderStorageKey);
  }

  function resetFolder() {
    setFolderSelection(null);
    window.localStorage.removeItem(parserFolderStorageKey);
  }

  function updateDraft(productId: string, value: string) {
    dirtyIds.current.add(productId);
    setDrafts((current) => ({ ...current, [productId]: value }));
  }

  async function saveSourceUrl(product: CatalogPhotoParserProduct) {
    if (!dirtyIds.current.has(product.id)) return true;
    setSavingIds((current) => new Set(current).add(product.id));
    try {
      const saved = await api.catalog.photoParser.setSourceUrl(product.id, drafts[product.id] || '');
      dirtyIds.current.delete(product.id);
      setDrafts((current) => ({ ...current, [product.id]: saved.sourceUrl }));
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти посилання.', 'error');
      return false;
    } finally {
      setSavingIds((current) => {
        const next = new Set(current);
        next.delete(product.id);
        return next;
      });
    }
  }

  async function runAll() {
    const visible = products.data?.items || [];
    const pending = visible.filter((product) => dirtyIds.current.has(product.id));
    const saveResults = await Promise.all(pending.map(saveSourceUrl));
    if (saveResults.some((saved) => !saved)) return;
    try {
      const created = await startBatch.mutateAsync({
        search: deferredSearch,
        photoStatus,
        targetFolderId: folderSelection?.folder?.id || null
      });
      completedBatchId.current = '';
      setBatchId(created.id);
      showToast(`Додано в чергу: ${created.requestedCount} товарів.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося запустити парсинг.', 'error');
    }
  }

  function switchTab(next: 'parser' | 'errors') {
    setSearchParams(next === 'errors' ? { tab: 'errors' } : {}, { replace: true });
  }

  return <div className="catalog-page catalog-photo-parser-page">
    <section className="task-toolbar catalog-photo-parser-header">
      <div>
        <p className="eyebrow">Catalog media</p>
        <h1>Парсер фотографій</h1>
        <p>Вставте посилання на сторінки товарів і запустіть обробку всього відфільтрованого списку.</p>
      </div>
      <div className="task-toolbar__controls">
        <button
          className="button button--primary"
          type="button"
          onClick={() => void runAll()}
          disabled={parserBusy || startBatch.isPending || products.isLoading}
        >
          <Icon name="savedBanners" size={17} />
          {parserBusy ? 'Парсинг виконується' : 'Парсити всі посилання'}
        </button>
      </div>
    </section>

    <nav className="catalog-photo-parser-tabs" aria-label="Розділи парсера">
      <button className={tab === 'parser' ? 'active' : ''} type="button" onClick={() => switchTab('parser')}>Товари</button>
      <button className={tab === 'errors' ? 'active' : ''} type="button" onClick={() => switchTab('errors')}>
        Помилки
        {errorSummary.data?.total ? <span>{errorSummary.data.total}</span> : null}
      </button>
    </nav>

    <section className="catalog-photo-parser-filters">
      <label className="catalog-audit-search">
        <Icon name="search" size={18} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Пошук за назвою або кодом товару" />
      </label>
      {tab === 'parser' && <div className="segmented">
        <button className={photoStatus === 'all' ? 'active' : ''} type="button" onClick={() => setPhotoStatus('all')}>Усі <span>{products.data?.summary.total ?? '—'}</span></button>
        <button className={photoStatus === 'present' ? 'active' : ''} type="button" onClick={() => setPhotoStatus('present')}>З фото <span>{products.data?.summary.withPhotos ?? '—'}</span></button>
        <button className={photoStatus === 'missing' ? 'active' : ''} type="button" onClick={() => setPhotoStatus('missing')}>Без фото <span>{products.data?.summary.withoutPhotos ?? '—'}</span></button>
      </div>}
    </section>

    {tab === 'parser' && <section className="catalog-photo-parser-folder-setting">
      <div className="catalog-photo-parser-folder-setting__copy">
        <span className="catalog-photo-parser-folder-setting__icon"><Icon name="folder" size={20} /></span>
        <span>
          <strong>Спільна батьківська папка</strong>
          <small>У ній парсер створить окрему підпапку для кожного товару.</small>
        </span>
      </div>
      <div className={`catalog-photo-parser-folder-setting__value${folderSelection?.folder ? ' is-selected' : ''}`}>
        <span title={selectedFolderPath || 'Корінь файлового сховища'}>{selectedFolderPath || 'Корінь файлового сховища'}</span>
      </div>
      <div className="catalog-photo-parser-folder-setting__actions">
        <button className="button button--secondary" type="button" disabled={parserBusy} onClick={() => setFolderPickerOpen(true)}><Icon name="folder" size={17} /> Вибрати</button>
        <button className="button button--secondary" type="button" disabled={parserBusy || !folderSelection} onClick={resetFolder}>Скинути</button>
      </div>
    </section>}

    {displayedBatch && tab === 'parser' && <BatchProgress batch={displayedBatch} />}

    {tab === 'errors'
      ? <ErrorList search={deferredSearch} />
      : <>
          <div className={`catalog-photo-parser-products${products.isFetching ? ' is-refreshing' : ''}`}>
            {products.data?.items.map((product) => <ProductRow
              key={product.id}
              product={product}
              sourceUrl={drafts[product.id] ?? product.sourceUrl}
              run={currentBatchRuns.get(product.id) || product.latestRun}
              saving={savingIds.has(product.id)}
              onChange={(value) => updateDraft(product.id, value)}
              onSave={() => void saveSourceUrl(product)}
            />)}
            {products.isLoading && <div className="empty-state catalog-photo-parser-empty"><span className="catalog-photo-parser-spinner" /> Завантажуємо товари…</div>}
            {!products.isLoading && !products.data?.items.length && <div className="empty-state catalog-photo-parser-empty"><Icon name="search" size={28} /><strong>Товарів не знайдено</strong><span>Змініть пошук або фільтр фотографій.</span></div>}
          </div>
          {products.data && products.data.pageCount > 1 && <div className="catalog-audit-pagination">
            <button className="button button--secondary button--small" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Назад</button>
            <span>{page} / {products.data.pageCount} · {products.data.total} товарів</span>
            <button className="button button--secondary button--small" type="button" disabled={page >= products.data.pageCount} onClick={() => setPage((value) => value + 1)}>Далі</button>
          </div>}
        </>}
    {folderPickerOpen && <MediaFolderPickerDialog
      initialFolderId={folderSelection?.folder?.id || null}
      onClose={() => setFolderPickerOpen(false)}
      onSelect={chooseFolder}
    />}
  </div>;
}
