import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Icon } from './Icon';
import '../styles/horoshop-catalog-sync-indicator.css';

function remainingTime(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  return hours > 0 ? `${hours} год ${String(minutes).padStart(2, '0')} хв`
    : `${minutes} хв ${String(rest).padStart(2, '0')} с`;
}

export function HoroshopCatalogSyncIndicator() {
  const [now, setNow] = useState(() => Date.now());
  const sync = useQuery({
    queryKey: ['horoshop-catalog-sync-status'],
    queryFn: ({ signal }) => api.horoshopCatalogSyncStatus(signal),
    refetchInterval: (query) => query.state.data?.status === 'syncing' ? 2_000 : 15_000,
    refetchIntervalInBackground: true,
    refetchOnReconnect: true
  });

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  const data = sync.data;
  const serverOffset = data ? Date.parse(data.serverNow) - sync.dataUpdatedAt : 0;
  const remaining = data?.nextScheduledSyncAt
    ? Date.parse(data.nextScheduledSyncAt) - (now + serverOffset)
    : null;
  const percentage = data?.status === 'syncing' && data.latestRun?.status === 'running'
    ? data.latestRun.progressPercentage : null;

  let description = 'Завантажуємо стан каталогу';
  let detail = 'Хорошоп';
  let state = 'loading';
  if (sync.isError && !data) {
    description = 'Стан каталогу недоступний';
    state = 'error';
  } else if (data && !data.configured) {
    description = 'Магазин не підключено';
    state = 'idle';
  } else if (data?.status === 'syncing') {
    description = `Синхронізація каталогу${percentage === null ? ' триває' : ` · ${percentage}%`}`;
    detail = data.latestRun?.exportItemsTotal
      ? `${data.latestRun.exportItemsReceived} із ${data.latestRun.exportItemsTotal} отримано`
      : 'Хорошоп';
    state = 'running';
  } else if (data?.status === 'error') {
    description = 'Помилка синхронізації';
    detail = 'Очікуємо повторного запуску';
    state = 'error';
  } else if (data?.status === 'disconnecting' || data?.status === 'purge_failed') {
    description = data.status === 'disconnecting' ? 'Відключаємо каталог' : 'Помилка відключення';
    state = data.status === 'disconnecting' ? 'running' : 'error';
  } else if (remaining !== null && Number.isFinite(remaining)) {
    description = remaining > 0
      ? `Автосинхронізація через ${remainingTime(remaining)}`
      : 'Очікуємо запуску синхронізації';
    state = remaining > 0 ? 'scheduled' : 'pending';
  } else if (data?.status === 'connected') {
    description = 'Очікуємо першої синхронізації';
    state = 'pending';
  }

  return <div className={`topbar-catalog-sync is-${state}`} role="status" aria-label={`Каталог Хорошоп: ${description}`} title={`Каталог Хорошоп · ${description}${detail !== 'Хорошоп' ? ` · ${detail}` : ''}`}>
    <span className="topbar-catalog-sync__icon"><Icon name={state === 'running' ? 'refresh' : state === 'error' ? 'alarm' : 'schedule'} size={17} /></span>
    <span className="topbar-catalog-sync__text"><strong>{description}</strong><small>{detail}</small></span>
  </div>;
}
