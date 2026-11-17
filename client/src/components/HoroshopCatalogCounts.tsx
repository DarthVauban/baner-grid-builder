import type { HoroshopCatalogSyncStatus } from '../types/integration';
import '../styles/horoshop-catalog-counts.css';

const number = new Intl.NumberFormat('uk-UA');

export function HoroshopCatalogCounts({ status }: { status?: HoroshopCatalogSyncStatus }) {
  const running = status?.status === 'syncing';
  const run = running ? status?.latestRun : null;
  const items = [
    { key: 'stickers', label: 'Стікери', value: running ? run?.stickersReceived ?? 0 : status?.configured ? status.counts?.stickers : null },
    { key: 'products', label: 'Товари', value: running ? run?.productsReceived ?? 0 : status?.configured ? status.counts?.products : null },
    { key: 'modifications', label: 'Модифікації', value: running ? run?.modificationsReceived ?? 0 : status?.configured ? status.counts?.modifications : null }
  ];

  return <div className={`topbar-catalog-counts${running ? ' is-running' : ''}`} role="group"
    aria-label={running ? 'Поточна звірка каталогу' : 'Поточний стан магазину'}>
    {items.map((item) => {
      const value = item.value == null ? '—' : number.format(item.value);
      const description = `${running ? 'Звірка триває' : 'Каталог магазину'} · ${item.label}: ${value}`;
      return <div key={item.key} className={`topbar-catalog-counts__item topbar-catalog-counts__item--${item.key}`}
        role="group" aria-label={`${item.label}: ${value}`} title={description}>
        <small>{item.label}</small><strong>{value}</strong>
      </div>;
    })}
  </div>;
}
