import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from './Icon';
import { StyledSelect } from './StyledSelect';
import { productCardThemeStyle, productPageThemeStyle, storefrontThemeStyle } from '../lib/storefront-theme';
import type {
  CatalogProductCardContentKey,
  CatalogProductCardTheme,
  CatalogProductPageTheme,
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
  const [draftValue, setDraftValue] = useState(String(value));
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) setDraftValue(String(value));
  }, [isEditing, value]);

  function commitDraft() {
    const parsed = Number(draftValue);
    if (!draftValue.trim() || !Number.isFinite(parsed)) {
      setDraftValue(String(value));
      return;
    }
    const next = Math.max(min, Math.min(max, parsed));
    setDraftValue(String(next));
    if (next !== value) onChange(next);
  }

  return <label className="catalog-theme-range">
    <span><span>{label}</span><b>{value}{suffix}</b></span>
    <span className="catalog-theme-range__control">
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
      <input
        type="number"
        value={draftValue}
        min={min}
        max={max}
        step={step}
        onFocus={() => setIsEditing(true)}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraftValue(nextDraft);
          const parsed = Number(nextDraft);
          if (nextDraft.trim() && Number.isFinite(parsed) && parsed >= min && parsed <= max && parsed !== value) {
            onChange(parsed);
          }
        }}
        onBlur={() => {
          commitDraft();
          setIsEditing(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setDraftValue(String(value));
            event.currentTarget.blur();
          }
        }}
      />
    </span>
  </label>;
}

function StorefrontBrandPreview({ theme }: { theme: CatalogStorefrontTheme }) {
  return <span className="storefront-brand">
    {theme.header.logoUrl
      ? <img className="storefront-brand__logo" src={theme.header.logoUrl} alt="" />
      : <span>{theme.header.brandMark}</span>}
    {theme.header.brandText && <strong>{theme.header.brandText}</strong>}
  </span>;
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

function ScaledThemePreview({
  children,
  className,
  device,
  style,
  cardOnly = false
}: {
  children: ReactNode;
  className: string;
  device: CatalogThemeDevice;
  style: CSSProperties;
  cardOnly?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const logicalWidth = cardOnly
    ? ({ desktop: 430, tablet: 380, mobile: 310 } as const)[device]
    : ({ desktop: 1366, tablet: 768, mobile: 390 } as const)[device];
  const minimumHeight = cardOnly ? 570 : device === 'mobile' ? 980 : 760;
  const [scale, setScale] = useState(device === 'desktop' && !cardOnly ? 0.5 : 1);
  const [contentHeight, setContentHeight] = useState(minimumHeight);

  useEffect(() => {
    const viewport = viewportRef.current;
    const page = pageRef.current;
    if (!viewport || !page) return undefined;

    const measure = () => {
      const viewportStyles = window.getComputedStyle(viewport);
      const horizontalPadding = Number.parseFloat(viewportStyles.paddingLeft) + Number.parseFloat(viewportStyles.paddingRight);
      const availableWidth = Math.max(1, viewport.clientWidth - horizontalPadding);
      setScale(Math.min(1, availableWidth / logicalWidth));
      setContentHeight(Math.max(minimumHeight, page.scrollHeight));
    };

    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(page);
    return () => observer.disconnect();
  }, [cardOnly, device, logicalWidth, minimumHeight]);

  const frameStyle = {
    width: `${logicalWidth * scale}px`,
    height: `${contentHeight * scale}px`
  };
  const pageStyle = {
    ...style,
    width: `${logicalWidth}px`,
    minHeight: `${minimumHeight}px`,
    transform: `scale(${scale})`
  };

  return <div className={className}>
    <div className="catalog-theme-preview__viewport" ref={viewportRef}>
      <div className="catalog-theme-preview__scale-frame" style={frameStyle}>
        <div className="storefront-page catalog-theme-preview__page" style={pageStyle} ref={pageRef} onClickCapture={(event) => event.preventDefault()}>
          {children}
        </div>
      </div>
    </div>
  </div>;
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
    return <ScaledThemePreview
      className={`catalog-theme-preview catalog-theme-preview--${device} catalog-theme-preview--card`}
      device={device}
      style={style}
      cardOnly
    >
      <div className="storefront-grid catalog-theme-preview__card-grid"><ThemePreviewCard theme={cardTheme} index={0} /></div>
    </ScaledThemePreview>;
  }

  return <ScaledThemePreview className={`catalog-theme-preview catalog-theme-preview--${device}`} device={device} style={style}>
        <header className="storefront-header">
          <StorefrontBrandPreview theme={storefrontTheme} />
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
            <div className="storefront-controls__actions">
              {storefrontTheme.filters.visible && <button className="storefront-mobile-filter-trigger" type="button"><Icon name="characteristics" size={19} /> Фільтри</button>}
              <button className="custom-select__button catalog-theme-preview__sort" type="button">За популярністю</button>
            </div>
          </div>
          <div className="storefront-catalog__layout">
            {storefrontTheme.filters.visible && <aside className="storefront-filter-panel">
              <div className="storefront-filter-panel__body">
                <header className="storefront-filter-panel__desktop-header"><h2>Фільтри</h2></header>
                <section className="storefront-filter-group"><h3>Бренд</h3><label className="storefront-filter-option"><input type="radio" checked readOnly /><span>Усі бренди</span><small>12</small></label><label className="storefront-filter-option"><input type="radio" readOnly /><span>Apple</span><small>7</small></label></section>
              </div>
            </aside>}
            <div className="storefront-grid">
              {[0, 1, 2, 3].map((index) => <ThemePreviewCard theme={cardTheme} index={index} key={index} />)}
            </div>
          </div>
        </section>
  </ScaledThemePreview>;
}

export function CatalogProductPagePreview({
  storefrontTheme,
  productPageTheme,
  device
}: {
  storefrontTheme: CatalogStorefrontTheme;
  productPageTheme: CatalogProductPageTheme;
  device: CatalogThemeDevice;
}) {
  const style = { ...storefrontThemeStyle(storefrontTheme), ...productPageThemeStyle(productPageTheme) };
  return <ScaledThemePreview className={`catalog-theme-preview catalog-theme-preview--${device} catalog-theme-preview--product-page`} device={device} style={style}>
    <header className="storefront-header">
      <StorefrontBrandPreview theme={storefrontTheme} />
    </header>
    <section className="storefront-product-view catalog-product-page-preview__product">
      <div className="storefront-product-view__hero">
        <section className="storefront-product-view__media catalog-product-page-preview__media">
          <div className="catalog-product-page-preview__stage">
            <span className="catalog-theme-preview__phone" />
            {productPageTheme.gallery.showArrows && <><button className="storefront-gallery-navigation storefront-gallery__navigation storefront-gallery__navigation--prev" type="button"><Icon name="arrowLeft" size={20} /></button><button className="storefront-gallery-navigation storefront-gallery__navigation storefront-gallery__navigation--next" type="button"><Icon name="arrowRight" size={20} /></button></>}
            {productPageTheme.gallery.showCounter && <span className="storefront-gallery__counter">1 / 6</span>}
          </div>
          {productPageTheme.gallery.showThumbnails && <div className="catalog-product-page-preview__thumbs">
            {[0, 1, 2, 3, 4].map((item) => <span className={item === 0 ? 'active' : ''} key={item}><span className="catalog-theme-preview__phone" /></span>)}
          </div>}
        </section>
        <article className="storefront-product-view__details">
          {productPageTheme.visibility.backLink && <span className="storefront-back"><Icon name="arrowLeft" size={16} /> До каталогу</span>}
          <div className="storefront-product-view__body">
            {productPageTheme.visibility.meta && <div className="storefront-product-view__meta"><span>SM-000125</span><span>Вживаний</span><span>Apple</span></div>}
            <h1>Смартфон Apple iPhone 15 Pro 256GB Black</h1>
            <div className="storefront-product-view__purchase"><strong>35 999 грн</strong><span>В наявності</span></div>
            {productPageTheme.visibility.shortDescription && <p className="storefront-product-view__lead">Перевірений смартфон у відмінному стані з гарантією магазину.</p>}
            {productPageTheme.visibility.quickSpecs && <dl className="storefront-product-view__specs"><div><dt>Корпус</dt><dd>Відмінний</dd></div><div><dt>Акумулятор</dt><dd>91%</dd></div><div><dt>Дисплей</dt><dd>Оригінальний</dd></div><div><dt>Гарантія</dt><dd>6 місяців</dd></div></dl>}
            {productPageTheme.visibility.modifications && <div className="storefront-modifications"><div className="storefront-modification"><span className="storefront-modification__label">Колір</span><div className="storefront-modification__options"><button className="storefront-modification__option storefront-modification__option--active" type="button">Black</button><button className="storefront-modification__option" type="button">Natural</button></div></div></div>}
          </div>
          <div className="storefront-product-view__footer"><button className="button button--primary storefront-product-view__action" type="button">{productPageTheme.button.label} <Icon name="arrowRight" size={16} /></button></div>
        </article>
      </div>
      {productPageTheme.visibility.tabs && <section className="storefront-product-content catalog-product-page-preview__tabs">
        <div className="storefront-product-content__tabs"><button className="storefront-product-content__tab active" type="button">{productPageTheme.tabs.descriptionLabel}</button><button className="storefront-product-content__tab" type="button">{productPageTheme.tabs.characteristicsLabel}</button></div>
        <div className="storefront-product-content__section"><header className="storefront-product-content__header"><span>Про товар</span><h2>{productPageTheme.tabs.descriptionLabel}</h2></header><p>Повний опис товару відображатиметься в цьому блоці.</p></div>
      </section>}
    </section>
  </ScaledThemePreview>;
}
