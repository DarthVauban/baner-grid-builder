import type { SiteThemeEffectId, SiteThemeGoldGlint } from '../types/site-theme';

export const defaultGoldGlint: SiteThemeGoldGlint = {
  color: '#ffcc48',
  intensity: 55,
  durationMs: 1400,
  repeat: 'once',
  intervalSeconds: 12
};

export const siteThemeEffectCatalog: {
  id: SiteThemeEffectId;
  title: string;
  placement: string;
  description: string;
  addLabel: string;
  editLabel: string;
}[] = [
  {
    id: 'goldGlint', title: 'Золотий відблиск', placement: 'На верхній промосмузі',
    description: 'Світло проходить уздовж верхньої промосмуги під її вмістом.',
    addLabel: 'Додати відблиск', editLabel: 'Налаштувати відблиск'
  },
  {
    id: 'cornerRibbons', title: 'Кутові стрічки', placement: 'У верхніх кутах вітрини',
    description: 'Статичні прикраси з окремим розміщенням для десктопа й мобільного.',
    addLabel: 'Додати стрічки', editLabel: 'Налаштувати стрічки'
  },
  {
    id: 'confetti', title: 'Залп конфеті', placement: 'З верхніх кутів вітрини',
    description: 'Короткий сплеск частинок після відкриття сторінки.',
    addLabel: 'Додати конфеті', editLabel: 'Налаштувати конфеті'
  }
];

export function SiteThemeEffectLibrary({ added, disabled, onSelect }: {
  added: ReadonlySet<SiteThemeEffectId>;
  disabled: boolean;
  onSelect: (effect: SiteThemeEffectId) => void;
}) {
  return <section className="site-themes__panel site-themes__settings" aria-labelledby="site-theme-effects-heading">
    <header className="site-themes__panel-header">
      <h3 id="site-theme-effects-heading">Бібліотека ефектів</h3>
    </header>
    <div className="site-themes__fields">
      <h4 className="site-themes__effect-title">Чорна п’ятниця</h4>
      {siteThemeEffectCatalog.map((effect) => <article className="site-themes__effect-card" key={effect.id}>
        <div className={`site-themes__effect-swatch site-themes__effect-visual--${effect.id}`} aria-hidden="true" />
        <div className="site-themes__effect-description">
          <strong>{effect.title}</strong>
          <p>{effect.description}</p>
        </div>
        <button type="button" className="button button--primary" disabled={disabled} onClick={() => onSelect(effect.id)}>
          {added.has(effect.id) ? effect.editLabel : effect.addLabel}
        </button>
      </article>)}
    </div>
  </section>;
}

export function EffectSlider({ label, min, max, step = 1, value, display, onChange }: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return <label className="site-themes__effect-slider">
    <span>{label}</span>
    <span className="site-themes__effect-value" aria-hidden="true">{display}</span>
    <input
      type="range"
      aria-label={label}
      aria-valuetext={display}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
    />
  </label>;
}

export function SiteThemeGoldGlintSettings({ config, disabled, replayAvailable, onChange, onReplay, onRemove }: {
  config: SiteThemeGoldGlint;
  disabled: boolean;
  replayAvailable: boolean;
  onChange: (value: SiteThemeGoldGlint) => void;
  onReplay: () => void;
  onRemove: () => void;
}) {
  return <section className="site-themes__panel site-themes__settings" aria-labelledby="site-theme-glint-heading">
    <header className="site-themes__panel-header">
      <h3 id="site-theme-glint-heading">Золотий відблиск</h3>
    </header>
    <fieldset className="site-themes__fields" disabled={disabled}>
      <legend className="visually-hidden">Налаштування відблиску</legend>
      <label className="site-themes__color-field">
        <span>Колір відблиску</span>
        <input type="color" value={config.color} onChange={(event) => onChange({ ...config, color: event.target.value })} />
        <code aria-hidden="true">{config.color.toUpperCase()}</code>
      </label>
      <EffectSlider
        label="Яскравість відблиску" min={0} max={100} value={config.intensity}
        display={`${config.intensity}%`}
        onChange={(intensity) => onChange({ ...config, intensity })}
      />
      <EffectSlider
        label="Тривалість проходу" min={500} max={4000} step={100} value={config.durationMs}
        display={`${(config.durationMs / 1000).toLocaleString('uk-UA')} с`}
        onChange={(durationMs) => onChange({ ...config, durationMs })}
      />
      <div className="site-themes__viewport site-themes__mode" role="group" aria-label="Повторення відблиску">
        <button type="button" aria-pressed={config.repeat === 'once'} onClick={() => onChange({ ...config, repeat: 'once' })}>Один раз</button>
        <button type="button" aria-pressed={config.repeat === 'interval'} onClick={() => onChange({ ...config, repeat: 'interval' })}>З інтервалом</button>
      </div>
      {config.repeat === 'interval' && <EffectSlider
        label="Інтервал повторення" min={5} max={120} value={config.intervalSeconds}
        display={`${config.intervalSeconds} с`}
        onChange={(intervalSeconds) => onChange({ ...config, intervalSeconds })}
      />}
      <button type="button" className="button button--secondary" disabled={!replayAvailable} onClick={onReplay}>Відтворити ефект</button>
      {!replayAvailable && <p className="site-themes__hint">Для відтворення промосмуга має бути видима у прев’ю.</p>}
      <button type="button" className="button button--secondary" onClick={onRemove}>Прибрати ефект</button>
    </fieldset>
  </section>;
}
