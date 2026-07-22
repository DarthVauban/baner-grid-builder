import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import type {
  CatalogAuditCategory,
  CatalogAuditHistoryItem,
  CatalogAuditHistoryParams,
  CatalogAuditSource,
  CatalogImportHistoryDetail,
  CatalogImportSummary
} from '../types/catalog';

const actionLabels: Record<string, string> = {
  create: 'Товар створено',
  update: 'Товар оновлено',
  archive: 'Товар архівовано',
  publication_status: 'Змінено статус публікації',
  media_update: 'Оновлено фотографії',
  media_delete: 'Видалено фотографію',
  characteristics_update: 'Оновлено характеристики',
  modifications_update: 'Оновлено модифікації',
  characteristic_template_create: 'Створено шаблон характеристик',
  characteristic_template_update: 'Оновлено шаблон характеристик',
  modification_parameter_create: 'Створено параметр модифікацій',
  modification_parameter_update: 'Оновлено параметр модифікацій',
  description_source_create: 'Додано опис товару',
  description_source_update: 'Оновлено опис товару',
  storefront_settings_update: 'Оновлено налаштування вітрини',
  import_commit: 'Імпортовано XLSX'
};

const fieldLabels: Record<string, string> = {
  productCode: 'Код товару',
  name: 'Назва',
  condition: 'Стан',
  stockCount: 'Залишок',
  incomingCount: 'В дорозі',
  priceUah: 'Ціна',
  publicationStatus: 'Статус публікації',
  popularityPosition: 'Позиція популярності',
  slug: 'Публічний шлях',
  brandId: 'Бренд',
  mainImageUrl: 'Головне фото',
  gallery: 'Галерея',
  shortDescription: 'Короткий опис',
  description: 'Повний опис',
  seoTitle: 'SEO-заголовок',
  seoDescription: 'SEO-опис',
  socialDescription: 'Опис для соцмереж',
  bodyCondition: 'Стан корпусу',
  displayCondition: 'Стан дисплея',
  batteryHealth: 'Акумулятор',
  warranty: 'Гарантія',
  includedAccessories: 'Комплектація',
  defectsText: 'Дефекти',
  imeiSerial: 'Серійний номер / IMEI',
  internalNotes: 'Внутрішні нотатки',
  characteristicTemplate: 'Шаблон характеристик',
  characteristicValues: 'Характеристики',
  modificationGroup: 'Група модифікацій',
  modificationProducts: 'Товари у групі',
  selectedFormPublicId: 'Форма заявок',
  publicOrigin: 'Публічна адреса вітрини',
  storefrontTheme: 'Дизайн вітрини',
  productCardTheme: 'Дизайн картки товару',
  productPageTheme: 'Дизайн сторінки товару',
  removedMediaUrl: 'Видалене фото',
  affectedModificationGroups: 'Змінені групи модифікацій'
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Чернетка',
  PUBLISHED: 'Опубліковано',
  HIDDEN: 'Приховано',
  ARCHIVED: 'Архів',
  USED: 'Вживаний',
  REFURBISHED: 'Відновлений'
};

const resultLabels: Record<string, string> = {
  created: 'Створено',
  updated: 'Оновлено',
  skipped: 'Пропущено',
  error: 'Помилка',
  conflict: 'Конфлікт',
  ready: 'Готово',
  pending: 'Очікує'
};

type AuditFilters = {
  source: CatalogAuditSource;
  category: CatalogAuditCategory;
  actorId: string;
  dateFrom: string;
  dateTo: string;
};

function formattedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('uk-UA', { dateStyle: 'medium', timeStyle: 'short' });
}

function summaryTotal(summary?: CatalogImportSummary | null) {
  return Number(summary?.total || 0);
}

function scalarValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Так' : 'Ні';
  if (field === 'priceUah' && typeof value === 'number') return `${value.toLocaleString('uk-UA')} ₴`;
  if (typeof value === 'string') return statusLabels[value] || value;
  if (typeof value === 'number') return value.toLocaleString('uk-UA');
  return '';
}

function AuditValue({ field, value }: { field: string; value: unknown }) {
  if (Array.isArray(value)) {
    if (field === 'gallery') return <span>{value.length ? `${value.length} фото` : '—'}</span>;
    return <span>{value.length ? value.map(String).join(', ') : '—'}</span>;
  }
  if (value && typeof value === 'object') {
    return <pre className="catalog-audit-value-json">{JSON.stringify(value, null, 2)}</pre>;
  }
  return <span>{scalarValue(field, value)}</span>;
}

function AuditChanges({ item }: { item: CatalogAuditHistoryItem }) {
  const before = item.changes.before && typeof item.changes.before === 'object' && !Array.isArray(item.changes.before)
    ? item.changes.before as Record<string, unknown>
    : {};
  const after = item.changes.after && typeof item.changes.after === 'object' && !Array.isArray(item.changes.after)
    ? item.changes.after as Record<string, unknown>
    : {};
  const declaredFields = Array.isArray(item.changes.fields) ? item.changes.fields.map(String) : [];
  const fields = declaredFields.length ? declaredFields : [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const metadata = Object.entries(item.changes).filter(([key]) => !['before', 'after', 'fields', 'importId', 'subject'].includes(key));

  if (!fields.length && !metadata.length) return <p className="catalog-audit-empty-detail">Деталі для цього старого запису не збережені.</p>;
  return <div className="catalog-audit-changes">
    {fields.map((field) => <div className="catalog-audit-change" key={field}>
      <strong>{fieldLabels[field] || field}</strong>
      <div><span>Було</span><AuditValue field={field} value={before[field]} /></div>
      <Icon name="arrowRight" size={17} />
      <div><span>Стало</span><AuditValue field={field} value={after[field]} /></div>
    </div>)}
    {metadata.map(([field, value]) => <div className="catalog-audit-change catalog-audit-change--metadata" key={field}>
      <strong>{fieldLabels[field] || field}</strong>
      <AuditValue field={field} value={value} />
    </div>)}
  </div>;
}

function ImportSummary({ summary }: { summary: CatalogImportSummary | null }) {
  if (!summary) return null;
  return <div className="catalog-import-history-summary">
    <span>Усього <strong>{summaryTotal(summary)}</strong></span>
    <span className="is-created">Створено <strong>{summary.create || 0}</strong></span>
    <span className="is-updated">Оновлено <strong>{summary.update || 0}</strong></span>
    <span>Пропущено <strong>{summary.skipped || 0}</strong></span>
    <span className={(summary.error || summary.conflict) ? 'is-error' : ''}>Помилки <strong>{(summary.error || 0) + (summary.conflict || 0)}</strong></span>
  </div>;
}

function ImportDetails({ importId }: { importId: string }) {
  const [page, setPage] = useState(1);
  const details = useQuery({
    queryKey: ['catalog-import-history', importId, page],
    queryFn: () => api.catalog.importHistoryDetail(importId, { page, pageSize: 50 }),
    placeholderData: keepPreviousData
  });

  if (details.isLoading) return <p className="catalog-audit-empty-detail">Завантаження рядків імпорту…</p>;
  if (details.isError || !details.data) return <p className="catalog-audit-empty-detail catalog-audit-empty-detail--error">Не вдалося завантажити деталі імпорту.</p>;
  const data: CatalogImportHistoryDetail = details.data;
  return <div className="catalog-import-history-detail">
    <ImportSummary summary={data.summary} />
    <div className="catalog-import-history-table" role="table" aria-label="Рядки імпорту">
      <div className="catalog-import-history-row catalog-import-history-row--head" role="row">
        <span>Рядок</span><span>Товар</span><span>Результат</span><span>Ціна / залишок</span><span>Примітка</span>
      </div>
      {data.rows.map((row) => <div className="catalog-import-history-row" role="row" key={row.id}>
        <span data-label="Рядок">{row.rowNumber}</span>
        <span data-label="Товар"><strong>{row.name || 'Без назви'}</strong>{row.productCode && <small>{row.productCode}</small>}</span>
        <span data-label="Результат"><span className={`catalog-audit-result catalog-audit-result--${row.result}`}>{resultLabels[row.result] || row.result}</span></span>
        <span data-label="Ціна / залишок"><strong>{row.priceUah === null ? '—' : `${row.priceUah.toLocaleString('uk-UA')} ₴`}</strong><small>Залишок: {row.stockCount ?? '—'} · В дорозі: {row.incomingCount ?? '—'}</small></span>
        <span data-label="Примітка">{row.reason || (row.productId ? <Link to={`/catalog/products?product=${encodeURIComponent(row.productId)}`}>Відкрити товар</Link> : '—')}</span>
      </div>)}
    </div>
    {data.pageCount > 1 && <div className="catalog-audit-pagination catalog-audit-pagination--nested">
      <button className="button button--secondary button--small" type="button" disabled={page <= 1 || details.isFetching} onClick={() => setPage((current) => current - 1)}><Icon name="chevronLeft" size={16} /> Назад</button>
      <span>{page} / {data.pageCount}</span>
      <button className="button button--secondary button--small" type="button" disabled={page >= data.pageCount || details.isFetching} onClick={() => setPage((current) => current + 1)}>Далі <Icon name="chevronRight" size={16} /></button>
    </div>}
  </div>;
}

function HistoryItem({ item }: { item: CatalogAuditHistoryItem }) {
  const [expanded, setExpanded] = useState(false);
  const title = actionLabels[item.action] || item.action;
  const isImport = item.kind === 'import' && Boolean(item.importId);
  return <article className={`catalog-audit-event catalog-audit-event--${item.source}`}>
    <div className="catalog-audit-event__marker"><Icon name={isImport ? 'upload' : item.category === 'publication' ? 'visibility' : 'history'} size={20} /></div>
    <div className="catalog-audit-event__body">
      <div className="catalog-audit-event__heading">
        <div>
          <div className="catalog-audit-event__badges"><span>{item.source === 'xlsx' ? 'XLSX' : 'Вручну'}</span><time>{formattedDate(item.createdAt)}</time></div>
          <h2>{title}</h2>
          {item.product && (item.product.id
            ? <Link className="catalog-audit-event__product" to={`/catalog/products?product=${encodeURIComponent(item.product.id)}`}>
              {item.product.name || 'Товар'}{item.product.productCode && <small>{item.product.productCode}</small>}
            </Link>
            : <span className="catalog-audit-event__product">{item.product.name || 'Видалений товар'}{item.product.productCode && <small>{item.product.productCode}</small>}</span>)}
          <p>{item.actor?.name || 'Системна дія'}</p>
        </div>
        <button className="button button--secondary button--small" type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>
          {expanded ? 'Згорнути' : 'Деталі'} <Icon name={expanded ? 'arrowUp' : 'arrowDown'} size={16} />
        </button>
      </div>
      {isImport && <ImportSummary summary={item.summary} />}
      {expanded && <div className="catalog-audit-event__details">
        {isImport && item.importId ? <ImportDetails importId={item.importId} /> : <AuditChanges item={item} />}
      </div>}
    </div>
  </article>;
}

export function CatalogAuditPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchDraft, setSearchDraft] = useState(searchParams.get('search') || '');
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [filters, setFilters] = useState<AuditFilters>(() => ({
    source: searchParams.get('source') === 'xlsx' ? 'xlsx' : searchParams.get('source') === 'manual' ? 'manual' : 'all',
    category: 'all',
    actorId: '',
    dateFrom: '',
    dateTo: ''
  }));
  const [page, setPage] = useState(1);
  const queryParams = useMemo<CatalogAuditHistoryParams>(() => ({ ...filters, search, page, pageSize: 25 }), [filters, page, search]);
  const history = useQuery({
    queryKey: ['catalog-audit-history', queryParams],
    queryFn: () => api.catalog.auditHistory(queryParams),
    placeholderData: keepPreviousData
  });

  function updateFilter<K extends keyof AuditFilters>(key: K, value: AuditFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function applySearch() {
    const nextSearch = searchDraft.trim();
    setSearch(nextSearch);
    setPage(1);
    const nextParams = new URLSearchParams();
    if (filters.source !== 'all') nextParams.set('source', filters.source);
    if (nextSearch) nextParams.set('search', nextSearch);
    setSearchParams(nextParams, { replace: true });
  }

  function resetFilters() {
    setSearchDraft('');
    setSearch('');
    setFilters({ source: 'all', category: 'all', actorId: '', dateFrom: '', dateTo: '' });
    setPage(1);
    setSearchParams({}, { replace: true });
  }

  const feed = history.data;
  return <div className="catalog-audit-page">
    <section className="task-toolbar catalog-audit-header">
      <div><p className="eyebrow">Контроль каталогу</p><h1>Історія змін</h1><p>Ручні дії та XLSX-імпорти в одному хронологічному журналі.</p></div>
      <div className="catalog-audit-total"><span>Знайдено</span><strong>{feed?.total ?? 0}</strong></div>
    </section>

    <section className="catalog-audit-filters" aria-label="Фільтри історії">
      <form className="catalog-audit-search" onSubmit={(event) => { event.preventDefault(); applySearch(); }}>
        <Icon name="search" size={19} />
        <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Назва, код товару або користувач" aria-label="Пошук в історії" />
        <button className="button button--primary button--small" type="submit">Знайти</button>
      </form>
      <label><span>Джерело</span><select value={filters.source} onChange={(event) => updateFilter('source', event.target.value as CatalogAuditSource)}><option value="all">Усі зміни</option><option value="manual">Вручну</option><option value="xlsx">XLSX</option></select></label>
      <label><span>Тип дії</span><select value={filters.category} onChange={(event) => updateFilter('category', event.target.value as CatalogAuditCategory)}><option value="all">Усі дії</option><option value="products">Товари</option><option value="publication">Публікація</option><option value="media">Фотографії</option><option value="characteristics">Характеристики</option><option value="modifications">Модифікації</option><option value="settings">Налаштування</option><option value="import">Імпорт XLSX</option></select></label>
      <label><span>Користувач</span><select value={filters.actorId} onChange={(event) => updateFilter('actorId', event.target.value)}><option value="">Усі користувачі</option>{(feed?.actors || []).map((actor) => <option value={actor.id} key={actor.id}>{actor.name}</option>)}</select></label>
      <label><span>Від дати</span><input type="date" value={filters.dateFrom} onChange={(event) => updateFilter('dateFrom', event.target.value)} /></label>
      <label><span>До дати</span><input type="date" value={filters.dateTo} onChange={(event) => updateFilter('dateTo', event.target.value)} /></label>
      <button className="button button--secondary button--small catalog-audit-reset" type="button" onClick={resetFilters}><Icon name="reply" size={16} /> Скинути</button>
    </section>

    {history.isError ? <section className="catalog-placeholder"><h2>Не вдалося завантажити історію</h2><p>Перевірте з’єднання та спробуйте ще раз.</p><button className="button button--secondary" type="button" onClick={() => void history.refetch()}>Повторити</button></section>
      : history.isLoading ? <section className="catalog-placeholder"><h2>Завантаження історії…</h2></section>
        : !feed?.items.length ? <section className="catalog-placeholder catalog-audit-empty"><div className="empty-state__icon"><Icon name="history" size={28} /></div><h2>Змін не знайдено</h2><p>Спробуйте скинути або змінити фільтри.</p></section>
          : <section className={`catalog-audit-list${history.isFetching ? ' is-refreshing' : ''}`}>
            {feed.items.map((item) => <HistoryItem item={item} key={`${item.kind}:${item.id}`} />)}
          </section>}

    {feed && feed.pageCount > 1 && <nav className="catalog-audit-pagination" aria-label="Сторінки історії">
      <button className="button button--secondary" type="button" disabled={page <= 1 || history.isFetching} onClick={() => setPage((current) => current - 1)}><Icon name="chevronLeft" size={17} /> Назад</button>
      <span>Сторінка <strong>{page}</strong> з <strong>{feed.pageCount}</strong></span>
      <button className="button button--secondary" type="button" disabled={page >= feed.pageCount || history.isFetching} onClick={() => setPage((current) => current + 1)}>Далі <Icon name="chevronRight" size={17} /></button>
    </nav>}
  </div>;
}
