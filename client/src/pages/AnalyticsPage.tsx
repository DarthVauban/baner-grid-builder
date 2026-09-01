import { useMemo, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';
import { api } from '../lib/api';
import type { AnalyticsPeriod, PopupBannerAnalytics, ProductSelectionAnalytics } from '../types/analytics';
import './AnalyticsPage.css';

type AnalyticsTool = 'product-selections' | 'popup-banners';
type SeriesDatum = { date: string } & Record<string, string | number>;

const numberFormat = new Intl.NumberFormat('uk-UA');
const compactFormat = new Intl.NumberFormat('uk-UA', { notation: 'compact', maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: 'short' });

function percent(value: number) {
  return `${new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 }).format(value * 100)}%`;
}

function pageLabel(value: string) {
  try {
    const parsed = new URL(value);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return value;
  }
}

function TrendChart({ data, lines }: {
  data: SeriesDatum[];
  lines: Array<{ key: string; label: string; color: string }>;
}) {
  const width = 820;
  const height = 260;
  const plot = { left: 44, right: 18, top: 18, bottom: 34 };
  const maximum = Math.max(1, ...data.flatMap((item) => lines.map((line) => Number(item[line.key] || 0))));
  const points = (key: string) => data.map((item, index) => {
    const x = plot.left + (data.length <= 1 ? 0 : index / (data.length - 1)) * (width - plot.left - plot.right);
    const y = plot.top + (1 - Number(item[key] || 0) / maximum) * (height - plot.top - plot.bottom);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  const ticks = data.length ? [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])] : [];
  return <div className="analytics-chart">
    <div className="analytics-chart__legend">
      {lines.map((line) => <span key={line.key}><i style={{ background: line.color }} />{line.label}</span>)}
    </div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Динаміка показників за вибраний період">
      {[0, 0.25, 0.5, 0.75, 1].map((step) => {
        const y = plot.top + step * (height - plot.top - plot.bottom);
        return <g key={step}><line x1={plot.left} x2={width - plot.right} y1={y} y2={y} /><text x={plot.left - 10} y={y + 4}>{compactFormat.format(maximum * (1 - step))}</text></g>;
      })}
      {lines.map((line) => <polyline key={line.key} points={points(line.key)} style={{ stroke: line.color }} />)}
      {ticks.map((index) => <text className="analytics-chart__date" key={`${data[index]?.date}-${index}`} x={plot.left + (data.length <= 1 ? 0 : index / (data.length - 1)) * (width - plot.left - plot.right)} y={height - 8}>{data[index]?.date ? dateFormat.format(new Date(`${data[index].date}T00:00:00Z`)) : ''}</text>)}
    </svg>
  </div>;
}

function DonutChart({ items, centerLabel }: { items: Array<{ label: string; value: number; color: string }>; centerLabel: string }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const stops = items.map((item) => {
    const start = total ? cursor / total * 360 : cursor;
    cursor += item.value;
    const end = total ? cursor / total * 360 : cursor;
    return `${item.color} ${start}deg ${end}deg`;
  });
  const style = { '--analytics-donut': total ? `conic-gradient(${stops.join(',')})` : 'conic-gradient(#e9edf4 0 360deg)' } as CSSProperties;
  return <div className="analytics-donut-layout">
    <div className="analytics-donut" style={style}><span><strong>{numberFormat.format(total)}</strong><small>{centerLabel}</small></span></div>
    <div className="analytics-donut-legend">
      {items.map((item) => <div key={item.label}><span><i style={{ background: item.color }} />{item.label}</span><strong>{numberFormat.format(item.value)}</strong></div>)}
    </div>
  </div>;
}

function MetricCard({ label, value, note, tone = 'violet' }: { label: string; value: string; note: string; tone?: string }) {
  return <article className={`analytics-metric is-${tone}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{note}</small>
  </article>;
}

function Panel({ title, description, children, className = '' }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return <section className={`analytics-panel ${className}`}>
    <header><div><h2>{title}</h2>{description && <p>{description}</p>}</div></header>
    {children}
  </section>;
}

function EmptyData() {
  return <div className="analytics-empty"><span><Icon name="analytics" size={28} /></span><strong>Даних за цей період ще немає</strong><p>Події з’являться після переглядів та взаємодій покупців на сайті.</p></div>;
}

function ToolTile({ tool, title, description, icon, color, available, active, summary }: {
  tool: AnalyticsTool;
  title: string;
  description: string;
  icon: IconName;
  color: string;
  available: boolean;
  active: boolean;
  summary: string;
}) {
  const content = <>
    <span className="analytics-tool-tile__icon" style={{ '--analytics-tool-color': color } as CSSProperties}><Icon name={icon} size={21} /></span>
    <span className="analytics-tool-tile__copy"><strong>{title}</strong><small>{description}</small></span>
    <span className="analytics-tool-tile__summary">{summary}</span>
    <Icon name="arrow" size={18} />
  </>;
  return available
    ? <Link className={`analytics-tool-tile${active ? ' is-active' : ''}`} to={`/analytics/${tool}`}>{content}</Link>
    : <div className="analytics-tool-tile is-disabled" aria-disabled="true">{content}</div>;
}

function Filters({ period, setPeriod, value, setValue, options, label }: {
  period: AnalyticsPeriod;
  setPeriod: (value: AnalyticsPeriod) => void;
  value: string;
  setValue: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  label: string;
}) {
  return <div className="analytics-filters">
    <div className="analytics-period" role="group" aria-label="Період аналітики">
      {([7, 30, 90] as AnalyticsPeriod[]).map((item) => <button type="button" className={period === item ? 'is-active' : ''} onClick={() => setPeriod(item)} key={item}>{item} днів</button>)}
    </div>
    <div className="analytics-filter-field">
      <span>{label}</span>
      <StyledSelect
        value={value}
        options={[{ value: '', label: 'Усі' }, ...options]}
        onChange={setValue}
        ariaLabel={label}
        compact
      />
    </div>
  </div>;
}

function ProductSelectionDashboard({ data }: { data: ProductSelectionAnalytics }) {
  const funnel = [
    ['Побачили блок', data.totals.impressions],
    ['Побачили товар', data.totals.productImpressions],
    ['Перейшли до товару', data.totals.productClicks],
    ['Натиснули «Купити»', data.totals.buyClicks],
    ['Додали у кошик', data.totals.addToCart + data.totals.alreadyInCart]
  ] as Array<[string, number]>;
  const funnelMax = Math.max(1, ...funnel.map((item) => item[1]));
  const hasData = Object.values(data.totals).some((value) => Number(value) > 0);
  return <>
    <div className="analytics-metrics">
      <MetricCard label="Покази вибірки" value={numberFormat.format(data.totals.impressions)} note={`${numberFormat.format(data.totals.uniqueVisitors)} унікальних відвідувачів`} />
      <MetricCard label="CTR карток" value={percent(data.totals.clickThroughRate)} note={`${numberFormat.format(data.totals.productClicks)} переходів`} tone="blue" />
      <MetricCard label="Додавання в кошик" value={numberFormat.format(data.totals.addToCart + data.totals.alreadyInCart)} note={`Конверсія ${percent(data.totals.cartRate)}`} tone="green" />
      <MetricCard label="Помилки кошика" value={numberFormat.format(data.totals.errors)} note="Окремий технічний сигнал" tone={data.totals.errors ? 'red' : 'slate'} />
    </div>
    {!hasData ? <EmptyData /> : <>
      <div className="analytics-grid analytics-grid--hero">
        <Panel title="Динаміка вибірок" description="Покази, переходи та додавання у кошик за днями" className="analytics-panel--wide">
          <TrendChart data={data.series} lines={[
            { key: 'impression', label: 'Покази', color: '#7765f5' },
            { key: 'product_click', label: 'Переходи', color: '#3182f6' },
            { key: 'add_to_cart', label: 'У кошик', color: '#16a36a' }
          ]} />
        </Panel>
        <Panel title="Пристрої" description="Де покупці взаємодіють з вибірками">
          <DonutChart centerLabel="подій" items={[
            { label: 'Комп’ютер', value: data.surfaces.find((item) => item.surface === 'desktop')?.count || 0, color: '#7765f5' },
            { label: 'Мобільний', value: data.surfaces.find((item) => item.surface === 'mobile')?.count || 0, color: '#36b6a6' }
          ]} />
        </Panel>
      </div>
      <Panel title="Воронка взаємодії" description="На якому етапі покупці залишають сценарій">
        <div className="analytics-funnel">{funnel.map(([label, value], index) => <div key={label}>
          <span>{index + 1}</span><strong>{label}</strong><div><i style={{ width: `${Math.max(4, value / funnelMax * 100)}%` }} /></div><b>{numberFormat.format(value)}</b>
        </div>)}</div>
      </Panel>
      <div className="analytics-grid analytics-grid--tables">
        <Panel title="Товари" description="Ефективність кожної картки">
          <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Товар</th><th>Покази</th><th>Переходи</th><th>У кошик</th><th>CTR</th></tr></thead><tbody>
            {data.products.slice(0, 12).map((item) => { const views = item.product_impression || 0; const clicks = item.product_click || 0; const carts = (item.add_to_cart || 0) + (item.already_in_cart || 0); return <tr key={`${item.productExternalId}:${item.modificationExternalId || ''}`}><td><span className="analytics-product"><span>{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <Icon name="productSelection" size={17} />}</span><span><strong>{item.title}</strong><small>{item.sku}</small></span></span></td><td>{numberFormat.format(views)}</td><td>{numberFormat.format(clicks)}</td><td>{numberFormat.format(carts)}</td><td>{percent(views ? clicks / views : 0)}</td></tr>; })}
          </tbody></table>{!data.products.length && <p className="analytics-table-empty">Немає товарних взаємодій.</p>}</div>
        </Panel>
        <Panel title="Сторінки розміщення" description="Де вибірки отримують найбільше уваги">
          <div className="analytics-page-list">{data.pages.map((item) => <article key={item.pageUrl}><span><strong title={item.pageUrl}>{pageLabel(item.pageUrl)}</strong><small>{numberFormat.format(item.impression || 0)} показів</small></span><b>{numberFormat.format(item.product_click || 0)} <small>переходів</small></b></article>)}{!data.pages.length && <p className="analytics-table-empty">Сторінки ще не зафіксовані.</p>}</div>
        </Panel>
      </div>
    </>}
  </>;
}

function PopupDashboard({ data }: { data: PopupBannerAnalytics }) {
  const hasData = Object.values(data.totals).some((value) => Number(value) > 0);
  return <>
    <div className="analytics-metrics">
      <MetricCard label="Покази попапів" value={numberFormat.format(data.totals.impressions)} note={`${numberFormat.format(data.totals.uniqueVisitors)} унікальних відвідувачів`} />
      <MetricCard label="Взаємодія" value={percent(data.totals.engagementRate)} note={`${numberFormat.format(data.totals.clicks + data.totals.acknowledgements)} цільових дій`} tone="blue" />
      <MetricCard label="Переходи" value={numberFormat.format(data.totals.clicks)} note="Кліки по кнопках і товарах" tone="green" />
      <MetricCard label="Закриття" value={percent(data.totals.dismissRate)} note={`${numberFormat.format(data.totals.dismissals)} закриттів`} tone="amber" />
    </div>
    {!hasData ? <EmptyData /> : <>
      <div className="analytics-grid analytics-grid--hero">
        <Panel title="Динаміка кампаній" description="Покази та дії покупців за днями" className="analytics-panel--wide">
          <TrendChart data={data.series} lines={[
            { key: 'impression', label: 'Покази', color: '#7765f5' },
            { key: 'click', label: 'Переходи', color: '#3182f6' },
            { key: 'acknowledge', label: 'Підтвердження', color: '#16a36a' },
            { key: 'dismiss', label: 'Закриття', color: '#ec8f39' }
          ]} />
        </Panel>
        <Panel title="Розподіл дій" description="Співвідношення реакцій на попап">
          <DonutChart centerLabel="дій" items={[
            { label: 'Переходи', value: data.totals.clicks, color: '#3182f6' },
            { label: 'Підтвердження', value: data.totals.acknowledgements, color: '#16a36a' },
            { label: 'Закриття', value: data.totals.dismissals, color: '#ec8f39' }
          ]} />
        </Panel>
      </div>
      <div className="analytics-grid analytics-grid--tables">
        <Panel title="Кампанії" description="Порівняння ефективності попапів">
          <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Кампанія</th><th>Покази</th><th>Переходи</th><th>Закриття</th><th>Взаємодія</th></tr></thead><tbody>
            {data.campaigns.map((item) => { const views = item.impression || 0; const actions = (item.click || 0) + (item.acknowledge || 0); return <tr key={item.id}><td><span className="analytics-campaign"><i className={`is-${item.status}`} /><span><strong>{item.name}</strong><small>{item.status === 'active' ? 'Активна' : item.status === 'paused' ? 'Призупинена' : 'Чернетка'}</small></span></span></td><td>{numberFormat.format(views)}</td><td>{numberFormat.format(item.click || 0)}</td><td>{numberFormat.format(item.dismiss || 0)}</td><td>{percent(views ? actions / views : 0)}</td></tr>; })}
          </tbody></table></div>
        </Panel>
        <Panel title="Сторінки показу" description="Де кампанії отримують реакції">
          <div className="analytics-page-list">{data.pages.map((item) => <article key={item.pageUrl}><span><strong title={item.pageUrl}>{pageLabel(item.pageUrl)}</strong><small>{numberFormat.format(item.impression || 0)} показів</small></span><b>{numberFormat.format((item.click || 0) + (item.acknowledge || 0))} <small>дій</small></b></article>)}{!data.pages.length && <p className="analytics-table-empty">Сторінки ще не зафіксовані.</p>}</div>
        </Panel>
      </div>
    </>}
  </>;
}

export function AnalyticsPage() {
  const params = useParams<{ tool?: string }>();
  const navigate = useNavigate();
  const selectedTool = (params.tool === 'product-selections' || params.tool === 'popup-banners') ? params.tool : null;
  const [period, setPeriod] = useState<AnalyticsPeriod>(30);
  const [selectionId, setSelectionId] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const entityId = selectedTool === 'product-selections' ? selectionId : selectedTool === 'popup-banners' ? campaignId : '';
  const activeSelectionId = selectedTool === 'product-selections' ? selectionId : '';
  const activeCampaignId = selectedTool === 'popup-banners' ? campaignId : '';
  const access = useQuery({ queryKey: ['tool-access'], queryFn: ({ signal }) => api.users.toolAccess(signal) });
  const hasSelections = access.data?.includes('product_selection') === true;
  const hasPopups = access.data?.includes('popup_banners') === true;
  const selectionAnalytics = useQuery({
    queryKey: ['analytics', 'product-selections', period, activeSelectionId],
    queryFn: ({ signal }) => api.productSelections.analytics({ days: period, selectionId: activeSelectionId }, signal),
    enabled: hasSelections
  });
  const popupAnalytics = useQuery({
    queryKey: ['analytics', 'popup-banners', period, activeCampaignId],
    queryFn: ({ signal }) => api.popupBanners.analytics({ days: period, campaignId: activeCampaignId }, signal),
    enabled: hasPopups
  });
  const currentLoading = selectedTool === 'product-selections' ? selectionAnalytics.isLoading : selectedTool === 'popup-banners' ? popupAnalytics.isLoading : false;
  const currentError = selectedTool === 'product-selections' ? selectionAnalytics.isError : selectedTool === 'popup-banners' ? popupAnalytics.isError : false;
  const tools = useMemo(() => [
    {
      tool: 'product-selections' as const, title: 'Вибірки товарів', icon: 'productSelection' as const,
      description: 'Видимість карток, переходи та кошик', available: hasSelections, color: '#7765f5',
      summary: selectionAnalytics.data ? `${compactFormat.format(selectionAnalytics.data.totals.impressions)} показів` : 'Аналітика воронки'
    },
    {
      tool: 'popup-banners' as const, title: 'Попап-банери', icon: 'popup' as const,
      description: 'Покази, реакції та ефективність кампаній', available: hasPopups, color: '#f29f46',
      summary: popupAnalytics.data ? `${compactFormat.format(popupAnalytics.data.totals.impressions)} показів` : 'Аналітика кампаній'
    }
  ], [hasPopups, hasSelections, popupAnalytics.data, selectionAnalytics.data]);

  const unavailable = access.isSuccess && selectedTool && !tools.some((item) => item.tool === selectedTool && item.available);
  const entityOptions = selectedTool === 'product-selections'
    ? (selectionAnalytics.data?.selections || []).map((item) => ({ value: item.id, label: item.name }))
    : (popupAnalytics.data?.campaigns || []).map((item) => ({ value: item.id, label: item.name }));

  function choosePeriod(value: AnalyticsPeriod) {
    setPeriod(value);
  }

  function chooseEntity(value: string) {
    if (selectedTool === 'product-selections') setSelectionId(value);
    if (selectedTool === 'popup-banners') setCampaignId(value);
  }

  return <div className="analytics-page">
    <header className="analytics-header">
      <div><p className="eyebrow">Єдина точка звітності</p><h1>Аналітика</h1><p>{selectedTool ? 'Детально переглядайте результативність інструмента без зайвих налаштувань конструктора.' : 'Оберіть інструмент, щоб перейти до його показників, графіків і детальних зрізів.'}</p></div>
      {selectedTool && <button className="button button--secondary button--small" type="button" onClick={() => navigate('/analytics')}><Icon name="arrowLeft" size={17} /> Усі інструменти</button>}
    </header>

    <nav className="analytics-tool-switcher" aria-label="Інструменти з аналітикою">
      {tools.map((item) => <ToolTile key={item.tool} {...item} active={selectedTool === item.tool} />)}
    </nav>

    {!selectedTool && <section className="analytics-welcome">
      <span><Icon name="analytics" size={30} /></span><div><h2>Дані зібрані в окремих дашбордах</h2><p>Конструктори залишаються компактними, а тут можна порівнювати динаміку, воронки, товари, кампанії та сторінки розміщення.</p></div>
    </section>}

    {unavailable && <div className="analytics-error"><strong>Цей дашборд недоступний</strong><p>У вашого облікового запису немає доступу до відповідного інструмента.</p><Link to="/analytics">Повернутися до доступної аналітики</Link></div>}

    {selectedTool && !unavailable && <>
      <Filters period={period} setPeriod={choosePeriod} value={entityId} setValue={chooseEntity} options={entityOptions} label={selectedTool === 'product-selections' ? 'Вибірка' : 'Кампанія'} />
      {currentLoading && <div className="analytics-loading"><span /><strong>Збираємо показники…</strong></div>}
      {currentError && <div className="analytics-error"><strong>Не вдалося завантажити аналітику</strong><p>Спробуйте оновити сторінку або змінити період.</p></div>}
      {!currentLoading && !currentError && selectedTool === 'product-selections' && selectionAnalytics.data && <ProductSelectionDashboard data={selectionAnalytics.data} />}
      {!currentLoading && !currentError && selectedTool === 'popup-banners' && popupAnalytics.data && <PopupDashboard data={popupAnalytics.data} />}
    </>}
  </div>;
}
