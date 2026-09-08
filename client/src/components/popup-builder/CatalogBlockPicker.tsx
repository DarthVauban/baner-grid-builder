import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { promoOffer } from '../../lib/popup-campaign';
import type { BlockNode } from './block-model';
import { Choice, Property } from './BlockInspector';

export function CatalogBlockPicker({ node, onChange }: { node: BlockNode; onChange: (node: BlockNode) => void }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { const timer = window.setTimeout(() => { setQuery(search); setPage(1); }, 250); return () => window.clearTimeout(timer); }, [search]);
  const feed = useQuery({ queryKey: ['popup-block-catalog', query, category, page], queryFn: ({ signal }) => api.popupBanners.catalog({ search: query, category, page, pageSize: 20 }, signal) });
  const offers = (feed.data?.items || []).flatMap(product => {
    const modifications = product.modifications.filter(item => item.active && item.visible);
    return modifications.length ? modifications.map(item => promoOffer(product, item)) : [promoOffer(product)];
  });
  return <div className="pb-catalog-picker">
    <p className="pb-help">{node.props.productExternalId ? `Прив’язано товар ${node.props.productExternalId}${node.props.modificationExternalId ? ' · варіант ' + node.props.modificationExternalId : ''}` : 'Оберіть товар із підключеного каталогу. Ціна й наявність оновлюються з каталогу.'}</p>
    <Property label="Знайти товар"><input aria-label="Знайти товар" value={search} placeholder="Назва або артикул" onChange={event => setSearch(event.target.value)} /></Property>
    <Choice label="Категорія каталогу" value={category} options={ [['', 'Усі категорії'], ...(feed.data?.categories || []).map(item => [item.externalId, item.titles.uk || item.titles.ua || Object.values(item.titles)[0] || item.externalId] as const)] } onChange={value => { setCategory(value); setPage(1); }} />
    {feed.isPending && <p role="status">Завантаження товарів…</p>}
    {feed.error && <p role="alert">{feed.error.message}</p>}
    {!feed.isPending && !feed.error && !offers.length && <p>Товарів не знайдено.</p>}
    <div className="pb-catalog-results">{offers.map(offer => <button key={offer.id} type="button" disabled={!offer.available || !offer.visible} aria-pressed={node.props.productExternalId === offer.productExternalId && node.props.modificationExternalId === (offer.modificationExternalId || '')} onClick={() => onChange({ ...node, props: { ...node.props, productExternalId: offer.productExternalId, modificationExternalId: offer.modificationExternalId || '' } })}>
      {offer.imageUrl && <img src={offer.imageUrl} alt="" />}<span><strong>{offer.title}</strong><small>{offer.sku} · {offer.price} {offer.currency}</small><small>{offer.availability}</small></span>
    </button>)}</div>
    <div className="pb-pagination"><button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>←</button><span>{page} / {feed.data?.pageCount || 1}</span><button type="button" disabled={!feed.data || page >= feed.data.pageCount} onClick={() => setPage(value => value + 1)}>→</button></div>
    {node.props.productExternalId && <button type="button" onClick={() => onChange({ ...node, props: { ...node.props, productExternalId: '', modificationExternalId: '' } })}>Прибрати прив’язку</button>}
  </div>;
}
