import { useDeferredValue, useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type { CatalogProduct } from '../types/catalog';
import '../styles/catalog-archive.css';

const pageSize = 25;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('uk-UA', { dateStyle: 'medium', timeStyle: 'short' });
}

function ProductImage({ product }: { product: CatalogProduct }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [product.mainImageUrl]);
  return <span className="catalog-archive-product__image">
    {product.mainImageUrl && !failed
      ? <img src={product.mainImageUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
      : <Icon name="phone" size={24} />}
  </span>;
}

export function CatalogArchivePage() {
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [deferredSearch]);

  const products = useQuery({
    queryKey: ['catalog-products-archive', deferredSearch, page],
    queryFn: () => api.catalog.list({
      search: deferredSearch,
      status: 'ARCHIVED',
      sort: 'updated_desc',
      page,
      pageSize
    }),
    placeholderData: keepPreviousData
  });

  const permanentDelete = useMutation({
    mutationFn: (product: CatalogProduct) => api.catalog.permanentlyRemove(product.id, product.version),
    onSuccess: async (_, product) => {
      if ((products.data?.items.length || 0) === 1 && page > 1) setPage((current) => current - 1);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['catalog-products-archive'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog-products'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog-product'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog-audit'] })
      ]);
      showToast(`Товар «${product.name}» повністю видалено з бази даних.`, 'success');
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : 'Не вдалося повністю видалити товар.', 'error');
    }
  });

  async function removePermanently(product: CatalogProduct) {
    const accepted = await confirm({
      title: 'Видалити товар назавжди?',
      message: `«${product.name}» (${product.productCode}) буде повністю видалено з бази даних разом із ключами імпорту, характеристиками та зв’язками. Цю дію неможливо скасувати.`,
      confirmLabel: 'Видалити назавжди',
      tone: 'danger'
    });
    if (accepted) permanentDelete.mutate(product);
  }

  const items = products.data?.items || [];
  const loadingError = products.error instanceof Error ? products.error.message : 'Не вдалося завантажити архів товарів.';

  return <div className="catalog-page catalog-archive-page">
    <header className="page-heading catalog-archive-header">
      <div>
        <p className="eyebrow">Каталог смартфонів</p>
        <h1>Архів товарів</h1>
        <p>Тут зберігаються товари, видалені з активного каталогу.</p>
      </div>
      <div className="catalog-archive-total">
        <span>В архіві</span>
        <strong>{products.data?.total ?? '—'}</strong>
      </div>
    </header>

    <section className="catalog-archive-notice">
      <span><Icon name="archive" size={22} /></span>
      <div>
        <strong>Архівні товари залишаються частиною бази</strong>
        <p>Їхні коди та ключі можуть збігатися з наступним XLSX-імпортом. Повне видалення звільняє ці ідентифікатори, але є незворотним.</p>
      </div>
    </section>

    <section className="catalog-archive-toolbar">
      <label>
        <span>Пошук в архіві</span>
        <span className="catalog-archive-search">
          <Icon name="search" size={18} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Назва, код або slug"
          />
        </span>
      </label>
    </section>

    {products.isLoading && <div className="empty-state catalog-archive-empty">
      <div className="empty-state__icon"><Icon name="archive" size={28} /></div>
      <h2>Завантажуємо архів…</h2>
    </div>}

    {products.isError && <div className="empty-state catalog-archive-empty">
      <div className="empty-state__icon"><Icon name="close" size={28} /></div>
      <h2>Архів недоступний</h2>
      <p>{loadingError}</p>
      <button className="button button--secondary" type="button" onClick={() => void products.refetch()}>
        <Icon name="refresh" size={16} /> Спробувати ще раз
      </button>
    </div>}

    {!products.isLoading && !products.isError && !items.length && <div className="empty-state catalog-archive-empty">
      <div className="empty-state__icon"><Icon name="archive" size={28} /></div>
      <h2>{deferredSearch ? 'Архівних товарів не знайдено' : 'Архів порожній'}</h2>
      <p>{deferredSearch ? 'Змініть пошуковий запит і спробуйте ще раз.' : 'Видалені з активного каталогу товари з’являться тут.'}</p>
    </div>}

    {!products.isLoading && !products.isError && items.length > 0 && <section className={`catalog-archive-list${products.isFetching ? ' is-refreshing' : ''}`}>
      <div className="catalog-archive-list__head">
        <span>Товар</span><span>Стан</span><span>Ціна</span><span>Залишки</span><span>Остання зміна</span><span>Дії</span>
      </div>
      {items.map((product) => <article className="catalog-archive-product" key={product.id}>
        <div className="catalog-archive-product__identity">
          <ProductImage product={product} />
          <span>
            <strong>{product.name}</strong>
            <small>{product.productCode}{product.brand?.label ? ` · ${product.brand.label}` : ''}</small>
          </span>
        </div>
        <span data-label="Стан">{product.conditionLabel}</span>
        <strong data-label="Ціна">{product.priceLabel}</strong>
        <span data-label="Залишки">{product.stockCount} шт. · в дорозі {product.incomingCount}</span>
        <span data-label="Остання зміна">{formatDate(product.updatedAt)}</span>
        <div className="catalog-archive-product__actions">
          <button
            className="button button--danger button--small"
            type="button"
            disabled={permanentDelete.isPending}
            onClick={() => void removePermanently(product)}
            aria-label={`Видалити назавжди ${product.name}`}
          >
            <Icon name="delete" size={15} />
            {permanentDelete.isPending && permanentDelete.variables?.id === product.id ? 'Видалення…' : 'Видалити назавжди'}
          </button>
        </div>
      </article>)}
      <footer className="catalog-archive-pagination">
        <span>{products.data ? `${products.data.total} товарів · сторінка ${products.data.page} з ${products.data.pageCount}` : ''}</span>
        <div>
          <button className="button button--secondary button--small" type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            <Icon name="arrowLeft" size={14} /> Назад
          </button>
          <button className="button button--secondary button--small" type="button" disabled={!products.data || page >= products.data.pageCount} onClick={() => setPage((current) => current + 1)}>
            Далі <Icon name="arrowRight" size={14} />
          </button>
        </div>
      </footer>
    </section>}
  </div>;
}
