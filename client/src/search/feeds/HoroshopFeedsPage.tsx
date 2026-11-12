import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { HoroshopCatalogSyncProgress } from '../../components/HoroshopCatalogSyncProgress';
import { HoroshopProductSearchDialog } from '../../components/HoroshopProductSearchDialog';
import { Icon } from '../../components/Icon';
import { ModalDialog } from '../../components/ModalDialog';
import { StyledSelect } from '../../components/StyledSelect';
import { api } from '../../lib/api';
import { useToast } from '../../toast/ToastContext';
import type { FeedAction, FeedChoice, FeedFilters, FeedOperation, FeedProduct, FeedResolution, FeedState } from '../../types/horoshop-feeds';
import { FeedOperationRows, actionLabel, choices, feedLabels, stateLabels, statusLabels } from './FeedOperationRows';
import '../../styles/horoshop-popularity.css';
import '../../styles/horoshop-feeds.css';

const emptyFilters: FeedFilters = { search: '', category: '', brands: [], availability: '', google: '', facebook: '' };
const feedStatusOptions: Array<{ value: FeedState | ''; label: string }> =
  (['enabled', 'disabled'] as const).map((value) => ({ value, label: stateLabels[value] }));
const number = (value: number) => value.toLocaleString('uk-UA');
const date = (value: string) => new Date(value).toLocaleString('uk-UA');
const active = (status?: string) => status === 'queued' || status === 'running';
type Display = 'catalog' | 'preview' | 'progress' | 'result' | 'history';

export function HoroshopFeedsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [filters, setFilters] = useState<FeedFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allFiltered, setAllFiltered] = useState(false);
  const [listIds, setListIds] = useState<string[] | null>(null);
  const [resolution, setResolution] = useState<FeedResolution | null>(null);
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [searchText, setSearchText] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [brandSearch, setBrandSearch] = useState('');
  const brandRef = useRef<HTMLDetailsElement>(null);
  const [action, setAction] = useState<FeedAction>({ google: 'keep', facebook: 'keep' });
  const [drawer, setDrawer] = useState<'bulk' | 'single' | null>(null);
  const [single, setSingle] = useState<FeedProduct | null>(null);
  const [display, setDisplay] = useState<Display>('catalog');
  const [draft, setDraft] = useState<FeedOperation | null>(null);
  const [operationId, setOperationId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingPreview, setPendingPreview] = useState<{ productIds: string[]; action: FeedAction } | null>(null);

  const catalog = useQuery({
    queryKey: ['horoshop-feeds-catalog', filters, page, pageSize, listIds],
    queryFn: ({ signal }) => listIds === null ? api.horoshopFeeds.catalog(filters, page, pageSize, signal)
      : api.horoshopFeeds.catalogSelection(listIds, filters, page, pageSize, signal),
    placeholderData: (previous) => previous,
    refetchInterval: (query) => query.state.data?.integration.status === 'syncing'
      || query.state.data?.integration.latestRun?.status === 'running' ? 2_000 : false
  });
  const history = useQuery({
    queryKey: ['horoshop-feeds-history'], queryFn: ({ signal }) => api.horoshopFeeds.history(signal),
    enabled: display === 'history', refetchOnMount: 'always',
    refetchInterval: (query) => query.state.data?.some((item) => active(item.status)) ? 2_000 : false
  });
  const operationQuery = useQuery({
    queryKey: ['horoshop-feeds-operation', operationId],
    queryFn: ({ signal }) => api.horoshopFeeds.operation(operationId, signal),
    enabled: Boolean(operationId) && display !== 'preview',
    refetchInterval: (query) => active(query.state.data?.status) ? 1_500 : false
  });
  const operation = operationQuery.data || draft;
  const data = catalog.data;
  const integration = data?.integration;
  const syncing = integration?.status === 'syncing' || integration?.latestRun?.status === 'running';
  const canSelect = !busy && !catalog.isFetching && !syncing && integration?.status === 'connected';
  const selectedCount = selected.size;
  const categories = useMemo(() => new Map((data?.categories || []).map((item) => [item.externalId, item.title])), [data?.categories]);
  const pageSelected = Boolean(data?.items.length && data.items.every((item) => selected.has(item.id)));
  const somePageSelected = Boolean(data?.items.some((item) => selected.has(item.id)));
  const visibleBrands = (data?.brands || []).filter((brand) => brand.toLocaleLowerCase('uk-UA').includes(brandSearch.toLocaleLowerCase('uk-UA')));
  const drawerCount = drawer === 'single' ? 1 : selectedCount;
  const done = operation ? ['succeeded', 'unchanged', 'failed', 'conflict', 'cancelled'].reduce((total, key) => total + (operation.counts[key as keyof typeof operation.counts] || 0), 0) : 0;

  useEffect(() => {
    if (!operationQuery.data || active(operationQuery.data.status) || operationQuery.data.status === 'draft') return;
    if (display === 'progress') setDisplay('result');
    void queryClient.invalidateQueries({ queryKey: ['horoshop-feeds-catalog'] });
    void queryClient.invalidateQueries({ queryKey: ['horoshop-feeds-history'] });
  }, [operationQuery.data, display, queryClient]);

  useEffect(() => {
    if (listIds === null || catalog.isPlaceholderData || !data?.matchingProductIds) return;
    const matching = new Set(data.matchingProductIds);
    setSelected((current) => [...current].every((id) => matching.has(id)) ? current
      : new Set([...current].filter((id) => matching.has(id))));
  }, [listIds, catalog.isPlaceholderData, data?.matchingProductIds]);

  useEffect(() => {
    const close = (event: Event) => {
      if (brandRef.current && !brandRef.current.contains(event.target as Node)) { brandRef.current.open = false; setBrandSearch(''); }
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && brandRef.current) brandRef.current.open = false; };
    document.addEventListener('pointerdown', close); document.addEventListener('focusin', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('focusin', close); document.removeEventListener('keydown', escape); };
  }, []);

  const fail = (value: unknown) => setError(value instanceof Error ? value.message : 'Не вдалося виконати операцію.');
  function clearSelection() { setSelected(new Set()); setAllFiltered(false); }
  function changeFilters(change: Partial<FeedFilters>) {
    setFilters((current) => ({ ...current, ...change })); setPage(1); clearSelection();
    setResolution(null); setResolved({}); setError('');
  }
  function toggle(id: string, checked: boolean) {
    setAllFiltered(false);
    setSelected((current) => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next; });
  }
  function togglePage(checked: boolean) {
    setAllFiltered(false);
    setSelected((current) => { const next = new Set(current); for (const item of data?.items || []) { if (checked) next.add(item.id); else next.delete(item.id); } return next; });
  }
  async function selectAll() {
    if (allFiltered) { clearSelection(); return; }
    setBusy(true); setError('');
    try {
      const result = await api.horoshopFeeds.select(filters, listIds || undefined);
      setSelected(new Set(result.productIds)); setAllFiltered(true);
    } catch (value) { fail(value); } finally { setBusy(false); }
  }
  function openSearch() { setSearchDraft(searchText); setSearchOpen(true); setError(''); }
  async function search() {
    const value = searchDraft.trim();
    const entries = value.split(/\r?\n/u).map((entry) => entry.trim()).filter(Boolean);
    if (entries.length < 2) { setSearchText(value); setListIds(null); changeFilters({ search: value }); setSearchOpen(false); return; }
    setBusy(true); setError('');
    try {
      const result = await api.horoshopFeeds.resolve(entries);
      changeFilters({ search: '' }); setSearchText(value); setResolution(result);
      setListIds(result.matched.map((item) => item.productId)); setSelected(new Set(result.matched.map((item) => item.productId))); setSearchOpen(false);
    } catch (value) { fail(value); } finally { setBusy(false); }
  }
  function openAction(product?: FeedProduct) {
    setSingle(product || null); setDrawer(product ? 'single' : 'bulk'); setAction({ google: 'keep', facebook: 'keep' }); setError('');
  }
  async function prepare(input: { productIds: string[]; action: FeedAction }) {
    setPendingPreview(input); setDrawer(null); setDraft(null); setOperationId(''); setDisplay('preview'); setBusy(true); setError('');
    try {
      const result = await api.horoshopFeeds.preview({ productIds: input.productIds }, input.action);
      setDraft(result); setOperationId(result.id);
    } catch (value) { fail(value); } finally { setBusy(false); }
  }
  async function apply() {
    if (!operation || operation.status !== 'draft') return;
    setBusy(true); setError('');
    try {
      const result = await api.horoshopFeeds.apply(operation.id);
      queryClient.setQueryData(['horoshop-feeds-operation', result.id], result);
      setDraft(result); setOperationId(result.id); setDisplay('progress');
      void queryClient.invalidateQueries({ queryKey: ['horoshop-feeds-history'] });
      void queryClient.invalidateQueries({ queryKey: ['horoshop-feeds-operation', result.id] });
    } catch (value) { fail(value); } finally { setBusy(false); }
  }
  async function sync() {
    setBusy(true); setError('');
    try {
      const result = await api.horoshopFeeds.sync(); clearSelection();
      showToast(result.started ? 'Синхронізацію каталогу запущено.' : 'Каталог уже синхронізується або зайнятий іншою операцією.', result.started ? 'success' : 'error');
      await queryClient.invalidateQueries({ queryKey: ['horoshop-feeds-catalog'] });
    } catch (value) { fail(value); } finally { setBusy(false); }
  }
  const go = (next: Display) => { setError(''); setDisplay(next); };

  return <div className="hp-page hf-page">
    <header className="hp-heading"><div><p className="eyebrow">Інструменти / Хорошоп</p><h1>Товарні фіди</h1><p>Керуйте участю товарів у Google Merchant Center та Facebook.</p></div><div className="hp-heading-actions">
      <button className="button button--secondary" type="button" onClick={() => go('history')}>Історія змін</button>
      <button className="button button--secondary" type="button" disabled={busy || syncing || !integration?.configured} onClick={() => void sync()}><Icon name="refresh" size={16} />{syncing ? 'Синхронізуємо…' : 'Оновити каталог'}</button>
    </div></header>
    {catalog.isLoading && <div className="hp-panel hp-center">Завантажуємо каталог…</div>}
    {catalog.isError && <div className="hf-error" role="alert">Не вдалося завантажити каталог. <button className="hp-link" type="button" onClick={() => void catalog.refetch()}>Повторити</button></div>}
    {integration && !integration.configured && <section className="hp-panel hp-empty"><h2>Підключіть магазин Хорошоп</h2><p>Інструмент використовує спільне API-підключення та каталог магазину.</p><Link to="/admin/integrations" className="button button--primary">Налаштування інтеграції</Link></section>}
    {integration?.configured && <>
      <div className="hp-status"><span className="hp-status-dot" />{syncing ? 'Каталог синхронізується' : 'Магазин підключено'} · {number(integration.counts?.products ?? data?.total ?? 0)} товарів{integration.lastSyncAt && <> · Синхронізовано {date(integration.lastSyncAt)}</>}</div>
      {(syncing || integration.status === 'error') && <HoroshopCatalogSyncProgress integration={integration} />}
      <nav className="hp-tabs" aria-label="Розділи інструмента"><button className={display === 'history' ? '' : 'is-active'} type="button" onClick={() => go('catalog')}>Каталог</button><button className={display === 'history' ? 'is-active' : ''} type="button" onClick={() => go('history')}>Історія операцій</button></nav>
      {error && !drawer && !searchOpen && <div className="hf-error" role="alert">{error}</div>}

      {display === 'catalog' && <section className="hp-panel" aria-label="Каталог товарів">
        <div className="hp-filters hf-filters">
          <div className="hp-search hp-filter-field"><span>Назва або артикул</span><button className="hp-search-trigger" type="button" aria-label="Назва або артикул" disabled={busy} onClick={openSearch}><span>{listIds === null ? searchText || 'Введіть назву або артикул' : `Список із ${searchText.split(/\r?\n/u).length} значень`}</span><Icon name="chevronRight" size={16} /></button></div>
          <label><span>Категорія</span><StyledSelect ariaLabel="Категорія" disabled={busy} value={filters.category} searchable options={[{ value: '', label: 'Усі категорії' }, ...(data?.categories || []).map((item) => ({ value: item.externalId, label: item.title }))]} onChange={(category) => changeFilters({ category })} /></label>
          <details ref={brandRef} className="hp-brand-filter"><summary><span>Бренди</span><strong>{filters.brands.length ? filters.brands.join(', ') : 'Усі бренди'}<Icon name="chevronRight" size={16} /></strong></summary><div>
            <input className="hp-brand-search" type="search" aria-label="Пошук бренду" disabled={busy} placeholder="Знайти бренд" value={brandSearch} onChange={(event) => setBrandSearch(event.target.value)} />
            {visibleBrands.map((brand) => <label key={brand}><input type="checkbox" disabled={busy} checked={filters.brands.includes(brand)} onChange={(event) => changeFilters({ brands: event.target.checked ? [...filters.brands, brand] : filters.brands.filter((item) => item !== brand) })} />{brand}</label>)}
            {!visibleBrands.length && <p>Брендів не знайдено.</p>}{filters.brands.length > 0 && <button type="button" onClick={() => changeFilters({ brands: [] })}>Очистити</button>}
          </div></details>
          <label><span>Наявність</span><StyledSelect ariaLabel="Наявність" disabled={busy} value={filters.availability} options={[{ value: '', label: 'Будь-яка' }, ...(data?.availabilityOptions || []).map((value) => ({ value, label: value }))]} onChange={(availability) => changeFilters({ availability })} /></label>
          {(['google', 'facebook'] as const).map((channel) => <div key={channel} className="hp-filter-field">
            <div className="hf-feed-filter-title"><span>{feedLabels[channel]}</span>{filters[channel] && <button className="hp-link" type="button" aria-label={`Скинути фільтр: ${feedLabels[channel]}`} disabled={busy} onClick={() => changeFilters({ [channel]: '' })}>Скинути</button>}</div>
            <StyledSelect ariaLabel={`Статус: ${feedLabels[channel]}`} disabled={busy} value={filters[channel]} placeholder="Оберіть статус" options={feedStatusOptions} onChange={(value) => changeFilters({ [channel]: value })} />
          </div>)}
        </div>
        {listIds !== null && <div className="hp-paste-action"><span>Вибірка зі списку: {listIds.length} товарів.</span><div><button className="button button--secondary" type="button" onClick={openSearch}>Редагувати список</button><button className="button button--secondary" type="button" onClick={() => { setListIds(null); setSearchText(''); changeFilters({ search: '' }); }}>Очистити вибірку</button></div></div>}
        {resolution && <div className="hp-resolution" aria-live="polite"><strong>Знайдено товарів: {resolution.matched.length}</strong>
          {resolution.unmatched.length > 0 && <p>Не знайдено: {resolution.unmatched.join(', ')}</p>}
          {resolution.ambiguous.map((entry) => <div key={entry.input}><span>«{entry.input}» — кілька збігів:</span>{entry.candidates.map((item) => <button className="button button--secondary" type="button" key={item.productId} disabled={Boolean(resolved[entry.input])} onClick={() => {
            setResolved((current) => ({ ...current, [entry.input]: item.productId }));
            setListIds((current) => [...new Set([...(current || []), item.productId])]); toggle(item.productId, true);
          }}>{item.title} · {item.sku}{resolved[entry.input] === item.productId ? ' ✓' : ''}</button>)}</div>)}
        </div>}
        <div className="hp-selection" role="region" aria-label="Дії з вибіркою"><strong>{selectedCount ? `${number(selectedCount)} товарів вибрано` : 'Виберіть товари для масової дії'}</strong><div>
          {selectedCount > 0 && <button type="button" disabled={busy} onClick={clearSelection}>Зняти вибір</button>}
          <button type="button" disabled={!canSelect || !data?.total || data.total > 5000} onClick={() => void selectAll()}>{allFiltered ? 'Вибрано всі за фільтром' : `Вибрати всі ${number(data?.total || 0)} за фільтром`}</button>
          <button className="button button--primary" type="button" disabled={!canSelect || !selectedCount || selectedCount > 5000} onClick={() => openAction()}>Масова дія</button>
        </div></div>
        <div className="hp-list-meta"><strong>Товари · {number(data?.total || 0)}</strong><span>Один рядок = товар з усіма модифікаціями</span></div>
        {catalog.isFetching && <p className="hp-updating" role="status">Оновлюємо список…</p>}
        {!catalog.isFetching && !data?.items.length && <p className="hp-center">За цими умовами товарів не знайдено.</p>}
        {!catalog.isPlaceholderData && <div className="hp-table-wrap"><table><thead><tr>
          <th><input type="checkbox" aria-label="Вибрати товари на сторінці" disabled={!canSelect || !data?.items.length} checked={pageSelected} ref={(element) => { if (element) element.indeterminate = somePageSelected && !pageSelected; }} onChange={(event) => togglePage(event.target.checked)} /></th>
          <th>Товар</th><th>Бренд / Категорія</th><th>Наявність</th><th>Google Merchant Center</th><th>Facebook</th><th>Дія</th>
        </tr></thead><tbody>{data?.items.map((product) => <tr key={product.id}>
          <td><input type="checkbox" aria-label={`Вибрати ${product.sku}`} disabled={!canSelect} checked={selected.has(product.id)} onChange={(event) => toggle(product.id, event.target.checked)} /></td>
          <td><div className="hp-product">{product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <span><Icon name="productCard" size={18} /></span>}<div><strong>{product.title}</strong><small>{product.sku} · Модифікацій: {product.modifications.length || 1}</small></div></div></td>
          <td>{product.brand || '—'}<small>{categories.get(product.categoryExternalId || '') || '—'}</small></td><td>{product.availability || '—'}</td>
          <td>{stateLabels[product.google]}</td><td>{stateLabels[product.facebook]}</td><td><button className="hp-link" type="button" disabled={!canSelect} onClick={() => openAction(product)}>Змінити</button></td>
        </tr>)}</tbody></table></div>}
        <div className="hp-pager"><span>Сторінка {page} із {data?.pageCount || 1}</span><div><StyledSelect ariaLabel="Товарів на сторінці" disabled={busy} compact value={pageSize} options={[10, 25, 50, 100].map((value) => ({ value, label: String(value) }))} onChange={(value) => { setPageSize(value); setPage(1); }} />
          <button className="button button--secondary" type="button" disabled={page <= 1 || catalog.isFetching} onClick={() => setPage((value) => value - 1)}>Назад</button><button className="button button--secondary" type="button" disabled={!data || page >= data.pageCount || catalog.isFetching} onClick={() => setPage((value) => value + 1)}>Далі</button>
        </div></div>
      </section>}

      {display === 'preview' && <section className="hp-panel hp-operation" aria-label="Перегляд майбутніх змін">
        <div className="hp-section-head"><div><h2>Перевірте зміни</h2><p>Майбутні налаштування фідів. Запис у Хорошоп ще не розпочато.</p></div><button className="button button--secondary" type="button" disabled={busy} onClick={() => go('catalog')}>Повернутися</button></div>
        {busy && !operation && <p className="hp-center" role="status">Готуємо перегляд змін…</p>}
        {!busy && !operation && error && pendingPreview && <button className="button button--secondary" type="button" onClick={() => void prepare(pendingPreview)}>Повторити підготовку</button>}
        {operation && <><div className="hp-summary"><div><small>Товарів</small><strong>{number(operation.total)}</strong></div><div><small>Дія</small><strong>{actionLabel(operation.action)}</strong></div><div><small>Стан</small><strong>Готово до підтвердження</strong></div></div>
          {operation.items.some((item) => item.before.some((offer) => offer.marketplaces === null)) && <p className="hp-note">Каталог не надав частину поточних налаштувань фідів. Перед записом сервер прочитає їх із Хорошопа; якщо дані недоступні, запис не розпочнеться, а причина залишиться в результаті та історії.</p>}
          <FeedOperationRows key={operation.id} items={operation.items} action={operation.action} /><p className="hp-note">Інші майданчики зберігаються для кожної модифікації. XML оновиться після наступної генерації фіда в Хорошопі.</p>
          <div className="hp-actions"><button className="button button--primary" type="button" disabled={busy || operation.status !== 'draft'} onClick={() => void apply()}>{busy ? 'Запускаємо…' : 'Застосувати зміни'}</button></div>
        </>}
      </section>}

      {display === 'progress' && operation && <section className="hp-panel hp-operation"><div className="hp-section-head"><div><h2>Застосовуємо зміни</h2><p>Операція {operation.id.slice(0, 8)}</p></div><span className="hp-item-status is-running">{statusLabels[operation.status]}</span></div>
        <div className="hp-progress" role="progressbar" aria-label="Прогрес операції" aria-valuenow={done} aria-valuemin={0} aria-valuemax={operation.total}><span style={{ width: `${operation.total ? Math.round(done / operation.total * 100) : 0}%` }} /></div>
        <p>{number(done)} з {number(operation.total)} завершено · {number(operation.counts.writing || 0)} перевіряється після запису</p><p className="hp-note">Виконавець перевіряє поточні фіди перед записом та результат після нього.</p><button className="button button--secondary" type="button" onClick={() => go('history')}>До історії</button>
      </section>}
      {(['progress', 'result'] as Display[]).includes(display) && operationQuery.isError && <div className="hf-error" role="alert">Не вдалося оновити стан операції. <button className="hp-link" type="button" onClick={() => void operationQuery.refetch()}>Повторити</button></div>}
      {display === 'result' && !operation && !operationQuery.isError && <p className="hp-center">Завантажуємо операцію…</p>}
      {display === 'result' && operation && <section className="hp-panel hp-operation"><div className="hp-section-head"><div><h2>{operation.status === 'conflict' ? 'Дані товарів змінилися' : 'Результат операції'}</h2><p>{statusLabels[operation.status]} · {number(operation.total)} товарів · {date(operation.createdAt)}</p></div><span className={`hp-item-status is-${operation.status}`}>{statusLabels[operation.status]}</span></div>
        {operation.errorMessage && <p className="hf-error" role="alert">{operation.errorMessage}</p>}<FeedOperationRows key={operation.id} items={operation.items} action={operation.action} />
        <div className="hp-actions"><button className="button button--secondary" type="button" onClick={() => go('history')}>До історії</button><button className="button button--primary" type="button" onClick={() => go('catalog')}>До каталогу</button></div>
      </section>}
      {display === 'history' && <section className="hp-panel"><div className="hp-section-head"><div><h2>Історія операцій</h2><p>Підтверджені операції, їхній стан і результат для кожного товару.</p></div><button className="button button--secondary" type="button" onClick={() => void history.refetch()}>Оновити історію</button></div>
        {history.isLoading && <p className="hp-center">Завантажуємо історію…</p>}{history.isError && <p className="hf-error" role="alert">Не вдалося завантажити історію. <button className="hp-link" type="button" onClick={() => void history.refetch()}>Повторити</button></p>}
        {!history.isLoading && !history.isError && !history.data?.length && <p className="hp-center">Підтверджених операцій ще немає.</p>}
        <div className="hp-table-wrap"><table><thead><tr><th>Дата</th><th>Дія</th><th>Товари</th><th>Стан</th><th>Деталі</th></tr></thead><tbody>{history.data?.map((item) => <tr key={item.id}><td>{date(item.createdAt)}</td><td>{actionLabel(item.action)}</td><td>{number(item.confirmed)} із {number(item.total)}</td><td><span className={`hp-item-status is-${item.status}`}>{statusLabels[item.status]}</span></td><td><button className="hp-link" type="button" onClick={() => { setDraft(null); setOperationId(item.id); go(active(item.status) ? 'progress' : 'result'); }}>Деталі</button></td></tr>)}</tbody></table></div>
      </section>}
    </>}
    {searchOpen && <HoroshopProductSearchDialog title="Пошук за назвою або артикулом" description="Введіть одне значення або вставте список із таблиці — по одному значенню на рядок." value={searchDraft} errorMessage={error} onValueChange={(value) => { setSearchDraft(value); setError(''); }} placeholder="Назви або артикули" busy={busy} confirmLabel={searchDraft.trim().includes('\n') ? 'Створити вибірку зі списку' : 'Застосувати пошук'} onConfirm={() => void search()} onClose={() => setSearchOpen(false)} />}
    {drawer && <ModalDialog ariaLabelledBy="hf-bulk-action-title" eyebrow="Товарні фіди" title={drawer === 'single' ? 'Змінити фіди товару' : 'Масова дія'} className="hf-bulk-action" onClose={() => setDrawer(null)} closeDisabled={busy}
      footer={<><button className="button button--secondary" type="button" disabled={busy} onClick={() => setDrawer(null)}>Скасувати</button><button className="button button--primary" type="button" disabled={busy || !drawerCount || (action.google === 'keep' && action.facebook === 'keep')} onClick={() => void prepare({ productIds: drawer === 'single' && single ? [single.id] : [...selected], action })}>Перевірити зміни</button></>}>
      <p className="hf-bulk-action-count">{number(drawerCount)} товарів вибрано</p>{single && drawer === 'single' && <div className="hp-drawer-product"><strong>{single.title}</strong><small>{single.sku} · Модифікацій: {single.modifications.length || 1}</small></div>}
      <div className="hf-actions">{(['google', 'facebook'] as const).map((channel) => <label key={channel}><span>{feedLabels[channel]}</span><StyledSelect ariaLabel={`Дія: ${feedLabels[channel]}`} value={action[channel]} options={choices.map((choice) => ({ ...choice }))} disabled={busy} onChange={(value: FeedChoice) => setAction((current) => ({ ...current, [channel]: value }))} /></label>)}</div>
      {error && <p className="hf-error" role="alert">{error}</p>}<p className="hp-note">Виберіть дії для потрібних фідів. Наступний екран покаже майбутні зміни та запропонує підтвердити запис.</p>
    </ModalDialog>}
  </div>;
}
