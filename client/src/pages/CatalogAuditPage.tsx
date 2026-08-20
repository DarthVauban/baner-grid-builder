import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { CatalogImageLightbox } from '../components/CatalogImageLightbox';
import type { CatalogLightboxImage } from '../components/CatalogImageLightbox';
import { Icon } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';
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
  permanent_delete: 'Товар видалено назавжди',
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
  photo_parser_url_update: 'Оновлено посилання для парсера',
  photo_parser_import: 'Імпортовано фотографії парсером',
  photo_parser_adapter_create: 'Додано магазин до парсера',
  photo_parser_adapter_update: 'Оновлено магазин парсера',
  photo_parser_adapter_delete: 'Видалено магазин із парсера',
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
  sourceUrl: 'Посилання джерела',
  adapterId: 'Адаптер магазину',
  found: 'Знайдено фото',
  saved: 'Збережено фото',
  skipped: 'Пропущено фото',
  errors: 'Помилки',
  host: 'Домен магазину',
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

function readableCharacteristicValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Так' : 'Ні';
  if (typeof value === 'number') return value.toLocaleString('uk-UA');
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.length ? value.map(readableCharacteristicValue).join(', ') : '—';
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const colorName = typeof record.name === 'string' ? record.name.trim() : '';
    const colorHex = typeof record.hex === 'string' ? record.hex.trim() : '';
    if ('name' in record || 'hex' in record) return colorName || colorHex || '—';
    const parts = Object.entries(record)
      .map(([key, nestedValue]) => `${key}: ${readableCharacteristicValue(nestedValue)}`)
      .filter((part) => !part.endsWith(': —'));
    return parts.length ? parts.join(', ') : '—';
  }
  return String(value);
}

function CharacteristicValues({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return <span>{readableCharacteristicValue(value)}</span>;
  }
  return <dl className="catalog-audit-characteristics">
    {Object.entries(value as Record<string, unknown>).map(([label, characteristicValue]) => {
      const colorHex = characteristicValue && typeof characteristicValue === 'object' && !Array.isArray(characteristicValue)
        && typeof (characteristicValue as Record<string, unknown>).hex === 'string'
        ? String((characteristicValue as Record<string, unknown>).hex).trim()
        : '';
      const safeColor = /^#[0-9a-f]{3,8}$/i.test(colorHex) ? colorHex : '';
      return <div key={label}>
        <dt>{label}</dt>
        <dd>
          {safeColor && <i style={{ backgroundColor: safeColor }} aria-hidden="true" />}
          {readableCharacteristicValue(characteristicValue)}
        </dd>
      </div>;
    })}
  </dl>;
}

function auditMediaImages(field: string, value: unknown, productName: string): CatalogLightboxImage[] {
  const mediaFields = ['mainImageUrl', 'gallery', 'removedMediaUrl'];
  if (!mediaFields.includes(field)) return [];
  const values = Array.isArray(value) ? value : [value];
  const images: CatalogLightboxImage[] = [];
  values.forEach((item) => {
    const url = typeof item === 'string'
      ? item.trim()
      : item && typeof item === 'object' && typeof (item as Record<string, unknown>).url === 'string'
        ? String((item as Record<string, unknown>).url).trim()
        : '';
    if (!url || images.some((image) => image.url === url)) return;
    const alt = item && typeof item === 'object' && typeof (item as Record<string, unknown>).alt === 'string'
      ? String((item as Record<string, unknown>).alt)
      : productName;
    images.push({ url, alt });
  });
  return images;
}

function AuditMediaValue({
  images,
  onOpen
}: {
  images: CatalogLightboxImage[];
  onOpen: (images: CatalogLightboxImage[], index: number) => void;
}) {
  if (!images.length) return <span>—</span>;
  const visibleImages = images.slice(0, 5);
  return <div className="catalog-audit-media">
    {visibleImages.map((image, index) => <button
      type="button"
      key={`${image.url}-${index}`}
      onClick={() => onOpen(images, index)}
      aria-label={`Відкрити фото ${index + 1} з ${images.length}`}
    >
      <img src={image.url} alt="" loading="lazy" />
    </button>)}
    {images.length > visibleImages.length && <button
      className="catalog-audit-media__more"
      type="button"
      onClick={() => onOpen(images, visibleImages.length)}
      aria-label={`Відкрити ще ${images.length - visibleImages.length} фото`}
    >
      +{images.length - visibleImages.length}
    </button>}
    <small>{images.length} фото</small>
  </div>;
}

function AuditValue({
  field,
  value,
  productName,
  onOpenImages
}: {
  field: string;
  value: unknown;
  productName: string;
  onOpenImages: (images: CatalogLightboxImage[], index: number) => void;
}) {
  if (field === 'characteristicValues') return <CharacteristicValues value={value} />;
  const images = auditMediaImages(field, value, productName);
  if (['mainImageUrl', 'gallery', 'removedMediaUrl'].includes(field)) {
    return <AuditMediaValue images={images} onOpen={onOpenImages} />;
  }
  if (Array.isArray(value)) {
    return <span>{value.length ? value.map(String).join(', ') : '—'}</span>;
  }
  if (value && typeof value === 'object') {
    return <pre className="catalog-audit-value-json">{JSON.stringify(value, null, 2)}</pre>;
  }
  return <span>{scalarValue(field, value)}</span>;
}

function AuditChanges({
  item,
  onOpenImages
}: {
  item: CatalogAuditHistoryItem;
  onOpenImages: (images: CatalogLightboxImage[], index: number) => void;
}) {
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
      <div><span>Було</span><AuditValue field={field} value={before[field]} productName={item.product?.name || 'Товар'} onOpenImages={onOpenImages} /></div>
      <Icon name="arrowRight" size={17} />
      <div><span>Стало</span><AuditValue field={field} value={after[field]} productName={item.product?.name || 'Товар'} onOpenImages={onOpenImages} /></div>
    </div>)}
    {metadata.map(([field, value]) => <div className="catalog-audit-change catalog-audit-change--metadata" key={field}>
      <strong>{fieldLabels[field] || field}</strong>
      <AuditValue field={field} value={value} productName={item.product?.name || 'Товар'} onOpenImages={onOpenImages} />
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
  const [lightbox, setLightbox] = useState<{ images: CatalogLightboxImage[]; index: number } | null>(null);
  const title = actionLabels[item.action] || item.action;
  const isImport = item.kind === 'import' && Boolean(item.importId);
  return <>
    <article className={`catalog-audit-event catalog-audit-event--${item.source}`}>
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
        {isImport && item.importId
          ? <ImportDetails importId={item.importId} />
          : <AuditChanges item={item} onOpenImages={(images, index) => setLightbox({ images, index })} />}
      </div>}
    </div>
    </article>
    {lightbox && <CatalogImageLightbox
      images={lightbox.images}
      index={lightbox.index}
      onIndexChange={(index) => setLightbox((current) => current ? { ...current, index } : null)}
      onClose={() => setLightbox(null)}
    />}
  </>;
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
      <label><span>Джерело</span><StyledSelect value={filters.source} options={[{ value: 'all', label: 'Усі зміни' }, { value: 'manual', label: 'Вручну' }, { value: 'xlsx', label: 'XLSX' }]} onChange={(value) => updateFilter('source', value as CatalogAuditSource)} ariaLabel="Джерело змін" /></label>
      <label><span>Тип дії</span><StyledSelect value={filters.category} options={[{ value: 'all', label: 'Усі дії' }, { value: 'products', label: 'Товари' }, { value: 'publication', label: 'Публікація' }, { value: 'media', label: 'Фотографії' }, { value: 'characteristics', label: 'Характеристики' }, { value: 'modifications', label: 'Модифікації' }, { value: 'settings', label: 'Налаштування' }, { value: 'import', label: 'Імпорт XLSX' }]} onChange={(value) => updateFilter('category', value as CatalogAuditCategory)} ariaLabel="Тип дії" /></label>
      <label><span>Користувач</span><StyledSelect value={filters.actorId} options={[{ value: '', label: 'Усі користувачі' }, ...(feed?.actors || []).map((actor) => ({ value: actor.id, label: actor.name }))]} onChange={(value) => updateFilter('actorId', value)} ariaLabel="Користувач" searchable /></label>
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
