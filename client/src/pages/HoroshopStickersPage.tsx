import { useEffect, useRef, useState, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { StyledSelect, type StyledSelectOption } from '../components/StyledSelect';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type { Sticker, StickerDirectoryEntry, StickerFilters, StickerItemStatus, StickerOperation, StickerOperationStatus, StickerPreparationProgress, StickerResolution } from '../types/horoshop-sticker';
import '../styles/horoshop-stickers.css';

const operationLabels: Record<StickerOperationStatus, string> = { draft: 'Перегляд змін', queued: 'У черзі', running: 'Застосовується', completed: 'Завершено', partial: 'Є помилки або конфлікти', stopped: 'Зупинено' };
const itemLabels: Record<StickerItemStatus, string> = { pending: 'Очікує', writing: 'Перевіряється', succeeded: 'Успішно', unchanged: 'Без змін', failed: 'Помилка', conflict: 'Конфлікт', cancelled: 'Зупинено' };
const titleFor = (titles: Record<string, string>, fallback: string) => titles.uk || titles.ua || titles.ru || titles.en || Object.values(titles)[0] || fallback;
const dateLabel = (date: string) => new Intl.DateTimeFormat('uk-UA', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(date));
const unique = (ids: string[]) => [...new Set(ids)];
const workspaceTabs = [{ id: 'products', label: 'Товари' }, { id: 'stickers', label: 'Стікери' }, { id: 'selections', label: 'Збережені вибірки' }, { id: 'history', label: 'Історія' }] as const;
type WorkspaceTab = typeof workspaceTabs[number]['id'];
type Preparation = { kind: 'preview' | 'rollback'; startedAt: number; progress: StickerPreparationProgress };
const preparationStages: Record<StickerPreparationProgress['stage'], string> = {
  checking: 'Перевіряємо вибірку', authenticating: 'Підключаємося до Хорошоп', directory: 'Отримуємо ручні стікери',
  catalog: 'Читаємо актуальний каталог', comparing: 'Порівнюємо стікери товарів', saving: 'Зберігаємо перегляд змін'
};

function FieldSelect({ label, value, options, searchable = false, onChange }: {
  label: string; value: string; options: StyledSelectOption[]; searchable?: boolean; onChange: (value: string) => void;
}) {
  return <label><span>{label}</span><StyledSelect ariaLabel={label} value={value} options={options} searchable={searchable} onChange={(value) => onChange(String(value))} /></label>;
}

function ModalShell({ children, labelledBy, className = '', onClose }: { children: ReactNode; labelledBy: string; className?: string; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => { document.body.style.overflow = overflow; if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  return <div className="hs-sticker-dialog-backdrop"><section ref={ref} tabIndex={-1} className={`hs-sticker-dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    if (event.key !== 'Tab') return;
    const elements = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
    const first = elements[0]; const last = elements.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) { event.preventDefault(); first?.focus(); }
  }}>{children}</section></div>;
}

function StickerChips({ stickers, compare, direction }: { stickers: Sticker[]; compare?: Sticker[]; direction?: 'add' | 'remove' }) {
  return <div className="hs-sticker-chips">{stickers.length ? stickers.map((sticker) => {
    const changed = compare && !compare.some((item) => sticker.id ? item.id === sticker.id : item.title === sticker.title);
    return <span key={`${sticker.id}:${sticker.title}`} className={changed ? `is-${direction}` : ''}>{changed && (direction === 'add' ? '+ ' : '− ')}{sticker.title}</span>;
  }) : <span className="is-empty">Немає</span>}</div>;
}

function StickerPicker({ label, directory, selected, disabledIds = [], disabled = false, adding = false, counts, total = 0,
  emptyMessage = 'Довідник стікерів порожній. Натисніть «Оновити», щоб завантажити його з Хорошоп.', onChange }: {
  label: string; directory: StickerDirectoryEntry[]; selected: string[]; disabledIds?: string[]; disabled?: boolean; adding?: boolean;
  counts?: Map<string, number>; total?: number; emptyMessage?: string; onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const items = directory.filter((item) => item.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <fieldset className="hs-sticker-picker">
    <legend>{label} <small>{selected.length ? `· ${selected.length}` : ''}</small></legend>
    <input aria-label={`Пошук: ${label}`} placeholder="Знайти стікер…" disabled={disabled} value={search} onChange={(e) => setSearch(e.target.value)} />
    <div>{items.map((item) => {
      const count = counts?.get(item.externalId) || 0;
      return <label key={item.externalId}>
      <input type="checkbox" aria-label={`${label}: ${item.title}`} checked={selected.includes(item.externalId)} disabled={disabled || disabledIds.includes(item.externalId) || (adding && (!item.enabled || (total > 0 && count === total)))}
        onChange={(e) => onChange(e.target.checked ? [...selected, item.externalId] : selected.filter((id) => id !== item.externalId))} />
      <span>{item.title}{!item.enabled && <small> · вимкнений у Хорошоп</small>}{counts && total > 0 && <small className="hs-sticker-presence">{adding ? count === total ? 'Вже є на всіх товарах' : `Додасться до ${total - count} із ${total} груп` : `Є на ${count} із ${total} груп`}</small>}</span>
    </label>;
    })}</div>
    {!directory.length && <p>{emptyMessage}</p>}
    {directory.length > 0 && !items.length && <p>За цим пошуком стікерів немає.</p>}
  </fieldset>;
}

function PreparationProgress({ preparation }: { preparation: Preparation }) {
  const ref = useRef<HTMLElement>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    const timer = globalThis.setInterval(() => setNow(Date.now()), 1_000);
    return () => globalThis.clearInterval(timer);
  }, []);
  const { progress } = preparation;
  const elapsed = Math.max(0, Math.floor((now - preparation.startedAt) / 1000));
  const determinate = ['comparing', 'saving'].includes(progress.stage) && progress.total > 0;
  const completedUnits = (progress.stage === 'saving' ? progress.total : 0) + progress.processed;
  const percentage = determinate ? Math.round(Math.min(progress.total * 2, Math.max(0, completedUnits)) / (progress.total * 2) * 100) : null;
  return <section ref={ref} className="hs-sticker-preparation" aria-label="Підготовка операції">
    <header><div>
      <h3>{preparation.kind === 'rollback' ? 'Готуємо повернення стікерів' : 'Готуємо перегляд змін'}</h3>
      <span>{preparationStages[progress.stage]}</span>
    </div><b>{percentage === null ? 'Триває' : `${percentage}%`}</b></header>
    <div className={`hs-sticker-preparation-track${percentage === null ? ' is-indeterminate' : ''}`}
      role="progressbar" aria-label="Прогрес підготовки стікерів" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage ?? undefined}>
      <span aria-hidden="true" style={{ width: percentage === null ? '38%' : `${percentage}%` }} />
    </div>
    <footer>
      <span role="status" aria-live="polite" aria-atomic="true">{determinate ? `${progress.processed.toLocaleString('uk-UA')} / ${progress.total.toLocaleString('uk-UA')} товарних груп`
        : progress.stage === 'catalog' ? `Отримано товарів: ${progress.productsRead.toLocaleString('uk-UA')}` : 'Очікуємо відповідь…'}</span>
      {progress.stage === 'catalog' && <span>Сторінок: {progress.pagesRead}</span>}
      <span aria-live="off">Час: {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>
    </footer>
  </section>;
}

function OperationDialog({ operation, pending, preparation, onAction, onClose, onPage }: {
  operation: StickerOperation; pending: boolean; preparation: Preparation | null; onAction: (action: 'apply' | 'stop' | 'retry' | 'rollback') => void; onClose: () => void; onPage: (page: number) => void;
}) {
  const working = ['queued', 'running'].includes(operation.status);
  const completed = operation.total - (operation.counts.pending || 0) - (operation.counts.writing || 0);
  return <ModalShell labelledBy="hs-operation-title" onClose={onClose}>
    <header><div><span className="hs-sticker-eyebrow">{operationLabels[operation.status]}</span><h2 id="hs-operation-title">{operation.name}</h2><p>{operation.actorName} · {dateLabel(operation.createdAt)}</p></div>
      <button className="button button--ghost" aria-label="Закрити операцію" disabled={!!preparation} onClick={onClose}><Icon name="close" /></button></header>
    {preparation && <PreparationProgress preparation={preparation} />}
    <div className="hs-sticker-operation-summary" aria-live="polite">
      <strong>{operation.total} товарних груп</strong><span>Зміняться: {operation.counts.pending || 0}</span><span>Успішно: {operation.counts.succeeded || 0}</span>
      <span>Без змін: {operation.counts.unchanged || 0}</span><span>Помилки: {(operation.counts.failed || 0) + (operation.counts.conflict || 0)}</span>
      {working && <><progress max={operation.total} value={completed} /><span>{completed} / {operation.total} · можна закрити це вікно та повернутися з історії</span></>}
      {operation.stopRequested && <span>Зупиняємо залишок і перевіряємо вже відправлені зміни.</span>}
    </div>
    {operation.kind === 'change' && operation.status === 'draft' && <p className="hs-sticker-muted">Перегляд створено за останнім синхронізованим каталогом. Перед записом перевіримо актуальні стікери й склад товарів у Хорошоп; змінені позиції пропустимо.</p>}
    <div className="hs-sticker-table-wrap"><table><thead><tr><th>Товар / артикул</th><th>Було</th><th>Стане / результат</th><th>Статус</th></tr></thead>
      <tbody>{operation.items.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><small>{item.article} · {item.membership.length} модифікацій</small></td>
        <td><StickerChips stickers={item.before} compare={item.after} direction="remove" /></td><td><StickerChips stickers={item.after} compare={item.before} direction="add" /></td>
        <td><span className={`hs-sticker-status is-${item.status}`}>{itemLabels[item.status]}</span>{item.message && <small>{item.message}</small>}</td></tr>)}</tbody></table></div>
    <footer><div className="hs-sticker-pager"><button disabled={operation.page <= 1} onClick={() => onPage(operation.page - 1)}>Назад</button><span>{operation.page} / {operation.pageCount || 1}</span><button disabled={operation.page >= operation.pageCount} onClick={() => onPage(operation.page + 1)}>Далі</button></div>
      <a className="button button--ghost" href={api.horoshopStickers.reportUrl(operation.id)}>Завантажити звіт</a>
      {operation.status === 'draft' && <button className="button button--primary" disabled={pending || !operation.counts.pending} onClick={() => onAction('apply')}><Icon name="check" />Застосувати зміни ({operation.counts.pending || 0})</button>}
      {working && <button className="button button--ghost" disabled={pending || operation.stopRequested} onClick={() => onAction('stop')}>Зупинити залишок</button>}
      {!working && operation.status !== 'draft' && <>
        <button className="button button--ghost" disabled={pending || !((operation.counts.failed || 0) + (operation.counts.cancelled || 0))} onClick={() => onAction('retry')}>Повторити невдалі</button>
        <button className="button button--ghost" disabled={pending || !operation.counts.succeeded} onClick={() => onAction('rollback')}><Icon name="undo" />Повернути зміни</button>
      </>}
    </footer>
  </ModalShell>;
}

export function HoroshopStickersPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const operationId = params.get('operation') || '';
  const [operationPage, setOperationPage] = useState(1);
  const [filters, setFilters] = useState<StickerFilters>({ page: 1, pageSize: 25 });
  const [selected, setSelected] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('products');
  const workspaceRef = useRef<HTMLElement>(null);
  const switchTab = (tab: WorkspaceTab) => { setActiveTab(tab); workspaceRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); };
  const [name, setName] = useState('');
  const [selectionName, setSelectionName] = useState('');
  const [entries, setEntries] = useState('');
  const [resolution, setResolution] = useState<StickerResolution | null>(null);
  const [addIds, setAddIds] = useState<string[]>([]);
  const [removeIds, setRemoveIds] = useState<string[]>([]);
  const [savedId, setSavedId] = useState('');
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  const incompleteFilter = ['present', 'missing'].includes(filters.stickerMode || '') && !filters.stickerId;
  // The catalog also supplies filter options, so keep loading it until a sticker can be chosen.
  const catalogFilters = incompleteFilter ? { ...filters, stickerMode: undefined, stickerId: undefined } : filters;
  const catalog = useQuery({ queryKey: ['horoshop-sticker-catalog', catalogFilters], queryFn: ({ signal }) => api.horoshopStickers.catalog(catalogFilters, signal),
    placeholderData: keepPreviousData });
  const history = useQuery({ queryKey: ['horoshop-sticker-history'], queryFn: api.horoshopStickers.history, refetchInterval: activeTab === 'history' ? 5_000 : false });
  const selections = useQuery({ queryKey: ['horoshop-sticker-selections'], queryFn: api.horoshopStickers.selections });
  const selectionSummary = useQuery({ queryKey: ['horoshop-sticker-selection-summary', [...selected].sort()],
    queryFn: ({ signal }) => api.horoshopStickers.selectionSummary(selected, signal), enabled: activeTab === 'stickers' && selected.length > 0 });
  const operation = useQuery({ queryKey: ['horoshop-sticker-operation', operationId, operationPage], queryFn: () => api.horoshopStickers.detail(operationId, operationPage), enabled: !!operationId,
    refetchInterval: (query) => ['queued', 'running'].includes(query.state.data?.status || '') ? 2_000 : false });
  const task = useMutation({ mutationFn: async (fn: () => Promise<unknown>) => fn() });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['horoshop-sticker-catalog'] });
    void queryClient.invalidateQueries({ queryKey: ['horoshop-sticker-history'] });
    void queryClient.invalidateQueries({ queryKey: ['horoshop-sticker-selections'] });
    void queryClient.invalidateQueries({ queryKey: ['horoshop-sticker-operation'] });
    void queryClient.invalidateQueries({ queryKey: ['horoshop-sticker-selection-summary'] });
  };
  const run = async (fn: () => Promise<unknown>) => {
    try { await task.mutateAsync(fn); refresh(); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Не вдалося виконати дію.', 'error'); }
  };
  const openOperation = (value: StickerOperation) => {
    setOperationPage(1);
    queryClient.setQueryData(['horoshop-sticker-operation', value.id, 1], value);
    setParams({ operation: value.id });
  };
  const updateFilter = <K extends keyof StickerFilters>(key: K, value: StickerFilters[K]) => setFilters((previous) => ({ ...previous, [key]: value, page: 1 }));
  const toggle = (id: string) => setSelected((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]);
  const data = catalog.data;
  const directory = data?.directory || [];
  const counts = new Map(selectionSummary.data?.stickers.map((item) => [item.externalId, item.productCount]) || []);
  const removable = selectionSummary.data?.stickers.filter((item) => directory.some((entry) => entry.externalId === item.externalId)) || [];
  const activeRemoveIds = removeIds.filter((id) => removable.some((item) => item.externalId === id));
  const activeAddIds = addIds.filter((id) => directory.some((item) => item.externalId === id && item.enabled) && counts.get(id) !== selected.length);
  const selectionReady = !!selectionSummary.data && !selectionSummary.isFetching && !selectionSummary.isError;
  useEffect(() => {
    if (!selected.length) {
      setRemoveIds((previous) => previous.length ? [] : previous);
      setAddIds((previous) => previous.length ? [] : previous);
      return;
    }
    if (!selectionSummary.data || selectionSummary.isFetching) return;
    const ids = new Set(selectionSummary.data.stickers.map((item) => item.externalId));
    setRemoveIds((previous) => previous.every((id) => ids.has(id)) ? previous : previous.filter((id) => ids.has(id)));
  }, [selected.length, selectionSummary.data, selectionSummary.isFetching]);
  const pageIds = data?.items.map((p) => p.id) || [];
  const busy = task.isPending;
  const prepare = (kind: Preparation['kind'], total: number, fn: (onProgress: (progress: StickerPreparationProgress) => void) => Promise<StickerOperation>) => void run(async () => {
    setPreparation({ kind, startedAt: Date.now(), progress: { stage: 'checking', total, processed: 0, productsRead: 0, pagesRead: 0 } });
    try {
      const value = await fn((progress) => setPreparation((previous) => previous ? { ...previous, progress } : previous));
      openOperation(value);
    } finally { setPreparation(null); }
  });
  const previewChanges = () => prepare('preview', selected.length, (onProgress) => api.horoshopStickers.preview({ productIds: selected, addIds: activeAddIds, removeIds: activeRemoveIds, name: name || undefined }, onProgress));
  const previewDisabled = busy || !selected.length || !selectionReady || !(activeAddIds.length || activeRemoveIds.length);
  const onAction = (action: 'apply' | 'stop' | 'retry' | 'rollback') => action === 'rollback'
    ? prepare('rollback', operation.data?.counts.succeeded || 0, (onProgress) => api.horoshopStickers.action(operationId, action, onProgress))
    : void run(async () => openOperation(await api.horoshopStickers.action(operationId, action)));

  return <main className="hs-stickers" ref={workspaceRef}>
    <header className="hs-stickers-heading"><div><span className="hs-sticker-eyebrow">Інструменти Хорошоп</span><h1>Стікери Хорошоп</h1><p>Оберіть товарні групи, додайте або зніміть ручні стікери та перевірте результат.</p>{data?.lastSyncAt && <p className="hs-sticker-sync-time">Каталог синхронізовано: {dateLabel(data.lastSyncAt)}</p>}</div>
      <div>{data && <span className="hs-sticker-store">{data.storeDomain}</span>}<button className="button button--ghost" disabled={busy} onClick={() => void run(() => api.horoshopStickers.refreshDirectory())}><Icon name="refresh" />Оновити</button></div></header>
    {catalog.isError && <div className="hs-sticker-notice is-error" role="alert">{catalog.error.message} <Link to="/admin/integrations">Підключення Хорошоп</Link></div>}
    {data?.directoryWarning && <div className="hs-sticker-notice" role="alert">{data.directoryWarning}</div>}
    <div className="hs-sticker-workspace-nav"><div className="hs-sticker-tabs" role="tablist" aria-label="Розділи інструмента стікерів">
      {workspaceTabs.map((tab, index) => <button key={tab.id} type="button" role="tab" id={`hs-tab-${tab.id}`} aria-controls={`hs-panel-${tab.id}`} aria-label={tab.label}
        aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => switchTab(tab.id)} onKeyDown={(event) => {
          const next = event.key === 'ArrowRight' ? (index + 1) % workspaceTabs.length : event.key === 'ArrowLeft' ? (index + workspaceTabs.length - 1) % workspaceTabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? workspaceTabs.length - 1 : null;
          if (next === null) return;
          event.preventDefault(); switchTab(workspaceTabs[next].id); document.getElementById(`hs-tab-${workspaceTabs[next].id}`)?.focus();
        }}>{tab.label}{tab.id === 'stickers' && selected.length > 0 && <span>{selected.length}</span>}</button>)}
    </div>{selected.length > 0 && <div className="hs-sticker-selection-summary"><strong>Обрано {selected.length} груп</strong><button disabled={busy} onClick={() => { setSelected([]); setAddIds([]); setRemoveIds([]); }}>Зняти вибір</button>{activeTab === 'products' && <button className="button button--primary" onClick={() => switchTab('stickers')}>До стікерів <Icon name="chevronRight" /></button>}</div>}</div>
    {preparation && !(operation.data && operationId) && <PreparationProgress preparation={preparation} />}
    {activeTab === 'products' && <section role="tabpanel" id="hs-panel-products" aria-labelledby="hs-tab-products"><div className="hs-stickers-layout"><aside className="hs-sticker-filters">
      <h2>Знайти товари</h2>
      <label>Назва або артикул<input placeholder="Пошук у товарах і модифікаціях" value={filters.search || ''} onChange={(e) => updateFilter('search', e.target.value || undefined)} /></label>
      <FieldSelect label="Категорія" value={filters.category || ''} searchable onChange={(value) => updateFilter('category', value || undefined)} options={[{ value: '', label: 'Усі категорії' }, ...(data?.categories.map((c) => ({ value: c.externalId, label: c.title })) || [])]} />
      <label className="hs-sticker-checkbox"><input type="checkbox" checked={filters.includeChildren !== false} onChange={(e) => updateFilter('includeChildren', e.target.checked)} />Включати підкатегорії</label>
      <FieldSelect label="Бренд" value={filters.brand || ''} searchable onChange={(value) => updateFilter('brand', value || undefined)} options={[{ value: '', label: 'Усі бренди' }, ...(data?.brands.map((b) => ({ value: b, label: b })) || [])]} />
      <FieldSelect label="Наявність" value={filters.availability || ''} onChange={(value) => updateFilter('availability', value || undefined)} options={[{ value: '', label: 'Будь-яка наявність' }, ...(data?.availabilityOptions.map((a) => ({ value: a, label: a })) || [])]} />
      <FieldSelect label="Видимість" value={filters.visibility || 'all'} onChange={(value) => updateFilter('visibility', value as StickerFilters['visibility'])} options={[{ value: 'all', label: 'Усі товари' }, { value: 'visible', label: 'Видимі на сайті' }, { value: 'hidden', label: 'Приховані / є приховані модифікації' }]} />
      <div className="hs-sticker-pair"><label>Ціна від<input type="number" min="0" value={filters.priceMin ?? ''} onChange={(e) => updateFilter('priceMin', e.target.value === '' ? undefined : Number(e.target.value))} /></label><label>Ціна до<input type="number" min="0" value={filters.priceMax ?? ''} onChange={(e) => updateFilter('priceMax', e.target.value === '' ? undefined : Number(e.target.value))} /></label></div>
      <div className="hs-sticker-pair"><label>Додані від<input type="date" value={filters.createdFrom || ''} onChange={(e) => updateFilter('createdFrom', e.target.value || undefined)} /></label><label>Додані до<input type="date" value={filters.createdTo || ''} onChange={(e) => updateFilter('createdTo', e.target.value || undefined)} /></label></div>
      <FieldSelect label="Стікери" value={filters.stickerMode || 'all'} onChange={(value) => updateFilter('stickerMode', value as StickerFilters['stickerMode'])} options={[{ value: 'all', label: 'Будь-які стікери' }, { value: 'present', label: 'Має вибраний стікер' }, { value: 'missing', label: 'Не має вибраного стікера' }, { value: 'none', label: 'Без ручних стікерів' }]} />
      {['present', 'missing'].includes(filters.stickerMode || '') && <FieldSelect label="Стікер для фільтра" value={filters.stickerId || ''} onChange={(value) => updateFilter('stickerId', value || undefined)} options={[{ value: '', label: 'Оберіть стікер' }, ...directory.map((s) => ({ value: s.externalId, label: s.title }))]} />}
      <button className="button button--ghost" onClick={() => setFilters({ page: 1, pageSize: 25 })}>Скинути фільтри</button>
    </aside><section className="hs-sticker-catalog">
      <details className="hs-sticker-import"><summary><Icon name="upload" />Вставити список артикулів</summary>
        <p>Скопіюйте стовпець артикулів із Excel. Артикул модифікації вибирає всю товарну групу.</p>
        <textarea aria-label="Список артикулів" placeholder={'Артикул 1\nАртикул 2\nАртикул 3'} rows={5} value={entries} onChange={(e) => setEntries(e.target.value)} />
        <button className="button button--primary" disabled={busy || !entries.trim()} onClick={() => void run(async () => {
          const result = await api.horoshopStickers.resolve(entries.split(/[\r\n\t;,]+/u).map((line) => line.trim()).filter(Boolean));
          setResolution(result); setSelected((previous) => unique([...previous, ...result.productIds]));
        })}>Знайти й додати до вибірки</button>
        {resolution && <div className="hs-sticker-resolution" aria-live="polite"><p>Знайдено груп: {resolution.productIds.length} · дублікати: {resolution.duplicates}</p>
          {!!resolution.unmatched.length && <p>Не знайдено: {resolution.unmatched.join(', ')}</p>}
          {resolution.ambiguous.map((item) => <div key={item.input}><strong>Уточніть «{item.input}»:</strong>{item.candidates.map((c) => <button key={c.id} onClick={() => {
            setSelected((previous) => unique([...previous, c.id])); setResolution({ ...resolution, ambiguous: resolution.ambiguous.filter((a) => a.input !== item.input) });
          }}>{c.title} · {c.sku}</button>)}</div>)}
        </div>}
      </details>
      <div className="hs-sticker-catalog-toolbar"><strong>{data?.total || 0} товарних груп</strong><span>Обрано: {selected.length}</span>
        <button disabled={busy || !pageIds.length || catalog.isFetching || incompleteFilter} onClick={() => setSelected((previous) => unique([...previous, ...pageIds]))}>Вибрати цю сторінку</button>
        <button disabled={busy || !data?.total || catalog.isFetching || incompleteFilter} onClick={() => void run(async () => {
          const result = await api.horoshopStickers.select(filters); setSelected(result.productIds);
        })}>Вибрати всі {data?.total || 0} за фільтром</button></div>
      {catalog.isFetching && <p className="hs-sticker-loading" role="status">Завантажуємо товари…</p>}
      {incompleteFilter && <p className="hs-sticker-loading" role="status">Оберіть стікер для фільтра.</p>}
      <div className="hs-sticker-table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="Вибрати всі товари сторінки" disabled={busy || catalog.isFetching || incompleteFilter} checked={!!pageIds.length && pageIds.every((id) => selected.includes(id))} onChange={(e) => setSelected((previous) => e.target.checked ? unique([...previous, ...pageIds]) : previous.filter((id) => !pageIds.includes(id)))} /></th><th>Товар</th><th>Наявність / ціна</th><th>Поточні стікери</th></tr></thead>
        <tbody>{data?.items.map((product) => <tr key={product.id} className={selected.includes(product.id) ? 'is-selected' : ''}>
          <td><input type="checkbox" aria-label={`Обрати ${product.sku}`} disabled={busy || catalog.isFetching || incompleteFilter} checked={selected.includes(product.id)} onChange={() => toggle(product.id)} /></td>
          <td><div className="hs-sticker-product">{product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <span className="hs-sticker-image-empty"><Icon name="productCard" /></span>}
            <div><strong>{titleFor(product.titles, product.sku)}</strong><small>{product.sku} · {product.brand || 'Без бренду'} · {data.categories.find((c) => c.externalId === product.categoryExternalId)?.title || 'Без категорії'}</small>
              {!!product.modifications.length && <details><summary>{product.modifications.length} модифікацій</summary>{product.modifications.map((m) => <small key={m.id}>{m.sku} · {titleFor(m.titles, m.sku)} · {m.availability || '—'}</small>)}</details>}
              {product.canonicalUrl && <a href={product.canonicalUrl} target="_blank" rel="noreferrer">Товар на сайті ↗</a>}
            </div></div></td><td>{product.availability || '—'}<small>{product.price === null ? '—' : `${Number(product.price).toLocaleString('uk-UA')} ₴`}</small></td>
          <td><StickerChips stickers={product.stickers} /></td></tr>)}</tbody></table></div>
      {!catalog.isFetching && data && !data.items.length && <p className="hs-sticker-loading">За цими умовами товарів немає.</p>}
      <div className="hs-sticker-pager"><button disabled={(filters.page || 1) <= 1 || catalog.isFetching} onClick={() => setFilters({ ...filters, page: (filters.page || 1) - 1 })}>Назад</button><span>Сторінка {filters.page || 1} / {data?.pageCount || 1}</span><button disabled={!data || (filters.page || 1) >= data.pageCount || catalog.isFetching} onClick={() => setFilters({ ...filters, page: (filters.page || 1) + 1 })}>Далі</button></div>
    </section></div></section>}
    {activeTab === 'stickers' && <section role="tabpanel" id="hs-panel-stickers" aria-labelledby="hs-tab-stickers" className="hs-sticker-actions">
      {!selected.length ? <div className="hs-sticker-empty"><h2>Спочатку оберіть товари</h2><p>Список стікерів для зняття залежить від вашої вибірки.</p><button className="button button--primary" onClick={() => switchTab('products')}>Обрати товари</button></div> : <>
        <div className="hs-sticker-action-heading"><div><h2>Зміни для {selected.length} товарних груп</h2><p>Інші стікери збережуться. Зміни охоплюють усі модифікації товару.</p></div><button className="button button--ghost" onClick={() => switchTab('products')}>Змінити вибір товарів</button></div>
        {selectionSummary.isFetching && <p role="status">Перевіряємо стікери вибраних товарів…</p>}
        {selectionSummary.isError && <div className="hs-sticker-notice is-error" role="alert">{selectionSummary.error.message} <button onClick={() => void selectionSummary.refetch()}>Повторити</button></div>}
        <div className="hs-sticker-pair"><div><p className="hs-sticker-picker-hint">Доступні ручні стікери. Ті, що вже є на всіх товарах, додавати не потрібно.</p>
          <StickerPicker label="Додати стікери" directory={directory.filter((item) => item.enabled)} selected={activeAddIds} disabledIds={activeRemoveIds} disabled={!selectionReady || busy} adding counts={counts} total={selected.length}
            emptyMessage={directory.length ? 'Немає увімкнених ручних стікерів для додавання.' : 'Ручних стікерів немає. Натисніть «Оновити», щоб перечитати довідник Хорошоп.'} onChange={setAddIds} /></div>
          <div><p className="hs-sticker-picker-hint">Тільки ручні стікери, які є хоча б на одному вибраному товарі.</p>
          <StickerPicker label="Зняти стікери" directory={selectionReady ? removable : []} selected={activeRemoveIds} disabledIds={activeAddIds} disabled={!selectionReady || busy} counts={counts} total={selected.length}
            emptyMessage={selectionReady ? 'На вибраних товарах немає ручних стікерів для зняття.' : 'Очікуємо дані вибірки.'} onChange={setRemoveIds} /></div></div>
        <footer className="hs-sticker-action-footer"><label>Назва операції<input value={name} disabled={busy} maxLength={160} onChange={(e) => setName(e.target.value)} placeholder="Наприклад, Осіння акція" /></label>
          <div><span>Додати: {activeAddIds.length} · зняти: {activeRemoveIds.length}</span><button className="button button--primary" disabled={previewDisabled} onClick={previewChanges}><Icon name="search" />{busy ? 'Перевіряємо…' : 'Переглянути зміни'}</button></div></footer>
      </>}
    </section>}
    {activeTab === 'selections' && <section role="tabpanel" id="hs-panel-selections" aria-labelledby="hs-tab-selections" className="hs-sticker-selections">
      <section className="hs-sticker-saved-card"><h2>Зберегти поточну вибірку</h2><p>Обрано {selected.length} товарних груп. Збережіть їх, щоб повернутися до роботи пізніше.</p>
        <label>Назва вибірки<input value={selectionName} maxLength={160} onChange={(e) => setSelectionName(e.target.value)} placeholder="Наприклад, Товари для осінньої акції" /></label>
        <button className="button button--primary" disabled={busy || !selectionName.trim() || !selected.length} onClick={() => void run(() => api.horoshopStickers.saveSelection(selectionName.trim(), selected))}><Icon name="save" />Зберегти вибірку</button>
      </section><section className="hs-sticker-saved-card"><h2>Завантажити збережену вибірку</h2><p>Завантаження замінить поточний вибір товарів і очистить налаштовані дії зі стікерами.</p>
        {selections.isError && <p role="alert">Не вдалося завантажити вибірки.</p>}
        {!selections.isPending && !selections.data?.length && !selections.isError && <p>Збережених вибірок поки немає.</p>}
        <FieldSelect label="Збережені вибірки" value={savedId} searchable onChange={setSavedId} options={[{ value: '', label: 'Оберіть вибірку' }, ...(selections.data?.map((s) => ({ value: s.id, label: `${s.name} · ${s.productIds.length}` })) || [])]} />
        <div><button className="button button--primary" disabled={!savedId || busy} onClick={() => { const saved = selections.data?.find((s) => s.id === savedId); if (saved) { setSelected(saved.productIds); setName(saved.name); setSelectionName(saved.name); setAddIds([]); setRemoveIds([]); switchTab('stickers'); } }}>Завантажити вибірку</button>
          <button className="button button--ghost" disabled={!savedId || busy} onClick={() => void run(async () => { await api.horoshopStickers.removeSelection(savedId); setSavedId(''); })}>Видалити вибірку</button></div>
      </section>
    </section>}
    {activeTab === 'history' && <section role="tabpanel" id="hs-panel-history" aria-labelledby="hs-tab-history" className="hs-sticker-history"><header><h2><Icon name="history" />Історія операцій</h2><span>Прогрес зберігається після закриття сторінки</span></header>
      {history.isError && <p role="alert">Не вдалося завантажити історію.</p>}
      {!history.data?.length && <p>Підготовлені та виконані операції з’являться тут.</p>}
      {history.data?.map((op) => <button key={op.id} className="hs-sticker-history-row" onClick={() => { setOperationPage(1); setParams({ operation: op.id }); }}><strong>{op.name}</strong><span>{operationLabels[op.status]}</span><small>{op.actorName} · {dateLabel(op.createdAt)}</small><Icon name="chevronRight" /></button>)}
    </section>}
    {!!operationId && !operation.data && <div className="hs-sticker-notice" role="status">{operation.isError ? operation.error.message : 'Завантажуємо операцію…'} <button onClick={() => setParams({})}>Закрити</button></div>}
    {operation.data && operationId && <OperationDialog operation={operation.data} pending={busy} preparation={preparation} onAction={onAction} onClose={() => { if (!preparation) { setParams({}); refresh(); } }} onPage={setOperationPage} />}
  </main>;
}
