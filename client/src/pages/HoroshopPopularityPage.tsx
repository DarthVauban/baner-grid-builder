import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { StyledSelect, type StyledSelectOption } from '../components/StyledSelect';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type {
  PopularityAction, PopularityFilters, PopularityOperation, PopularityOperationItem,
  PopularityProduct, PopularityResolution
} from '../types/horoshop-popularity';
import '../styles/horoshop-popularity.css';

const initialFilters: PopularityFilters = {
  search: '', category: '', brands: [], availability: '', popularity: 'all'
};
const integerLimit = 1_000_000_000;
const number = (value: number) => value.toLocaleString('uk-UA');
const date = (value: string) => new Intl.DateTimeFormat('uk-UA', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
const itemLabels = {
  pending: 'Очікує', writing: 'Записано, перевіряємо', succeeded: 'Підтверджено',
  unchanged: 'Без змін', failed: 'Не підтверджено', conflict: 'Конфлікт', cancelled: 'Не записано'
};
const operationLabels = {
  draft: 'Перегляд', queued: 'У черзі', running: 'Виконується', completed: 'Завершено',
  partial: 'Частково виконано', conflict: 'Конфлікт', failed: 'Помилка'
};
const actionLabel = (action: PopularityAction, value: number) => action === 'reset'
  ? 'Скинути до 0' : action === 'add' ? `Змінити на ${value >= 0 ? '+' : ''}${value}` : `Встановити ${value}`;

function FilterSelect({ label, value, options, onChange }: {
  label: string; value: string; options: StyledSelectOption[]; onChange: (value: string) => void;
}) {
  return <label><span>{label}</span><StyledSelect ariaLabel={label} value={value} options={options} onChange={onChange} /></label>;
}

function OperationRows({ items }: { items: PopularityOperationItem[] }) {
  const [limit, setLimit] = useState(50);
  return <>
    <div className="hp-table-wrap"><table><thead><tr><th>Товар</th><th>Артикул</th><th>Було</th><th>Задано</th><th>Результат</th></tr></thead><tbody>
      {items.slice(0, limit).map((item) => <tr key={item.id}>
        <td><strong>{item.title}</strong><small>{item.articles.length} {item.articles.length === 1 ? 'артикул' : 'артикулів'}</small></td>
        <td>{item.article}</td><td className="hp-number">{number(item.before)}</td><td className="hp-number">{number(item.target)}</td>
        <td><span className={`hp-item-status is-${item.status}`}>{itemLabels[item.status]}</span>
          {item.observed !== null && item.observed !== item.target && <small>Зараз: {number(item.observed)}</small>}
          {item.message && <small>{item.message}</small>}</td>
      </tr>)}
    </tbody></table></div>
    {items.length > limit && <button className="button button--secondary hp-show-more" type="button" onClick={() => setLimit((current) => current + 50)}>
      Показати ще 50 · {number(items.length - limit)} залишилося
    </button>}
  </>;
}

export function HoroshopPopularityPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [filters, setFilters] = useState<PopularityFilters>(initialFilters);
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [allFiltered, setAllFiltered] = useState(false);
  const [resolution, setResolution] = useState<PopularityResolution | null>(null);
  const [resolvedAmbiguous, setResolvedAmbiguous] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<'single' | 'bulk' | null>(null);
  const [singleProduct, setSingleProduct] = useState<PopularityProduct | null>(null);
  const [action, setAction] = useState<PopularityAction>('set');
  const [actionInput, setActionInput] = useState('');
  const [display, setDisplay] = useState<'catalog' | 'preview' | 'progress' | 'result' | 'history'>('catalog');
  const [draftOperation, setDraftOperation] = useState<PopularityOperation | null>(null);
  const [operationId, setOperationId] = useState('');
  const [busy, setBusy] = useState(false);

  const catalog = useQuery({
    queryKey: ['horoshop-popularity-catalog', filters, page],
    queryFn: ({ signal }) => api.horoshopPopularity.catalog(filters, page, 25, signal),
    refetchInterval: (query) => query.state.data?.integration.status === 'syncing' ? 2_000 : false
  });
  const history = useQuery({
    queryKey: ['horoshop-popularity-history'], queryFn: ({ signal }) => api.horoshopPopularity.history(signal),
    enabled: display === 'history'
  });
  const operationQuery = useQuery({
    queryKey: ['horoshop-popularity-operation', operationId],
    queryFn: ({ signal }) => api.horoshopPopularity.operation(operationId, signal),
    enabled: Boolean(operationId),
    refetchInterval: (query) => ['queued', 'running'].includes(query.state.data?.status || '') ? 1_500 : false
  });
  const operation = operationQuery.data || draftOperation;
  const catalogData = catalog.data;
  const isPastedList = /\r?\n/u.test(searchText.trim());
  const selectedCount = allFiltered ? catalogData?.total || 0 : selectedIds.size;
  const categoryNames = useMemo(() => new Map((catalogData?.categories || []).map((item) => [item.externalId, item.title])), [catalogData?.categories]);

  useEffect(() => {
    if (display !== 'progress' || !operationQuery.data) return;
    if (['queued', 'running'].includes(operationQuery.data.status)) return;
    setDisplay('result');
    void queryClient.invalidateQueries({ queryKey: ['horoshop-popularity-catalog'] });
    void queryClient.invalidateQueries({ queryKey: ['horoshop-popularity-history'] });
  }, [display, operationQuery.data, queryClient]);

  function changeFilters(change: Partial<PopularityFilters>) {
    setFilters((current) => ({ ...current, ...change }));
    setPage(1);
    setSelectedIds(new Set());
    setAllFiltered(false);
    setResolution(null);
    setResolvedAmbiguous({});
  }

  function changeSearch(value: string) {
    setSearchText(value);
    changeFilters({ search: /\r?\n/u.test(value.trim()) ? '' : value.trim() });
  }

  function toggleProduct(id: string, checked: boolean) {
    setAllFiltered(false);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  async function resolveList() {
    const entries = searchText.split(/\r?\n/u).map((entry) => entry.trim()).filter(Boolean);
    if (!entries.length) return;
    setBusy(true);
    try {
      const found = await api.horoshopPopularity.resolve(entries);
      setResolution(found);
      setSelectedIds(new Set(found.matched.map((item) => item.productId)));
      setAllFiltered(false);
      setResolvedAmbiguous({});
      showToast(`Знайдено товарів: ${found.matched.length}.`, 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Не вдалося обробити список.', 'error'); }
    finally { setBusy(false); }
  }

  function chooseAmbiguous(input: string, productId: string) {
    setResolvedAmbiguous((current) => ({ ...current, [input]: productId }));
    setSelectedIds((current) => new Set(current).add(productId));
  }

  function openSingle(product: PopularityProduct) {
    setSingleProduct(product);
    setAction('set');
    setActionInput(String(product.popularity ?? 0));
    setDrawer('single');
  }

  function openBulk() {
    setAction('set');
    setActionInput('');
    setDrawer('bulk');
  }

  async function preview() {
    const raw = actionInput.trim();
    const value = action === 'reset' ? 0 : Number(raw);
    if (action !== 'reset' && (!raw || !Number.isInteger(value) || Math.abs(value) > integerLimit)) {
      showToast(`Вкажіть ціле число від −${number(integerLimit)} до ${number(integerLimit)}.`, 'error');
      return;
    }
    const selection = drawer === 'single' && singleProduct
      ? { productIds: [singleProduct.id] }
      : allFiltered ? { filters } : { productIds: [...selectedIds] };
    setBusy(true);
    try {
      const created = await api.horoshopPopularity.preview(selection, action, value);
      setDraftOperation(created);
      setOperationId(created.id);
      setDrawer(null);
      setDisplay('preview');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Не вдалося підготувати зміни.', 'error'); }
    finally { setBusy(false); }
  }

  async function apply() {
    if (!operation || operation.status !== 'draft') return;
    setBusy(true);
    try {
      const queued = await api.horoshopPopularity.apply(operation.id);
      setDraftOperation(queued);
      setDisplay('progress');
      await queryClient.invalidateQueries({ queryKey: ['horoshop-popularity-operation', queued.id] });
    } catch (error) { showToast(error instanceof Error ? error.message : 'Не вдалося запустити операцію.', 'error'); }
    finally { setBusy(false); }
  }

  async function sync() {
    setBusy(true);
    try {
      const result = await api.horoshopPopularity.sync();
      showToast(result.started ? 'Синхронізацію каталогу запущено.' : 'Каталог уже синхронізується або зайнятий іншою операцією.', result.started ? 'success' : 'error');
      await catalog.refetch();
    } catch (error) { showToast(error instanceof Error ? error.message : 'Не вдалося оновити каталог.', 'error'); }
    finally { setBusy(false); }
  }

  const done = operation ? (operation.counts.succeeded || 0) + (operation.counts.unchanged || 0)
    + (operation.counts.failed || 0) + (operation.counts.conflict || 0) + (operation.counts.cancelled || 0) : 0;
  const sent = done + (operation?.counts.writing || 0);

  return <div className="hp-page">
    <header className="hp-heading"><div><p className="eyebrow">Інструменти / Хорошоп</p><h1>Популярність товарів</h1><p>Керуйте пріоритетом товарів у каталозі Хорошопа.</p></div>
      <div className="hp-heading-actions"><button className="button button--secondary" type="button" onClick={() => setDisplay('history')}>Історія змін</button>
        <button className="button button--secondary" type="button" onClick={() => void sync()} disabled={busy || !catalogData?.integration.configured}><Icon name="refresh" size={16} /> Оновити каталог</button></div>
    </header>
    {catalog.isLoading && <div className="hp-panel hp-center">Завантажуємо каталог…</div>}
    {catalog.isError && <div className="hp-panel hp-center is-error">Не вдалося завантажити каталог. <button className="button button--secondary" type="button" onClick={() => void catalog.refetch()}>Повторити</button></div>}
    {!catalog.isLoading && !catalog.isError && !catalogData?.integration.configured && <div className="hp-panel hp-empty"><Icon name="storefront" size={34} /><h2>Магазин Хорошоп ще не підключено</h2><p>Підключіть магазин у розділі інтеграцій і дочекайтеся першої синхронізації каталогу.</p><Link className="button button--primary" to="/admin/integrations">Перейти до інтеграцій</Link></div>}
    {!catalog.isLoading && !catalog.isError && catalogData?.integration.configured && <>
      <div className="hp-status"><span className="hp-status-dot" />{catalogData.integration.status === 'syncing' ? 'Каталог синхронізується' : 'Магазин підключено'} · {number(catalogData.integration.counts?.products ?? catalogData.total)} товарів
        {catalogData.integration.lastSyncAt && <> · Синхронізовано {date(catalogData.integration.lastSyncAt)}</>}</div>
      {catalogData.integration.status !== 'connected' && <p className="hp-note is-warning">Операції з популярністю будуть доступні після завершення синхронізації каталогу.</p>}
      <nav className="hp-tabs" aria-label="Розділи інструменту"><button className={display === 'history' ? '' : 'is-active'} type="button" onClick={() => setDisplay('catalog')}>Каталог</button><button className={display === 'history' ? 'is-active' : ''} type="button" onClick={() => setDisplay('history')}>Історія операцій</button></nav>

      {display === 'catalog' && <section className="hp-panel" aria-label="Каталог товарів">
        <div className="hp-filters">
          <label className="hp-search"><span>Назва або артикул</span><textarea rows={2} value={searchText} onChange={(event) => changeSearch(event.target.value)} placeholder="Пошук або вставте список з таблиці — один товар у рядку" /></label>
          <FilterSelect label="Категорія" value={filters.category} options={[{ value: '', label: 'Усі категорії' }, ...catalogData.categories.map((item) => ({ value: item.externalId, label: item.title }))]} onChange={(value) => changeFilters({ category: value })} />
          <details className="hp-brand-filter"><summary>Бренди <strong>{filters.brands.length ? filters.brands.join(', ') : 'Усі бренди'}</strong></summary><div>
            {catalogData.brands.map((brand) => <label key={brand}><input type="checkbox" checked={filters.brands.includes(brand)} onChange={(event) => changeFilters({ brands: event.target.checked ? [...filters.brands, brand] : filters.brands.filter((item) => item !== brand) })} />{brand}</label>)}
            {!catalogData.brands.length && <p>Брендів у каталозі поки немає.</p>}
            {filters.brands.length > 0 && <button type="button" onClick={() => changeFilters({ brands: [] })}>Очистити</button>}
          </div></details>
          <FilterSelect label="Наявність" value={filters.availability} options={[{ value: '', label: 'Будь-яка' }, ...catalogData.availabilityOptions.map((item) => ({ value: item, label: item }))]} onChange={(value) => changeFilters({ availability: value })} />
          <FilterSelect label="Популярність" value={filters.popularity} options={[{ value: 'all', label: 'Усі значення' }, { value: 'zero', label: 'Нульова' }, { value: 'positive', label: 'Вища за 0' }]} onChange={(value) => changeFilters({ popularity: value as PopularityFilters['popularity'] })} />
        </div>
        {isPastedList && <div className="hp-paste-action"><span>Вставлено {searchText.split(/\r?\n/u).filter((line) => line.trim()).length} рядків.</span><button className="button button--secondary" type="button" disabled={busy} onClick={() => void resolveList()}>Створити вибірку зі списку</button></div>}
        {resolution && <div className="hp-resolution" aria-live="polite"><strong>Знайдено товарів: {resolution.matched.length}</strong>
          {resolution.ambiguous.map((entry) => <div key={entry.input}><span>«{entry.input}» — кілька збігів:</span>{entry.candidates.map((candidate) => <button className="button button--secondary" key={candidate.productId} type="button" disabled={Boolean(resolvedAmbiguous[entry.input])} onClick={() => chooseAmbiguous(entry.input, candidate.productId)}>{candidate.title} · {candidate.sku}{resolvedAmbiguous[entry.input] === candidate.productId ? ' ✓' : ''}</button>)}</div>)}
          {resolution.unmatched.length > 0 && <p>Не знайдено: {resolution.unmatched.join(', ')}</p>}
        </div>}
        {catalogData.total > 0 && <div className="hp-selection"><strong>{selectedCount ? `${number(selectedCount)} товарів вибрано` : 'Виберіть товари для масової дії'}</strong><div><button type="button" onClick={() => setAllFiltered((current) => !current)}>{allFiltered ? 'Вибрано всі за фільтром' : `Вибрати всі ${number(catalogData.total)} за фільтром`}</button><button className="button button--primary" type="button" disabled={selectedCount === 0 || catalogData.integration.status !== 'connected'} onClick={openBulk}>Масова дія</button></div></div>}
        <div className="hp-list-meta"><strong>Товари · {number(catalogData.total)}</strong><span>Один рядок = товар з усіма модифікаціями</span></div>
        {catalog.isFetching && <p className="hp-updating">Оновлюємо список…</p>}
        <div className="hp-table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="Вибрати товари на сторінці" checked={catalogData.items.length > 0 && (allFiltered || catalogData.items.every((item) => selectedIds.has(item.id)))} onChange={(event) => {
          setAllFiltered(false); setSelectedIds((current) => { const next = new Set(current); catalogData.items.forEach((item) => { if (event.target.checked) next.add(item.id); else next.delete(item.id); }); return next; });
        }} /></th><th>Товар</th><th>Бренд / категорія</th><th>Наявність</th><th>Популярність</th><th></th></tr></thead><tbody>
          {catalogData.items.map((product) => <tr key={product.id}><td><input type="checkbox" aria-label={`Вибрати ${product.title}`} checked={allFiltered || selectedIds.has(product.id)} onChange={(event) => toggleProduct(product.id, event.target.checked)} /></td>
            <td><div className="hp-product">{product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <span><Icon name="productCard" size={20} /></span>}<div><strong>{product.title}</strong><small>{product.sku} · {product.modifications.length} модифікацій</small></div></div></td>
            <td>{product.brand || '—'}<small>{categoryNames.get(product.categoryExternalId || '') || 'Без категорії'}</small></td>
            <td>{product.availability || 'Не вказано'}</td><td className="hp-number">{product.popularity ?? '0'}</td><td><button className="hp-link" type="button" disabled={catalogData.integration.status !== 'connected'} onClick={() => openSingle(product)}>Змінити</button></td></tr>)}
        </tbody></table></div>
        {!catalogData.items.length && <div className="hp-center">За цими умовами товарів не знайдено.</div>}
        <div className="hp-pager"><span>Сторінка {catalogData.page} із {catalogData.pageCount || 1}</span><div><button className="button button--secondary" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Назад</button><button className="button button--secondary" type="button" disabled={page >= catalogData.pageCount} onClick={() => setPage(page + 1)}>Далі</button></div></div>
      </section>}

      {display === 'preview' && operation && <section className="hp-panel hp-operation"><div className="hp-summary"><div><small>Товарів</small><strong>{number(operation.total)}</strong></div><div><small>Дія</small><strong>{actionLabel(operation.action, operation.value)}</strong></div><div><small>Стан</small><strong>Готово до запису</strong></div></div>
        <div className="hp-section-head"><div><h2>Перевірте зміни</h2><p>Значення, які буде записано в Хорошоп.</p></div><button className="button button--secondary" type="button" onClick={() => setDisplay('catalog')}>Повернутися</button></div>
        <OperationRows key={operation.id} items={operation.items} /><p className="hp-note">Порядок на вітрині також залежить від пріоритетного сортування Хорошопа.</p>
        <div className="hp-actions"><button className="button button--primary" type="button" disabled={busy} onClick={() => void apply()}>Застосувати зміни</button></div>
      </section>}

      {display === 'progress' && operation && <section className="hp-panel hp-operation"><div className="hp-section-head"><div><h2>Застосовуємо зміни</h2><p>Операція {operation.id.slice(0, 8)}</p></div><span className="hp-item-status is-writing">{operationLabels[operation.status]}</span></div>
        <div className="hp-progress" role="progressbar" aria-label="Прогрес операції" aria-valuenow={sent} aria-valuemin={0} aria-valuemax={operation.total}><span style={{ width: `${operation.total ? Math.round(sent / operation.total * 100) : 0}%` }} /></div>
        <p>{number(done)} з {number(operation.total)} підтверджено або завершено · {number(operation.counts.writing || 0)} передано в Хорошоп</p><p className="hp-note">Фактичне значення кожного товару перевіряється після запису.</p>
      </section>}

      {display === 'result' && !operation && <section className="hp-panel hp-center">{operationQuery.isError ? 'Не вдалося завантажити операцію.' : 'Завантажуємо операцію…'}</section>}
      {display === 'result' && operation && <section className="hp-panel hp-operation"><div className="hp-section-head"><div><h2>{operation.status === 'conflict' ? 'Дані товарів змінилися' : 'Результат операції'}</h2><p>{operationLabels[operation.status]} · {number(operation.total)} товарів · {date(operation.createdAt)}</p></div><span className={`hp-item-status is-${operation.status}`}>{operationLabels[operation.status]}</span></div>
        {operation.errorMessage && <p className="hp-note is-error">{operation.errorMessage}</p>}
        {operation.status === 'conflict' && <p className="hp-note is-warning">Запис не розпочато. Перевірте поточні значення й створіть новий перегляд змін.</p>}
        <OperationRows key={operation.id} items={operation.items} />
        <div className="hp-actions"><button className="button button--secondary" type="button" onClick={() => setDisplay('history')}>До історії</button><button className="button button--primary" type="button" onClick={() => setDisplay('catalog')}>До каталогу</button></div>
      </section>}

      {display === 'history' && <section className="hp-panel"><div className="hp-section-head"><div><h2>Історія операцій</h2><p>Зміни популярності товарів Хорошопа.</p></div></div>
        {history.isLoading && <div className="hp-center">Завантажуємо історію…</div>}
        {history.isError && <div className="hp-center is-error">Не вдалося завантажити історію. <button className="button button--secondary" type="button" onClick={() => void history.refetch()}>Повторити</button></div>}
        {!history.isLoading && !history.isError && !history.data?.length && <div className="hp-center">Операцій ще немає.</div>}
        <div className="hp-table-wrap"><table><thead><tr><th>Дата</th><th>Дія</th><th>Товари</th><th>Стан</th><th></th></tr></thead><tbody>{history.data?.map((item) => <tr key={item.id}><td>{date(item.createdAt)}</td><td>{actionLabel(item.action, item.value)}</td><td>{number(item.confirmed)} із {number(item.total)}</td><td><span className={`hp-item-status is-${item.status}`}>{operationLabels[item.status]}</span></td><td><button className="hp-link" type="button" onClick={() => { setOperationId(item.id); setDraftOperation(null); setDisplay('result'); }}>Деталі</button></td></tr>)}</tbody></table></div>
      </section>}
    </>}

    {drawer && <div className="hp-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawer(null); }}><section className="hp-drawer" role="dialog" aria-modal="true" aria-labelledby="hp-drawer-title"><div className="hp-drawer-head"><div><h2 id="hp-drawer-title">{drawer === 'single' ? 'Змінити популярність' : 'Масова дія'}</h2><p>{drawer === 'single' ? 'Для товару та всіх модифікацій' : `${number(selectedCount)} товарів вибрано`}</p></div><button type="button" aria-label="Закрити" onClick={() => setDrawer(null)}>×</button></div>
      {drawer === 'single' && singleProduct && <><div className="hp-drawer-product"><strong>{singleProduct.title}</strong><small>{singleProduct.sku} · {singleProduct.modifications.length} модифікацій</small></div><div className="hp-current"><span>Зараз у Хорошопі</span><strong>{singleProduct.popularity ?? '0'}</strong></div></>}
      {drawer === 'bulk' && <fieldset className="hp-modes"><legend>Дія</legend><label><input type="radio" checked={action === 'set'} onChange={() => setAction('set')} />Встановити одне значення</label><label><input type="radio" checked={action === 'add'} onChange={() => setAction('add')} />Змінити кожне на ±N</label><label><input type="radio" checked={action === 'reset'} onChange={() => setAction('reset')} />Скинути до 0</label></fieldset>}
      {action !== 'reset' && <label className="hp-value"><span>{action === 'add' ? 'Зміна значення' : 'Нове значення'}</span><input type="number" step="1" min={-integerLimit} max={integerLimit} value={actionInput} onChange={(event) => setActionInput(event.target.value)} /></label>}
      <p className="hp-drawer-hint">Більше число означає вищий пріоритет у межах налаштованого сортування Хорошопа.</p>
      <div className="hp-drawer-actions"><button className="button button--secondary" type="button" onClick={() => setDrawer(null)}>Скасувати</button><button className="button button--primary" type="button" disabled={busy} onClick={() => void preview()}>Перевірити зміни</button></div>
    </section></div>}
  </div>;
}
