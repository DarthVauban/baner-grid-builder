import type { ReactNode } from 'react';
import { StyledSelect } from '../components/StyledSelect';
import type { StyledSelectOption } from '../components/StyledSelect';
import type { SiteThemeConfetti, SiteThemeCornerRibbons, SiteThemeRibbonLayout } from '../types/site-theme';
import { EffectSlider } from './SiteThemeEffectLibrary';

export const defaultCornerRibbons: SiteThemeCornerRibbons = {
  imageUrl: '',
  opacity: 90,
  desktop: { placement: 'both', size: 116 },
  mobile: { placement: 'left', size: 68 }
};

export const defaultConfetti: SiteThemeConfetti = {
  primaryColor: '#ffcc48',
  secondaryColor: '#171717',
  count: 42,
  durationMs: 1800,
  delayMs: 500,
  frequency: 'session',
  showDesktop: true,
  showMobile: true
};

const placements: StyledSelectOption<SiteThemeRibbonLayout['placement']>[] = [
  { value: 'both', label: 'Обидва кути' },
  { value: 'left', label: 'Лівий кут' },
  { value: 'right', label: 'Правий кут' },
  { value: 'hidden', label: 'Приховано' }
];

function EffectSettings({ title, disabled, children, onRemove }: {
  title: string;
  disabled: boolean;
  children: ReactNode;
  onRemove: () => void;
}) {
  return <section className="site-themes__panel site-themes__settings" aria-labelledby="site-theme-storefront-effect-heading">
    <header className="site-themes__panel-header">
      <h3 id="site-theme-storefront-effect-heading">{title}</h3>
    </header>
    <fieldset className="site-themes__fields" disabled={disabled}>
      <legend className="visually-hidden">{title}</legend>
      {children}
      <button type="button" className="button button--secondary" onClick={onRemove}>Прибрати ефект</button>
    </fieldset>
  </section>;
}

export function SiteThemeCornerRibbonSettings({ config, disabled, onChange, onUpload, onRemove }: {
  config: SiteThemeCornerRibbons;
  disabled: boolean;
  onChange: (config: SiteThemeCornerRibbons) => void;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  return <EffectSettings title="Кутові стрічки" disabled={disabled} onRemove={onRemove}>
    <label className="field">
      <span>Посилання на зображення стрічки</span>
      <input
        inputMode="url" maxLength={2048} value={config.imageUrl} placeholder="https://…"
        onChange={(event) => onChange({ ...config, imageUrl: event.target.value })}
      />
    </label>
    <label className="field">
      <span>Завантажити зображення стрічки</span>
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        if (file) onUpload(file);
        event.currentTarget.value = '';
      }} />
    </label>
    {config.imageUrl && <button type="button" className="button button--secondary button--small"
      onClick={() => onChange({ ...config, imageUrl: '' })}>Відновити стандартні стрічки</button>}
    <EffectSlider
      label="Непрозорість стрічок" min={0} max={100} value={config.opacity}
      display={`${config.opacity}%`} onChange={(opacity) => onChange({ ...config, opacity })}
    />
    {(['desktop', 'mobile'] as const).map((device) => {
      const label = device === 'desktop' ? 'на десктопі' : 'на мобільному';
      const layout = config[device];
      return <div className="site-themes__style-group" key={device}>
        <div className="field">
          <span>Кути {label}</span>
          <StyledSelect ariaLabel={`Кути ${label}`} value={layout.placement} options={placements} disabled={disabled} compact
            onChange={(placement) => onChange({ ...config, [device]: { ...layout, placement } })} />
        </div>
        {layout.placement !== 'hidden' && <EffectSlider
          label={`Розмір ${label}`} min={28} max={240} value={layout.size}
          display={`${layout.size} px`} onChange={(size) => onChange({ ...config, [device]: { ...layout, size } })}
        />}
      </div>;
    })}
  </EffectSettings>;
}

function seconds(value: number) {
  return `${(value / 1000).toLocaleString('uk-UA')} с`;
}

export function SiteThemeConfettiSettings({ config, disabled, replayAvailable, onChange, onReplay, onRemove }: {
  config: SiteThemeConfetti;
  disabled: boolean;
  replayAvailable: boolean;
  onChange: (config: SiteThemeConfetti) => void;
  onReplay: () => void;
  onRemove: () => void;
}) {
  return <EffectSettings title="Залп конфеті" disabled={disabled} onRemove={onRemove}>
    <div className="site-themes__style-grid">{([
      ['primaryColor', 'Перший колір'], ['secondaryColor', 'Другий колір']
    ] as const).map(([field, label]) => <label className="site-themes__color-field" key={field}>
      <span>{label}</span>
      <input type="color" value={config[field]} onChange={(event) => onChange({ ...config, [field]: event.target.value })} />
      <code aria-hidden="true">{config[field].toUpperCase()}</code>
    </label>)}</div>
    <EffectSlider label="Кількість частинок" min={12} max={100} value={config.count} display={String(config.count)}
      onChange={(count) => onChange({ ...config, count })} />
    <EffectSlider label="Тривалість залпу" min={800} max={5000} step={100} value={config.durationMs} display={seconds(config.durationMs)}
      onChange={(durationMs) => onChange({ ...config, durationMs })} />
    <EffectSlider label="Затримка після відкриття" min={0} max={5000} step={100} value={config.delayMs} display={seconds(config.delayMs)}
      onChange={(delayMs) => onChange({ ...config, delayMs })} />
    <div className="site-themes__viewport site-themes__mode" role="group" aria-label="Частота залпу">
      <button type="button" aria-pressed={config.frequency === 'session'} onClick={() => onChange({ ...config, frequency: 'session' })}>Раз за сеанс</button>
      <button type="button" aria-pressed={config.frequency === 'page'} onClick={() => onChange({ ...config, frequency: 'page' })}>При відкритті сторінки</button>
    </div>
    <label className="site-themes__checkbox">
      <input type="checkbox" checked={config.showDesktop} onChange={(event) => onChange({ ...config, showDesktop: event.target.checked })} />
      Показувати конфеті на десктопі
    </label>
    <label className="site-themes__checkbox">
      <input type="checkbox" checked={config.showMobile} onChange={(event) => onChange({ ...config, showMobile: event.target.checked })} />
      Показувати конфеті на мобільному
    </label>
    <button type="button" className="button button--secondary" disabled={!replayAvailable} onClick={onReplay}>Відтворити ефект</button>
  </EffectSettings>;
}
