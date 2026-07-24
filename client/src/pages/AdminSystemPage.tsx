import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import type { IconName } from '../components/Icon';
import { api } from '../lib/api';
import type { SystemDiagnosticIssue, SystemHealthStatus, SystemMetrics, SystemServiceStatus } from '../types/system';

type HistorySample = {
  sampledAt: string;
  cpu: number;
  memory: number;
  process: number;
};

const statusLabels: Record<SystemHealthStatus, string> = {
  operational: 'Працює стабільно',
  degraded: 'Потребує уваги',
  critical: 'Критичний стан',
  inactive: 'Неактивно',
  unknown: 'Стан невідомий'
};

const serviceIcons: Record<SystemServiceStatus['id'], IconName> = {
  api: 'server',
  database: 'storage',
  storage: 'savedBanners',
  'photo-parser': 'catalog',
  backups: 'backup'
};

const diagnosticIcons: Record<SystemDiagnosticIssue['id'], IconName> = {
  cpu: 'memory',
  memory: 'server',
  storage: 'savedBanners',
  database: 'storage',
  api: 'server',
  'photo-parser': 'catalog',
  backups: 'backup'
};

function formatBytes(value: number | null | undefined) {
  if (!value || value < 0) return '—';
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  const digits = unit >= 3 ? 1 : amount >= 10 ? 0 : 1;
  return `${amount.toLocaleString('uk-UA', { maximumFractionDigits: digits })} ${units[unit]}`;
}

function formatDuration(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days) return `${days} д ${hours} год`;
  if (hours) return `${hours} год ${minutes} хв`;
  return `${minutes} хв`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('uk-UA', { dateStyle: 'medium', timeStyle: 'medium' });
}

function statusClass(status: SystemHealthStatus) {
  return `system-status system-status--${status}`;
}

function MetricRing({ value, status }: { value: number; status: SystemHealthStatus }) {
  const percent = Math.min(100, Math.max(0, value));
  const style = { '--system-ring-angle': `${percent * 3.6}deg` } as CSSProperties;
  return <span className={`system-metric-ring system-metric-ring--${status}`} style={style}>
    <strong>{Math.round(percent)}%</strong>
  </span>;
}

function ResourceCard({
  icon,
  label,
  value,
  status,
  title,
  details
}: {
  icon: IconName;
  label: string;
  value?: number;
  status: SystemHealthStatus;
  title: string;
  details: Array<{ label: string; value: string }>;
}) {
  return <article className={`system-resource-card system-resource-card--${status}`}>
    <header>
      <span className="system-resource-card__icon"><Icon name={icon} size={21} /></span>
      <span><small>{label}</small><strong>{title}</strong></span>
      {value === undefined
        ? <span className={statusClass(status)}><i />{statusLabels[status]}</span>
        : <MetricRing value={value} status={status} />}
    </header>
    <dl>
      {details.map((detail) => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}
    </dl>
  </article>;
}

function chartPath(values: number[], width: number, height: number) {
  if (!values.length) return '';
  const y = (value: number) => height - (Math.min(100, Math.max(0, value)) / 100) * height;
  if (values.length === 1) return `M 0 ${y(values[0])} L ${width} ${y(values[0])}`;
  return values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    return `${index ? 'L' : 'M'} ${x} ${y(value)}`;
  }).join(' ');
}

function PerformanceChart({ samples }: { samples: HistorySample[] }) {
  const width = 660;
  const height = 184;
  const cpuPath = chartPath(samples.map((sample) => sample.cpu), width, height);
  const memoryPath = chartPath(samples.map((sample) => sample.memory), width, height);
  const cpuArea = cpuPath ? `${cpuPath} L ${width} ${height} L 0 ${height} Z` : '';
  const memoryArea = memoryPath ? `${memoryPath} L ${width} ${height} L 0 ${height} Z` : '';
  const latest = samples.at(-1);

  return <section className="system-panel system-performance">
    <header className="system-panel__header">
      <div><p className="eyebrow">Live monitoring</p><h2>Навантаження за останні 5 хвилин</h2></div>
      <div className="system-chart-legend">
        <span className="is-cpu"><i />CPU <strong>{Math.round(latest?.cpu || 0)}%</strong></span>
        <span className="is-memory"><i />RAM <strong>{Math.round(latest?.memory || 0)}%</strong></span>
      </div>
    </header>
    <div className="system-chart" role="img" aria-label={`Графік навантаження CPU ${Math.round(latest?.cpu || 0)}% та RAM ${Math.round(latest?.memory || 0)}%`}>
      <div className="system-chart__scale"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="system-cpu-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6d5dfc" stopOpacity=".28" />
            <stop offset="100%" stopColor="#6d5dfc" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="system-memory-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2196f3" stopOpacity=".2" />
            <stop offset="100%" stopColor="#2196f3" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map((value) => <line key={value} x1="0" y1={height - (value / 100) * height} x2={width} y2={height - (value / 100) * height} />)}
        {memoryArea && <path className="system-chart__area is-memory" d={memoryArea} />}
        {cpuArea && <path className="system-chart__area is-cpu" d={cpuArea} />}
        {memoryPath && <path className="system-chart__line is-memory" d={memoryPath} />}
        {cpuPath && <path className="system-chart__line is-cpu" d={cpuPath} />}
      </svg>
      {!samples.length && <span className="system-chart__empty">Очікуємо перший зразок метрик…</span>}
    </div>
    <footer><span>5 хв тому</span><span>Оновлення кожні 5 секунд</span><span>Зараз</span></footer>
  </section>;
}

function ServiceCard({ service }: { service: SystemServiceStatus }) {
  return <article className={`system-service system-service--${service.status}`}>
    <span className="system-service__icon"><Icon name={serviceIcons[service.id]} size={20} /></span>
    <span><strong>{service.label}</strong><small>{service.detail}</small></span>
    <span className={statusClass(service.status)}><i />{statusLabels[service.status]}</span>
  </article>;
}

function DiagnosticsPanel({ issues }: { issues: SystemDiagnosticIssue[] }) {
  if (!issues.length) return null;
  const criticalCount = issues.filter((issue) => issue.status === 'critical').length;
  return <section className={`system-diagnostics${criticalCount ? ' system-diagnostics--critical' : ''}`}>
    <header>
      <span className="system-diagnostics__mark"><Icon name="monitor" size={23} /></span>
      <div>
        <p className="eyebrow">Діагностика</p>
        <h2>{criticalCount ? 'Виявлено критичні проблеми' : 'Що саме потребує уваги'}</h2>
        <p>{issues.length === 1 ? 'Виявлено одну причину попередження.' : `Виявлено причин попередження: ${issues.length}.`}</p>
      </div>
    </header>
    <div className="system-diagnostics__list">
      {issues.map((issue) => <article className={`system-diagnostic system-diagnostic--${issue.status}`} key={issue.id}>
        <span className="system-diagnostic__icon"><Icon name={diagnosticIcons[issue.id]} size={20} /></span>
        <div className="system-diagnostic__content">
          <div className="system-diagnostic__meta">
            <strong>{issue.component}</strong>
            <span className={statusClass(issue.status)}><i />{statusLabels[issue.status]}</span>
          </div>
          <h3>{issue.title}</h3>
          <p>{issue.description}</p>
          <div className="system-diagnostic__recommendation">
            <strong>Що зробити</strong>
            <span>{issue.recommendation}</span>
          </div>
          {issue.action && <Link className="button button--secondary button--small" to={issue.action.href}>
            {issue.action.label}<Icon name="chevronRight" size={15} />
          </Link>}
        </div>
      </article>)}
    </div>
  </section>;
}

function WorkloadCard({ icon, label, value, detail }: { icon: IconName; label: string; value: number; detail: string }) {
  return <article className="system-workload-card">
    <span><Icon name={icon} size={19} /></span>
    <div><small>{label}</small><strong>{value.toLocaleString('uk-UA')}</strong><p>{detail}</p></div>
  </article>;
}

export function AdminSystemPage() {
  const [history, setHistory] = useState<HistorySample[]>([]);
  const metrics = useQuery({
    queryKey: ['admin-system-metrics'],
    queryFn: api.admin.systemMetrics,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    staleTime: 4_000
  });
  const data = metrics.data;

  useEffect(() => {
    if (!data) return;
    setHistory((current) => {
      const sample = {
        sampledAt: data.sampledAt,
        cpu: data.cpu.usagePercent,
        memory: data.memory.usagePercent,
        process: data.cpu.processPercent
      };
      if (current.at(-1)?.sampledAt === sample.sampledAt) return current;
      return [...current, sample].slice(-60);
    });
  }, [data]);

  const runtimeDetails = useMemo(() => data ? [
    { label: 'Інстанс', value: data.runtime.hostname },
    { label: 'ОС', value: `${data.runtime.platform} ${data.runtime.platformRelease} · ${data.runtime.architecture}` },
    { label: 'Node.js', value: data.runtime.nodeVersion },
    { label: 'PID', value: String(data.runtime.processId) },
    { label: 'Event loop', value: `${data.runtime.eventLoopUtilizationPercent}%` },
    { label: 'Збір метрик', value: `${data.runtime.collectionDurationMs} мс` }
  ] : [], [data]);

  return <div className="admin-page system-page">
    <header className="page-heading page-heading--row system-page__heading">
      <div>
        <p className="eyebrow">Панель керування</p>
        <h1>Технічний стан</h1>
        <p>Живий стан сервера, ресурсів, бази даних і фонових процесів робочого простору.</p>
      </div>
      <button className="button button--secondary" type="button" disabled={metrics.isFetching} onClick={() => void metrics.refetch()}>
        <Icon name="refresh" size={17} /> {metrics.isFetching ? 'Оновлення…' : 'Оновити зараз'}
      </button>
    </header>

    {metrics.isLoading && <div className="admin-list-state">Збираємо технічні метрики сервера…</div>}
    {metrics.isError && !data && <div className="admin-list-state admin-list-state--error">
      <span>Не вдалося отримати стан сервера.</span>
      <button className="button button--secondary button--small" type="button" onClick={() => void metrics.refetch()}>Повторити</button>
    </div>}

    {data && <>
      <section className={`system-overview system-overview--${data.status}`}>
        <div className="system-overview__status">
          <span className="system-overview__pulse"><i /></span>
          <div><small>Загальний стан</small><h2>{statusLabels[data.status]}</h2><p>{data.status === 'operational' ? 'Усі критичні компоненти відповідають у штатному режимі.' : data.issues.length ? `Виявлено причин: ${data.issues.length}. Детальна діагностика наведена нижче.` : 'Є показники або компоненти, які потребують перевірки.'}</p></div>
        </div>
        <dl>
          <div><dt>Uptime процесу</dt><dd>{formatDuration(data.runtime.processUptimeSeconds)}</dd></div>
          <div><dt>Uptime сервера</dt><dd>{formatDuration(data.runtime.hostUptimeSeconds)}</dd></div>
          <div><dt>Середовище</dt><dd>{data.runtime.environment}</dd></div>
          <div><dt>Revision</dt><dd title={data.runtime.buildSha}>{data.runtime.buildSha.slice(0, 12)}</dd></div>
          <div><dt>Останній зразок</dt><dd>{formatDateTime(data.sampledAt)}</dd></div>
        </dl>
      </section>

      <DiagnosticsPanel issues={data.issues} />

      <section className="system-resource-grid" aria-label="Ресурси сервера">
        <ResourceCard
          icon="memory"
          label="Процесор"
          value={data.cpu.usagePercent}
          status={data.cpu.status}
          title={`${data.cpu.cores} логічних ядер`}
          details={[
            { label: 'Node.js процес', value: `${data.cpu.processPercent}%` },
            { label: 'Load average 1 / 5 / 15', value: data.cpu.loadAverage.map((value) => value.toLocaleString('uk-UA')).join(' · ') },
            { label: 'Модель', value: data.cpu.model }
          ]}
        />
        <ResourceCard
          icon="server"
          label="Оперативна пам’ять"
          value={data.memory.usagePercent}
          status={data.memory.status}
          title={`${formatBytes(data.memory.usedBytes)} із ${formatBytes(data.memory.totalBytes)}`}
          details={[
            { label: 'Вільно', value: formatBytes(data.memory.freeBytes) },
            { label: 'Node.js RSS', value: formatBytes(data.memory.process.rssBytes) },
            { label: 'Heap', value: `${formatBytes(data.memory.process.heapUsedBytes)} / ${formatBytes(data.memory.process.heapTotalBytes)}` }
          ]}
        />
        <ResourceCard
          icon="storage"
          label="Файлове сховище"
          value={data.storage.usagePercent}
          status={data.storage.status}
          title={data.storage.writable ? `${formatBytes(data.storage.usedBytes)} із ${formatBytes(data.storage.totalBytes)}` : 'Запис недоступний'}
          details={[
            { label: 'Вільно', value: formatBytes(data.storage.freeBytes) },
            { label: 'Тип', value: data.storage.persistent ? 'Постійний том' : 'Локальне сховище' },
            { label: 'Доступ', value: data.storage.writable ? 'Читання та запис' : 'Недоступний' }
          ]}
        />
        <ResourceCard
          icon="storage"
          label="База даних"
          status={data.database.status}
          title={data.database.status === 'critical' ? 'Немає з’єднання' : `${data.database.latencyMs} мс`}
          details={[
            { label: 'Розмір', value: formatBytes(data.database.sizeBytes) },
            { label: 'Пул з’єднань', value: `${data.database.pool.total} всього · ${data.database.pool.idle} вільно` },
            { label: 'Очікують', value: String(data.database.pool.waiting) }
          ]}
        />
      </section>

      <div className="system-content-grid">
        <PerformanceChart samples={history} />
        <section className="system-panel system-runtime">
          <header className="system-panel__header"><div><p className="eyebrow">Runtime</p><h2>Поточний інстанс</h2></div><Icon name="server" size={24} /></header>
          <dl>{runtimeDetails.map((detail) => <div key={detail.label}><dt>{detail.label}</dt><dd title={detail.value}>{detail.value}</dd></div>)}</dl>
          {data.database.latestMigration && <footer><span>Схема БД</span><strong>{data.database.latestMigration}</strong></footer>}
        </section>
      </div>

      <section className="system-panel system-services">
        <header className="system-panel__header">
          <div><p className="eyebrow">Компоненти</p><h2>Стан сервісів</h2><p>Окремі перевірки критичних частин робочого простору.</p></div>
          <div className="system-status-legend" aria-label="Можливі стани">
            {(['operational', 'degraded', 'critical', 'inactive', 'unknown'] as SystemHealthStatus[]).map((status) => <span className={statusClass(status)} key={status}><i />{statusLabels[status]}</span>)}
          </div>
        </header>
        <div className="system-service-grid">{data.services.map((service) => <ServiceCard service={service} key={service.id} />)}</div>
      </section>

      <section className="system-workload">
        <header><div><p className="eyebrow">Робочий простір</p><h2>Поточне навантаження</h2></div><span>Операційні лічильники</span></header>
        <div>
          <WorkloadCard icon="users" label="Активні користувачі" value={data.workload.approvedUsers} detail="Схвалені облікові записи" />
          <WorkloadCard icon="tasks" label="Активні справи" value={data.workload.activeTasks} detail="Ще не завершені й не скасовані" />
          <WorkloadCard icon="publication" label="Відкриті заявки" value={data.workload.openApplications} detail="Нові або вже в обробці" />
          <WorkloadCard icon="catalog" label="Черга парсера" value={data.workload.photoParser.queued + data.workload.photoParser.running} detail={`${data.workload.photoParser.failedLast24Hours} помилок за 24 години`} />
        </div>
        <footer>
          <span><Icon name="backup" size={16} /> Автобекап: <strong>{data.workload.backups.automaticEnabled ? 'увімкнено' : 'вимкнено'}</strong></span>
          <span>Наступний запуск: <strong>{formatDateTime(data.workload.backups.nextRunAt)}</strong></span>
          <span>Останній успішний стан: <strong>{data.workload.backups.latestStatus === 'success' ? formatDateTime(data.workload.backups.latestCompletedAt) : '—'}</strong></span>
        </footer>
      </section>
    </>}
  </div>;
}
