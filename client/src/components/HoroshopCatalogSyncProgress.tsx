import type { HoroshopIntegration } from '../types/integration';
import '../styles/horoshop-catalog-sync-progress.css';

export function HoroshopCatalogSyncProgress({ integration }: { integration: HoroshopIntegration }) {
  const run = integration.latestRun;
  const running = integration.status === 'syncing' || run?.status === 'running';
  const failed = integration.status === 'error' || run?.status === 'failed';
  const percentage = running ? run?.progressPercentage : failed ? run?.progressPercentage : 100;
  const indeterminate = running && (percentage === null || percentage === undefined);

  return <section className={`horoshop-catalog-sync-progress${running ? ' is-running' : ''}${failed ? ' is-failed' : ' is-complete'}`}
    aria-label="Синхронізація каталогу Хорошоп" aria-live="polite">
    <header>
      <div>
        <strong>{running ? 'Синхронізуємо каталог з Хорошопом' : failed ? 'Синхронізацію не завершено' : 'Каталог синхронізовано'}</strong>
        <span>{running ? 'Отримуємо актуальні товари, модифікації та фотографії' : failed
          ? (run?.errorMessage || integration.lastError || 'Спробуйте запустити ще раз.')
          : `Останнє оновлення: ${integration.lastSyncAt ? new Date(integration.lastSyncAt).toLocaleString('uk-UA') : 'щойно'}`}</span>
      </div>
      <b>{percentage === null || percentage === undefined ? (running ? 'Триває' : failed ? 'Помилка' : 'Готово') : `${percentage}%`}</b>
    </header>
    <div className={`horoshop-catalog-sync-progress__track${indeterminate ? ' is-indeterminate' : ''}`}>
      <span style={{ width: percentage === null || percentage === undefined ? '38%' : `${percentage}%` }} />
    </div>
    <footer>
      <span>Отримано: {run?.exportItemsReceived || 0}{run?.exportItemsTotal ? ` із ${run.exportItemsTotal}` : ''}</span>
      <span>Сторінок: {run?.pagesReceived || 0}</span>
      <span>Розділів: {run?.categoriesReceived || 0}</span>
      <span>Товарів: {run?.productsReceived || 0}</span>
      <span>Модифікацій: {run?.modificationsReceived || 0}</span>
    </footer>
  </section>;
}
