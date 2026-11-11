import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { HoroshopCatalogSyncProgress } from '../components/HoroshopCatalogSyncProgress';
import { HoroshopProductSearchDialog } from '../components/HoroshopProductSearchDialog';
import { ModalDialog } from '../components/ModalDialog';
import { StyledSelect } from '../components/StyledSelect';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type { FeedAction, FeedChoice, FeedFilters, FeedOperation, FeedOperationItem, FeedResolution } from '../types/horoshop-feeds';
import '../styles/horoshop-popularity.css';
import '../styles/horoshop-feeds.css';

const emptyFilters: FeedFilters = { search: '', category: '', brands: [], availability: '' };
const choices: Array<{ value: FeedChoice; label: string }> = [
  { value: 'keep', label: 'Не змінювати' }, { value: 'enable', label: 'Додати до фіда' }, { value: 'disable', label: 'Прибрати з фіда' }
];
const stateLabels = { enabled: 'Увімкнено', disabled: 'Вимкнено', mixed: 'Частина модифікацій', unknown: 'Немає даних' };
const statusLabels = { draft: 'Перегляд', queued: 'У черзі', running: 'Виконується', completed: 'Завершено', partial: 'Частково виконано', conflict: 'Конфлікт', failed: 'Помилка' };
const itemLabels = { pending: 'Очікує', writing: 'Перевіряємо запис', succeeded: 'Підтверджено', unchanged: 'Без змін', failed: 'Не підтверджено', conflict: 'Конфлікт', cancelled: 'Не записано' };
const actionLabel = (action: FeedAction) => `Google: ${choices.find((choice) => choice.value === action.google)?.label}; Facebook: ${choices.find((choice) => choice.value === action.facebook)?.label}`;
const date = (value: string) => new Date(value).toLocaleString('uk-UA');
const active = (status?: string) => status === 'queued' || status === 'running';

function OperationRows({ items }: { items: FeedOperationItem[] }) {
  const [limit, setLimit] = useState(30);
  return <><div className="hp-table-wrap"><table><thead><tr><th>Товар / модифікація</th><th>Було</th><th>Буде</th><th>Результат</th></tr></thead><tbody>
    {items.slice(0, limit).flatMap((item) => item.target.map((offer, index) => <tr key={`${item.id}:${offer.article}`}>
      <td><strong>{item.title}</strong><small>{offer.article}</small></td>
      <td>{item.before.find((before) => before.article === offer.article)?.marketplaces.join('; ') || 'Жодного фіда'}</td>
      <td>{offer.marketplaces.join('; ') || 'Жодного фіда'}</td>
      <td><span className={`hp-item-status is-${item.status}`}>{itemLabels[item.status]}</span>{index === 0 && item.message && <small>{item.message}</small>}
        {item.observed && <small>Перевірено: {item.observed.find((observed) => observed.article === offer.article)?.marketplaces === null ? 'Немає даних' : item.observed.find((observed) => observed.article === offer.article)?.marketplaces?.join('; ') || 'Жодного фіда'}</small>}</td>
    </tr>))}
  </tbody></table></div>{items.length > limit && <button className="button button--secondary" type="button" onClick={() => setLimit((value) => value + 30)}>Показати ще товари</button>}</>;
}

export function HoroshopFeedsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [filters, setFilters] = useState<FeedFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allFiltered, setAllFiltered] = useState(false);
  const [listIds, setListIds] = useState<string[] | null>(null);
  const [resolution, setResolution] = useState<FeedResolution | null>(null);
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [action, setAction] = useState<FeedAction>({ google: 'keep', facebook: 'keep' });
  const [bulkActionOpen, setBulkActionOpen] = useState(false);
  const [tab, setTab] = useState<'catalog' | 'history'>('catalog');
  const [draft, setDraft] = useState<FeedOperation | null>(null);
  const [operationId, setOperationId] = useState('');
  const [operationOpen, setOperationOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const catalog = useQuery({
    queryKey: ['horoshop-feeds-catalog', filters, page, listIds],
    queryFn: ({ signal }) => listIds === null ? api.horoshopFeeds.catalog(filters, page, signal)
      : api.horoshopFeeds.catalogSelection(listIds, filters, page, signal),
    refetchInterval: (query) => query.state.data?.integration.status === 'syncing'
      || query.state.data?.integration.latestRun?.status === 'running' ? 2_000 : false
  });
  const history = useQuery({ queryKey: ['horoshop-feeds-history'], queryFn: ({ signal }) => api.horoshopFeeds.history(signal), enabled: tab === 'history' });
  const operationQuery = useQuery({
    queryKey: ['horoshop-feeds-operation', operationId],
    queryFn: ({ signal }) => api.horoshopFeeds.operation(operationId, signal), enabled: Boolean(operationId),
    refetchInterval: (query) => active(query.state.data?.status) ? 1_500 : false
  });
  const operation = operationId ? operationQuery.data : draft;
  const data = catalog.data;
  const integration = data?.integration;
  const syncing = integration?.status === 'syncing' || integration?.latestRun?.status === 'running';
  const selectedCount = allFiltered ? data?.total || 0 : selected.size;
  const canSelect = !busy && !catalog.isFetching && !syncing && integration?.status === 'connected';

  useEffect(() => {
    if (!operationQuery.data || active(operationQuery.data.status) || operationQuery.data.status === 'draft') return;
    void queryClient.invalidateQueries({ queryKey: ['horoshop-feeds-catalog'] });
    void queryClient.invalidateQueries({ queryKey: ['horoshop-feeds-history'] });
  }, [operationQuery.data, queryClient]);

  function changeFilters(change: Partial<FeedFilters>) {
    setFilters((current) => ({ ...current, ...change }));
    setPage(1); setSelected(new Set()); setAllFiltered(false);
  }
  function toggle(id: string, checked: boolean) {
    setAllFiltered(false);
    setSelected((current) => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next; });
  }
  const fail = (error: unknown) => showToast(error instanceof Error ? error.message : 'Не вдалося виконати операцію.', 'error');

  async function search() {
    const entries = searchDraft.split(/\r?\n/u).map((entry) => entry.trim()).filter(Boolean);
    if (entries.length < 2) {
      setListIds(null); setResolution(null); setResolved({}); changeFilters({ search: entries[0] || '' }); setSearchOpen(false); return;
    }
    setBusy(true);
    try {
      const result = await api.horoshopFeeds.resolve(entries);
      changeFilters({ search: '' }); setResolution(result); setResolved({});
      setListIds(result.matched.map((item) => item.productId)); setSelected(new Set(result.matched.map((item) => item.productId)));
      setSearchOpen(false);
    } catch (error) { fail(error); } finally { setBusy(false); }
  }
  async function preview() {
    const selection = allFiltered ? listIds === null ? { filters } : { productIds: data?.matchingProductIds || [] }
      : { productIds: [...selected] };
    setBusy(true);
    try {
      const result = await api.horoshopFeeds.preview(selection, action);
      setOperationId(''); setDraft(result); setBulkActionOpen(false); setOperationOpen(true);
    } catch (error) { fail(error); } finally { setBusy(false); }
  }
  async function apply() {
    if (!operation || operation.status !== 'draft') return;
    setBusy(true);
    try {
      const result = await api.horoshopFeeds.apply(operation.id);
      queryClient.setQueryData(['horoshop-feeds-operation', result.id], result);
      setOperationId(result.id); setDraft(null);
    } catch (error) { fail(error); } finally { setBusy(false); }
  }
  async function sync() {
    setBusy(true);
    try {
      await api.horoshopFeeds.sync(); setSelected(new Set()); setAllFiltered(false);
      await queryClient.invalidateQueries({ queryKey: ['horoshop-feeds-catalog'] });
    } catch (error) { fail(error); } finally { setBusy(false); }
  }

  return <div className="hp-page hf-page">
    <header className="hp-heading"><div><p className="eyebrow">Інструменти / Хорошоп</p><h1>Товарні фіди</h1><p>Масове керування участю товарів у Google Merchant Center та Facebook.</p></div>
      <button className="button button--secondary" type="button" disabled={busy || syncing || !integration?.configured} onClick={() => void sync()}>{syncing ? 'Синхронізуємо…' : 'Оновити каталог'}</button></header>
    <p className="hp-note">Вибір товару охоплює всі його модифікації. Поточні опції перевіряються перед записом; інші майданчики зберігаються.</p>
    {syncing && integration && <HoroshopCatalogSyncProgress integration={integration} />}
    <nav className="hp-tabs" aria-label="Розділи інструмента"><button className={tab === 'catalog' ? 'is-active' : ''} onClick={() => setTab('catalog')}>Каталог</button><button className={tab === 'history' ? 'is-active' : ''} onClick={() => setTab('history')}>Історія операцій</button></nav>
    {catalog.isLoading && <div className="hp-panel hp-center">Завантажуємо каталог…</div>}
    {catalog.isError && <div className="hp-panel hp-center is-error" role="alert">Не вдалося завантажити каталог. <button className="button button--secondary" onClick={() => void catalog.refetch()}>Повторити</button></div>}
    {integration && !integration.configured && <section className="hp-panel hp-empty"><h2>Підключіть магазин Хорошоп</h2><p>Інструмент використовує спільне API-підключення та каталог магазину.</p><Link to="/admin/integrations" className="button button--primary">Налаштування інтеграції</Link></section>}
    {tab === 'catalog' && integration?.configured && <>
      <section className="hp-panel"><div className="hf-filters">
        <label><span>Назва або артикул</span><button className="button button--secondary" disabled={busy} onClick={() => { setSearchDraft(filters.search); setSearchOpen(true); }}>{listIds === null ? filters.search || 'Пошук або список' : `Вибірка зі списку: ${listIds.length}`}</button></label>
        <label><span>Категорія</span><StyledSelect ariaLabel="Категорія" value={filters.category} searchable options={[{ value: '', label: 'Усі категорії' }, ...(data?.categories || []).map((item) => ({ value: item.externalId, label: item.title }))]} onChange={(category) => changeFilters({ category })} /></label>
        <label><span>Бренд</span><StyledSelect ariaLabel="Бренд" value={filters.brands[0] || ''} searchable options={[{ value: '', label: 'Усі бренди' }, ...(data?.brands || []).map((brand) => ({ value: brand, label: brand }))]} onChange={(brand) => changeFilters({ brands: brand ? [brand] : [] })} /></label>
        <label><span>Наявність</span><StyledSelect ariaLabel="Наявність" value={filters.availability} options={[{ value: '', label: 'Будь-яка' }, ...(data?.availabilityOptions || []).map((value) => ({ value, label: value }))]} onChange={(availability) => changeFilters({ availability })} /></label>
      </div>
        {listIds !== null && <button className="hp-link" onClick={() => { setListIds(null); setResolution(null); setResolved({}); changeFilters({ search: '' }); }}>Очистити список</button>}
        {resolution && <div className="hf-resolution">{resolution.unmatched.length > 0 && <p>Не знайдено: {resolution.unmatched.join(', ')}</p>}{resolution.ambiguous.map((entry) => <label key={entry.input}><span>Уточніть товар: {entry.input}</span><StyledSelect ariaLabel={`Уточніть товар: ${entry.input}`} value={resolved[entry.input] || ''} options={[{ value: '', label: 'Виберіть товар' }, ...entry.candidates.map((item) => ({ value: item.productId, label: `${item.title} · ${item.sku}` }))]} onChange={(id) => {
          if (!id) return;
          const chosen = { ...resolved, [entry.input]: id }; setResolved(chosen);
          const ids = [...new Set([...resolution.matched.map((item) => item.productId), ...Object.values(chosen)])];
          setListIds(ids); setSelected(new Set(ids)); setAllFiltered(false); setPage(1);
        }} /></label>)}</div>}
        <div className="hp-selection" role="region" aria-label="Дії з вибіркою">
          <strong>{selectedCount ? `${selectedCount.toLocaleString('uk-UA')} товарів вибрано` : 'Виберіть товари для масової дії'}</strong>
          <div>
            {selectedCount > 0 && <button type="button" onClick={() => { setSelected(new Set()); setAllFiltered(false); }}>Зняти вибір</button>}
            <button type="button" disabled={!canSelect || !data?.total || data.total > 5000} onClick={() => { setAllFiltered(true); setSelected(new Set()); }}>Вибрати всі {data?.total?.toLocaleString('uk-UA') || 0} за фільтром</button>
            <button className="button button--primary" type="button" disabled={!canSelect || !selectedCount || selectedCount > 5000} onClick={() => { setAction({ google: 'keep', facebook: 'keep' }); setBulkActionOpen(true); }}>Масова дія</button>
          </div>
        </div>
      </section>
      <section className="hp-panel"><div className="hp-section-head"><div><h2>Товари · {data?.total || 0}</h2><p>Опції за останнім збереженим станом каталогу.</p></div></div>
        {catalog.isFetching && <p role="status">Оновлюємо список…</p>}
        {!catalog.isFetching && !data?.items.length && <p className="hp-center">За цими умовами товарів не знайдено.</p>}
        <div className="hp-table-wrap"><table><thead><tr><th>Вибір</th><th>Товар</th><th>Google Merchant Center</th><th>Facebook</th><th>Наявність</th></tr></thead><tbody>{data?.items.map((product) => <tr key={product.id}>
          <td><input type="checkbox" aria-label={`Вибрати ${product.sku}`} disabled={!canSelect || allFiltered} checked={allFiltered || selected.has(product.id)} onChange={(event) => toggle(product.id, event.target.checked)} /></td>
          <td><strong>{product.title}</strong><small>{product.sku} · {product.modifications.length || 1} модифікацій</small></td>
          <td>{stateLabels[product.google]}</td><td>{stateLabels[product.facebook]}</td><td>{product.availability || '—'}</td>
        </tr>)}</tbody></table></div>
        <div className="hp-pager"><button className="button button--secondary" disabled={page <= 1 || catalog.isFetching} onClick={() => setPage((current) => current - 1)}>Назад</button><span>Сторінка {page} із {data?.pageCount || 1}</span><button className="button button--secondary" disabled={!data || page >= data.pageCount || catalog.isFetching} onClick={() => setPage((current) => current + 1)}>Далі</button></div>
      </section>
    </>}
    {tab === 'history' && <section className="hp-panel"><h2>Історія операцій</h2>
      {history.isLoading && <p>Завантажуємо історію…</p>}{history.isError && <p role="alert">Не вдалося завантажити історію. <button className="hp-link" onClick={() => void history.refetch()}>Повторити</button></p>}
      {!history.isLoading && !history.isError && !history.data?.length && <p>Операцій ще немає.</p>}
      <div className="hp-table-wrap"><table><thead><tr><th>Дата</th><th>Дія</th><th>Підтверджено</th><th>Стан</th><th>Деталі</th></tr></thead><tbody>{history.data?.map((item) => <tr key={item.id}><td>{date(item.createdAt)}</td><td>{actionLabel(item.action)}</td><td>{item.confirmed} із {item.total}</td><td>{statusLabels[item.status]}</td><td><button className="hp-link" onClick={() => { setDraft(null); setOperationId(item.id); setOperationOpen(true); }}>Переглянути</button></td></tr>)}</tbody></table></div>
    </section>}
    {searchOpen && <HoroshopProductSearchDialog title="Пошук за назвою або артикулом" description="Введіть назву або артикул. Для вибірки зі списку вставте значення по одному на рядок." value={searchDraft} onValueChange={setSearchDraft} placeholder="Назви або артикули" busy={busy} confirmLabel={searchDraft.trim().includes('\n') ? 'Створити вибірку зі списку' : 'Застосувати пошук'} onConfirm={() => void search()} onClose={() => setSearchOpen(false)} />}
    {bulkActionOpen && <ModalDialog ariaLabelledBy="hf-bulk-action-title" eyebrow="Товарні фіди" title="Масова дія" className="hf-bulk-action" onClose={() => setBulkActionOpen(false)} closeDisabled={busy}
      footer={<><button className="button button--secondary" type="button" disabled={busy} onClick={() => setBulkActionOpen(false)}>Скасувати</button><button className="button button--primary" type="button" disabled={!canSelect || !selectedCount || selectedCount > 5000 || (action.google === 'keep' && action.facebook === 'keep')} onClick={() => void preview()}>{busy ? 'Перевіряємо…' : 'Перевірити зміни'}</button></>}>
      <p className="hf-bulk-action-count">{selectedCount.toLocaleString('uk-UA')} товарів вибрано</p>
      <div className="hf-actions">{(['google', 'facebook'] as const).map((channel) => <label key={channel}><span>{channel === 'google' ? 'Google Merchant Center' : 'Facebook'}</span><StyledSelect ariaLabel={`Дія: ${channel === 'google' ? 'Google Merchant Center' : 'Facebook'}`} value={action[channel]} options={choices} disabled={busy} onChange={(value) => setAction((current) => ({ ...current, [channel]: value }))} /></label>)}</div>
      <p className="hp-note">Виберіть дію для кожного фіда. Інші майданчики та опції «Не змінювати» збережуться для всіх модифікацій товарів.</p>
      <p className="hp-note">До 5 000 товарів за операцію. Зміни потраплять у XML після наступної генерації фіда в Хорошопі.</p>
    </ModalDialog>}
    {operationOpen && <ModalDialog ariaLabelledBy="hf-operation-title" eyebrow="Товарні фіди" title={operation?.status === 'draft' ? 'Перевірте зміни' : 'Результат операції'} className="hf-operation" onClose={() => setOperationOpen(false)} closeDisabled={busy}
      footer={<><button className="button button--secondary" disabled={busy} onClick={() => setOperationOpen(false)}>Закрити</button>{operation?.status === 'draft' && <button className="button button--primary" disabled={busy} onClick={() => void apply()}>Застосувати зміни</button>}</>}>
      {!operation && <p role={operationQuery.isError ? 'alert' : 'status'}>{operationQuery.isError ? 'Не вдалося завантажити операцію.' : 'Завантажуємо операцію…'}</p>}
      {operationQuery.isError && <button className="hp-link" onClick={() => void operationQuery.refetch()}>Повторити</button>}
      {operation && <><p><strong>{statusLabels[operation.status]}</strong> · {operation.total} товарів</p><p>{actionLabel(operation.action)}</p>
        <p className="hp-note">Інші фіди зберігаються окремо для кожної модифікації.</p>
        {operation.errorMessage && <p role="alert">{operation.errorMessage}</p>}
        {active(operation.status) && <p role="status">Підтверджено: {(operation.counts.succeeded || 0) + (operation.counts.unchanged || 0)} із {operation.total}. Операція продовжиться після закриття вікна.</p>}
        {operation.status === 'conflict' && <p role="alert">Дані змінилися після перегляду. Перевірте товари та створіть новий перегляд змін.</p>}
        <OperationRows key={operation.id} items={operation.items} /></>}
    </ModalDialog>}
  </div>;
}
