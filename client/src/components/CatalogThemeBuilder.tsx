import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { StyledSelect } from './StyledSelect';
import { productCardThemeStyle, storefrontThemeStyle } from '../lib/storefront-theme';
import type {
  CatalogProductCardContentKey,
  CatalogProductCardTheme,
  CatalogStorefrontTheme
} from '../types/catalog';

export type CatalogThemeDevice = 'desktop' | 'tablet' | 'mobile';

export function ThemeSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="catalog-theme-section">
    <header>
      <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
    </header>
    <div className="catalog-theme-section__controls">{children}</div>
  </section>;
}

export function ThemeColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="catalog-theme-color">
    <span>{label}</span>
    <span className="catalog-theme-color__control">
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(event) => onChange(event.target.value)} />
      <input value={value} maxLength={7} onChange={(event) => {
        const next = event.target.value;
        if (/^#[0-9a-f]{0,6}$/i.test(next)) onChange(next);
      }} onBlur={() => { if (!/^#[0-9a-f]{6}$/i.test(value)) onChange('#000000'); }} />
    </span>
  </label>;
}

export function ThemeRangeField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = 'px',
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return <label className="catalog-theme-range">
    <span><span>{label}</span><b>{value}{suffix}</b></span>
    <span className="catalog-theme-range__control">
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
      <input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value) || min)))} />
    </span>
  </label>;
}

export function ThemeTextField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return <label className="field catalog-theme-text"><span>{label}</span><input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function ThemeSelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return <label className="field catalog-theme-select"><span>{label}</span><StyledSelect value={value} options={options} onChange={(next) => onChange(String(next))} /></label>;
}

export function ThemeToggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="catalog-theme-toggle">
    <span><strong>{label}</strong>{description && <small>{description}</small>}</span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
  </label>;
}

export function CatalogThemeDeviceSwitch({ device, onChange }: { device: CatalogThemeDevice; onChange: (device: CatalogThemeDevice) => void }) {
  const devices: Array<{ value: CatalogThemeDevice; label: string; icon: 'fullscreen' | 'productTables' | 'phone' }> = [
    { value: 'desktop', label: 'Desktop', icon: 'fullscreen' },
    { value: 'tablet', label: 'Tablet', icon: 'productTables' },
    { value: 'mobile', label: 'Mobile', icon: 'phone' }
  ];
  return <div className="catalog-theme-devices" role="group" aria-label="Розмір preview">
    {devices.map((item) => <button className={device === item.value ? 'active' : ''} type="button" onClick={() => onChange(item.value)} key={item.value}>
      <Icon name={item.icon} size={15} /> {item.label}
    </button>)}
  </div>;
}

const previewCardOrderLabels: Record<CatalogProductCardContentKey, ReactNode> = {
  image: <span className="storefront-product-image catalog-theme-preview__image"><span className="catalog-theme-preview__phone" /></span>,
  badge: <span className="storefront-card__badge">Вживаний</span>,
  brand: <span className="storefront-card__brand">Apple</span>,
  title: <strong>Смартфон Apple iPhone 15 Pro 256GB Black</strong>,
  meta: <small>SM-000125 · В наявності</small>
};

function ThemePreviewCard({ theme, index }: { theme: CatalogProductCardTheme; index: number }) {
  const modificationsClass = `storefront-card--modifications-${theme.modifications.mode}`;
  return <article className={`storefront-card catalog-theme-preview__card ${modificationsClass}`}>
    <div className="storefront-card__body">
      {theme.contentOrder.map((key) => theme.visibility[key] ? <span className={`catalog-theme-preview__part catalog-theme-preview__part--${key}`} key={key}>{previewCardOrderLabels[key]}</span> : null)}
    </div>
    {(theme.visibility.price || theme.visibility.button) && <div className={`storefront-card__purchase${theme.button.fullWidth ? ' storefront-card__purchase--stacked' : ''}`}>
      {theme.visibility.price && <b>{index % 2 ? '21 499 грн' : '35 999 грн'}</b>}
      {theme.visibility.button && <button className="storefront-card__buy" type="button">{theme.button.label}</button>}
    </div>}
    {theme.visibility.modifications && theme.modifications.mode !== 'hidden' && <div className="storefront-card__hover">
      {theme.visibility.availability && <span className="storefront-card__availability">В наявності</span>}
      <div className="storefront-card-modification">
        <span className="storefront-card-modification__label">Колір</span>
        <div className="storefront-card-modification__options storefront-card-modification__options--swatches">
          <button className="storefront-card-modification__option storefront-card-modification__option--swatch storefront-card-modification__option--active" type="button"><span className="storefront-card-modification__swatch" style={{ background: '#1f2937' }} /></button>
          <button className="storefront-card-modification__option storefront-card-modification__option--swatch" type="button"><span className="storefront-card-modification__swatch" style={{ background: '#93c5fd' }} /></button>
        </div>
      </div>
    </div>}
  </article>;
}

export function CatalogThemePreview({
  storefrontTheme,
  cardTheme,
  device,
  cardOnly = false
}: {
  storefrontTheme: CatalogStorefrontTheme;
  cardTheme: CatalogProductCardTheme;
  device: CatalogThemeDevice;
  cardOnly?: boolean;
}) {
  const style = { ...storefrontThemeStyle(storefrontTheme), ...productCardThemeStyle(cardTheme) };
  if (cardOnly) {
    return <div className={`catalog-theme-preview catalog-theme-preview--${device} catalog-theme-preview--card`}>
      <div className="catalog-theme-preview__viewport">
        <div className="storefront-page catalog-theme-preview__page" style={style} onClickCapture={(event) => event.preventDefault()}>
          <div className="storefront-grid catalog-theme-preview__card-grid"><ThemePreviewCard theme={cardTheme} index={0} /></div>
        </div>
      </div>
    </div>;
  }

  return <div className={`catalog-theme-preview catalog-theme-preview--${device}`}>
    <div className="catalog-theme-preview__viewport">
      <div className="storefront-page catalog-theme-preview__page" style={style} onClickCapture={(event) => event.preventDefault()}>
        <header className="storefront-header">
          <span className="storefront-brand"><span>{storefrontTheme.header.brandMark}</span><strong>{storefrontTheme.header.brandText}</strong></span>
          <button className="button button--secondary button--small storefront-header__action" type="button">У робочий простір</button>
        </header>
        <section className="storefront-catalog">
          <div className="storefront-hero">
            <p className="eyebrow">{storefrontTheme.hero.eyebrowText}</p>
            <h1>{storefrontTheme.hero.title}</h1>
            {storefrontTheme.hero.subtitle && <p className="storefront-hero__subtitle">{storefrontTheme.hero.subtitle}</p>}
          </div>
          <div className="storefront-controls">
            <label className="field"><span>Пошук</span><input readOnly placeholder={storefrontTheme.controls.searchPlaceholder} /></label>
            <button className="custom-select__button catalog-theme-preview__sort" type="button">Нові оновлення</button>
          </div>
          <div className="storefront-catalog__layout">
            <aside className="storefront-filter-panel">
              <header><h2>Фільтри</h2></header>
              <section className="storefront-filter-group"><h3>Бренд</h3><label className="storefront-filter-option"><input type="radio" checked readOnly /><span>Усі бренди</span><small>12</small></label><label className="storefront-filter-option"><input type="radio" readOnly /><span>Apple</span><small>7</small></label></section>
            </aside>
            <div className="storefront-grid">
              {[0, 1, 2, 3].map((index) => <ThemePreviewCard theme={cardTheme} index={index} key={index} />)}
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>;
}
