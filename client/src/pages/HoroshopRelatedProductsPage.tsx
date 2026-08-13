import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import type {
  HoroshopCatalogModification,
  HoroshopCatalogProduct,
  HoroshopCatalogState,
  HoroshopCatalogVisibility,
  HoroshopLocalizedText
} from '../types/horoshop-catalog';

type AvailabilityTone = 'available' | 'waiting' | 'unavailable' | 'unknown';

function titleFor(titles: HoroshopLocalizedText, fallback: string) {
  return titles.uk || titles.ua || titles.ru || titles.en || Object.values(titles)[0] || fallback;
}

function availabilityFor(value: string | null | undefined, active = true): { label: string; tone: AvailabilityTone } {
  if (!active) return { label: 'Неактивний', tone: 'unavailable' };
  const label = value?.trim();
  if (!label) return { label: 'Наявність не вказана', tone: 'unknown' };
  const normalized = label.toLocaleLowerCase('uk-UA');
  if (/немає|відсут|нет\s+в\s+налич|out\s+of\s+stock|not\s+available|^0$/u.test(normalized)) {
    return { label, tone: 'unavailable' };
  }
  if (/очіку|під\s+замовлення|предзаказ|preorder|wait/u.test(normalized)) {
    return { label, tone: 'waiting' };
  }
  return { label, tone: 'available' };
}

function cardAvailabilityFor(product: HoroshopCatalogProduct) {
  const statuses = (product.modifications.length > 0 ? product.modifications : [product])
    .map((item) => availabilityFor(item.availability, item.active));
  if (statuses.some((status) => status.tone === 'available')) {
    return { label: 'Є в наявності', tone: 'available' as const };
  }
  if (statuses.some((status) => status.tone === 'waiting')) {
    return { label: 'Очікується', tone: 'waiting' as const };
  }
  if (statuses.length > 0 && statuses.every((status) => status.tone === 'unavailable')) {
    return { label: 'Немає в наявності', tone: 'unavailable' as const };
  }
  return { label: 'Наявність не вказана', tone: 'unknown' as const };
}

function numericPrice(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value.replace(/\s/gu, '').replace(',', '.').replace(/[^\d.-]/gu, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPrice(value: string | number | null | undefined, currency = 'UAH') {
  const number = typeof value === 'number' ? value : numericPrice(value);
  if (number === null) return '—';
  const formatted = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(number);
  const normalizedCurrency = currency.toUpperCase();
  if (normalizedCurrency === 'UAH' || normalizedCurrency === 'ГРН') return `${formatted} грн`;
  return `${formatted} ${currency}`;
}

function cardPriceFor(product: HoroshopCatalogProduct) {
  const prices = product.modifications
    .map((modification) => numericPrice(modification.price))
    .filter((price): price is number => price !== null);
  if (prices.length === 0) return formatPrice(product.price, product.currency || 'UAH');
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);
  return `${minimum < maximum ? 'від ' : ''}${formatPrice(minimum, product.currency || product.modifications[0]?.currency || 'UAH')}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'ще не виконувалась';
  return new Intl.DateTimeFormat('uk-UA', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  }).format(new Date(value));
}

function ProductImage({ src, brand, small = false }: { src: string | null; brand: string | null; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  const fallback = (brand || 'Товар').trim().slice(0, 2).toUpperCase();
  return (
    <span className={`horoshop-product-image${small ? ' horoshop-product-image--small' : ''}`} aria-hidden="true">
      <span>{fallback}</span>
      {src && !failed && <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />}
    </span>
  );
}

function AvailabilityBadge({ value, active }: { value: string | null; active: boolean }) {
  const state = availabilityFor(value, active);
  return <span className={`horoshop-badge horoshop-badge--${state.tone}`}><i />{state.label}</span>;
}

function VisibilityBadge({ visible, modification = false }: { visible: boolean; modification?: boolean }) {
  return (
    <span className={`horoshop-badge horoshop-badge--visibility${visible ? '' : ' is-hidden'}`}>
      {visible ? (modification ? 'Видима' : 'Видимий') : (modification ? 'Прихована' : 'Прихований')}
    </span>
  );
}

function ModificationRow({ modification, index, brand, currency }: {
  modification: HoroshopCatalogModification;
  index: number;
  brand: string | null;
  currency: string | null;
}) {
  const title = titleFor(modification.titles, modification.sku);
  return (
    <div className="horoshop-product-row horoshop-product-row--modification" role="treeitem" aria-level={2}>
      <span className="horoshop-tree-joint" aria-hidden="true" />
      <div className="horoshop-product-main">
        <ProductImage src={modification.imageUrl} brand={brand} small />
        <div className="horoshop-product-copy">
          <strong title={title}>{title}</strong>
          <small>Модифікація {index + 1} · <code>{modification.sku}</code></small>
        </div>
      </div>
      <div className="horoshop-price"><span>Ціна</span><strong>{formatPrice(modification.price, modification.currency || currency || 'UAH')}</strong></div>
      <AvailabilityBadge value={modification.availability} active={modification.active} />
      <VisibilityBadge visible={modification.visible} modification />
    </div>
  );
}

function ProductTreeNode({ product, expanded, onToggle }: {
  product: HoroshopCatalogProduct;
  expanded: boolean;
  onToggle: () => void;
}) {
  const title = titleFor(product.titles, product.sku);
  const hasModifications = product.modifications.length > 0;
  const availability = cardAvailabilityFor(product);
  const branchId = `horoshop-modifications-${product.id}`;
  return (
    <article className={`horoshop-tree-node${expanded ? ' is-expanded' : ''}`} role="treeitem" aria-level={1} aria-expanded={hasModifications ? expanded : undefined}>
      <div className="horoshop-product-row horoshop-product-row--parent">
        {hasModifications ? (
          <button className="horoshop-tree-toggle" type="button" aria-controls={branchId} aria-expanded={expanded} aria-label={`${expanded ? 'Згорнути' : 'Розгорнути'} модифікації ${title}`} onClick={onToggle}>
            <Icon name={expanded ? 'arrowDown' : 'arrow'} size={20} />
          </button>
        ) : <span className="horoshop-tree-toggle-spacer" />}
        <div className="horoshop-product-main">
          <ProductImage src={product.primaryImageUrl} brand={product.brand} />
          <div className="horoshop-product-copy">
            <strong title={title}>{title}</strong>
            <small>{product.brand || 'Без бренду'} · <code>{product.sku}</code></small>
          </div>
        </div>
        <div className="horoshop-price"><span>Ціна</span><strong>{cardPriceFor(product)}</strong></div>
        <span className={`horoshop-badge horoshop-badge--${availability.tone}`}><i />{availability.label}</span>
        <VisibilityBadge visible={product.visible} />
        {hasModifications ? (
          <button className="horoshop-modifications-button" type="button" aria-controls={branchId} aria-expanded={expanded} onClick={onToggle}>
            <Icon name="variants" size={17} /> Модифікації <b>{product.modifications.length}</b>
          </button>
        ) : <span />}
        {product.canonicalUrl ? (
          <a className="horoshop-external-link" href={product.canonicalUrl} target="_blank" rel="noreferrer" aria-label={`Відкрити ${title} на сайті`}>
            <Icon name="openInNew" size={19} />
          </a>
        ) : <span />}
      </div>
      {hasModifications && expanded && (
        <div className="horoshop-tree-branches" id={branchId} role="group">
          {product.modifications.map((modification, index) => (
            <ModificationRow key={modification.id} modification={modification} index={index} brand={product.brand} currency={product.currency} />
          ))}
        </div>
      )}
    </article>
  );
}

export function HoroshopRelatedProductsPage() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [availability, setAvailability] = useState('');
  const [visibility, setVisibility] = useState<HoroshopCatalogVisibility>('all');
  const [state, setState] = useState<HoroshopCatalogState>('active');
  const [page, setPage] = useState(1);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const timeout = globalThis.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => globalThis.clearTimeout(timeout);
  }, [searchInput]);

  const params = useMemo(() => ({
    search, category, availability, visibility, state, page, pageSize: 25
  }), [availability, category, page, search, state, visibility]);
  const catalog = useQuery({
    queryKey: ['horoshop-catalog', params],
    queryFn: ({ signal }) => api.horoshopCatalog.list(params, signal),
    placeholderData: (previous) => previous,
    refetchInterval: (query) => query.state.data?.integration.status === 'syncing' ? 2_000 : 30_000
  });
  const syncCatalog = useMutation({
    mutationFn: () => api.horoshopCatalog.sync(),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['horoshop-catalog'] })
  });
  const data = catalog.data;
  const integration = data?.integration;
  const items = data?.items || [];
  const start = data?.total ? ((data.page - 1) * data.pageSize) + 1 : 0;
  const end = data ? Math.min(data.total, data.page * data.pageSize) : 0;

  const setFilter = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    setPage(1);
  };
  const toggleProduct = (id: string) => {
    setExpandedProducts((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="horoshop-catalog-page">
      <header className="page-heading page-heading--row horoshop-catalog-heading">
        <div>
          <p className="eyebrow">Супутні товари Хорошоп</p>
          <h1>Каталог товарів</h1>
          <p>Перевіряйте імпортовані товари та їхні модифікації перед формуванням рекомендацій.</p>
        </div>
        <div className="page-heading__actions">
          <Link className="button button--secondary" to="/admin/integrations"><Icon name="integrations" size={18} /> Інтеграція</Link>
          <button className="button button--primary" type="button" disabled={!integration?.configured || syncCatalog.isPending || integration.status === 'syncing'} onClick={() => syncCatalog.mutate()}>
            <Icon name="refresh" size={18} /> {integration?.status === 'syncing' || syncCatalog.isPending ? 'Синхронізація…' : 'Оновити каталог'}
          </button>
        </div>
      </header>

      {catalog.isLoading && <div className="task-list-state"><span className="loading-screen__pulse" /><p>Завантажуємо каталог Хорошоп…</p></div>}
      {catalog.isError && <div className="task-list-state task-list-state--error"><h2>Не вдалося завантажити каталог</h2><p>{catalog.error instanceof Error ? catalog.error.message : 'Повторіть спробу.'}</p><button className="button button--secondary task-list-state__action" type="button" onClick={() => void catalog.refetch()}>Спробувати ще</button></div>}

      {!catalog.isLoading && !catalog.isError && integration && !integration.configured && (
        <section className="empty-state horoshop-catalog-empty">
          <span className="empty-state__icon"><Icon name="storefront" size={31} /></span>
          <h2>Магазин Хорошоп ще не підключено</h2>
          <p>Підключіть тестовий магазин у розділі інтеграцій. Після першої синхронізації каталог з’явиться тут автоматично.</p>
          <Link className="button button--primary" to="/admin/integrations">Перейти до інтеграції</Link>
        </section>
      )}

      {!catalog.isLoading && !catalog.isError && data && integration?.configured && (
        <>
          <section className="horoshop-catalog-overview" aria-label="Стан каталогу">
            <div><span>Товари</span><strong>{integration.counts.products.toLocaleString('uk-UA')}</strong></div>
            <div><span>Модифікації</span><strong>{integration.counts.modifications.toLocaleString('uk-UA')}</strong></div>
            <div><span>Розділи</span><strong>{integration.counts.categories.toLocaleString('uk-UA')}</strong></div>
            <div className={`horoshop-catalog-sync-state is-${integration.status}`}><span>Остання синхронізація</span><strong>{integration.status === 'syncing' ? 'Виконується' : formatDate(integration.lastSyncAt)}</strong><small>{integration.storeDomain}</small></div>
          </section>

          {integration.lastError && <div className="horoshop-catalog-alert"><Icon name="alarm" size={19} /><span><strong>Остання синхронізація завершилась з помилкою.</strong>{integration.lastError}</span></div>}
          {syncCatalog.isError && <div className="horoshop-catalog-alert"><Icon name="alarm" size={19} /><span>{syncCatalog.error instanceof Error ? syncCatalog.error.message : 'Не вдалося запустити синхронізацію.'}</span></div>}

          <section className="horoshop-catalog-panel">
            <div className="horoshop-catalog-toolbar">
              <label className="horoshop-search-field"><Icon name="search" size={19} /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Назва, артикул або бренд" aria-label="Пошук товарів" /></label>
              <label><span>Розділ</span><select value={category} onChange={(event) => setFilter(setCategory, event.target.value)}><option value="">Усі розділи</option>{data.categories.map((item) => <option value={item.externalId} key={item.externalId}>{titleFor(item.titles, item.externalId)} ({item.productCount})</option>)}</select></label>
              <label><span>Наявність</span><select value={availability} onChange={(event) => setFilter(setAvailability, event.target.value)}><option value="">Будь-яка</option>{data.availabilityOptions.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
              <label><span>Видимість</span><select value={visibility} onChange={(event) => setFilter(setVisibility, event.target.value as HoroshopCatalogVisibility)}><option value="all">Усі</option><option value="visible">Видимі</option><option value="hidden">Приховані</option></select></label>
              <label><span>Стан</span><select value={state} onChange={(event) => setFilter(setState, event.target.value as HoroshopCatalogState)}><option value="active">Активні</option><option value="inactive">Неактивні</option><option value="all">Усі</option></select></label>
            </div>

            <div className="horoshop-catalog-tree" role="tree" aria-label="Каталог товарів з модифікаціями" aria-busy={catalog.isFetching}>
              {catalog.isFetching && <div className="horoshop-catalog-loading" role="status"><span className="loading-screen__pulse" /> Оновлюємо список…</div>}
              {items.map((product) => <ProductTreeNode key={product.id} product={product} expanded={expandedProducts.has(product.id)} onToggle={() => toggleProduct(product.id)} />)}
              {!catalog.isFetching && items.length === 0 && <div className="horoshop-catalog-no-results"><Icon name="search" size={27} /><strong>Товарів не знайдено</strong><span>Змініть запит або фільтри каталогу.</span></div>}
            </div>

            <footer className="horoshop-catalog-pagination">
              <span>Показано {start}–{end} із {data.total.toLocaleString('uk-UA')} карток</span>
              <div><button type="button" disabled={data.page <= 1 || catalog.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}><Icon name="chevronLeft" size={18} /> Назад</button><span>{data.page} / {Math.max(data.pageCount, 1)}</span><button type="button" disabled={data.page >= data.pageCount || catalog.isFetching} onClick={() => setPage((current) => current + 1)}>Далі <Icon name="chevronRight" size={18} /></button></div>
            </footer>
          </section>
        </>
      )}
    </div>
  );
}
