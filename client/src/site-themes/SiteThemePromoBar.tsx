import { useState } from 'react';
import { Icon } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';
import type { StyledSelectOption } from '../components/StyledSelect';
import type { SiteThemePromoBar } from '../types/site-theme';

const alignmentOptions: StyledSelectOption<SiteThemePromoBar['alignment']>[] = [
  { value: 'left', label: 'Ліворуч' },
  { value: 'center', label: 'По центру' },
  { value: 'right', label: 'Праворуч' }
];

const colorFields = [
  { field: 'backgroundColor', label: 'Колір фону' },
  { field: 'textColor', label: 'Колір тексту' },
  { field: 'buttonColor', label: 'Колір кнопки' },
  { field: 'buttonTextColor', label: 'Колір тексту кнопки' }
] as const;

const tabs = [
  { value: 'content', label: 'Контент' },
  { value: 'style', label: 'Стилі' },
  { value: 'visibility', label: 'Показ' }
] as const;

export function SiteThemePromoBarSettings({
  config, disabled, onChange
}: {
  config: SiteThemePromoBar;
  disabled: boolean;
  onChange: (patch: Partial<SiteThemePromoBar>) => void;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]['value']>('content');

  return <section className="site-themes__panel site-themes__settings" aria-labelledby="site-theme-settings-heading">
    <header className="site-themes__panel-header">
      <h3 id="site-theme-settings-heading">Верхня промосмуга</h3>
    </header>
    <div className="site-themes__settings-tabs" role="group" aria-label="Налаштування промосмуги">
      {tabs.map((item) => <button
        key={item.value}
        type="button"
        aria-pressed={tab === item.value}
        onClick={() => setTab(item.value)}
      >{item.label}</button>)}
    </div>
    <fieldset className="site-themes__fields" disabled={disabled}>
      <legend className="visually-hidden">{tabs.find((item) => item.value === tab)?.label}</legend>
      {tab === 'content' && <>
        <label className="field">
          <span>Текст промосмуги</span>
          <textarea
            rows={3}
            maxLength={240}
            value={config.text}
            onChange={(event) => onChange({ text: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Текст кнопки</span>
          <input maxLength={80} value={config.buttonText} onChange={(event) => onChange({ buttonText: event.target.value })} />
        </label>
        <label className="field">
          <span>Посилання кнопки</span>
          <input
            inputMode="url"
            maxLength={500}
            value={config.buttonUrl}
            placeholder="/aktsii/"
            onChange={(event) => onChange({ buttonUrl: event.target.value })}
          />
          <small className="site-themes__hint">Кнопка з’явиться, коли заповнено текст і посилання.</small>
        </label>
      </>}
      {tab === 'style' && <>
        {colorFields.map(({ field, label }) => <label className="site-themes__color-field" key={field}>
          <span>{label}</span>
          <input type="color" value={config[field]} onChange={(event) => onChange({ [field]: event.target.value })} />
          <code aria-hidden="true">{config[field].toUpperCase()}</code>
        </label>)}
        <div className="field">
          <span>Вирівнювання</span>
          <StyledSelect
            ariaLabel="Вирівнювання"
            value={config.alignment}
            options={alignmentOptions}
            onChange={(alignment) => onChange({ alignment })}
            disabled={disabled}
            compact
          />
        </div>
        <div className="site-themes__padding-fields">
          <label className="field">
            <span>Вертикальні відступи, px</span>
            <input
              type="number" min={0} max={40} value={config.paddingY}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                onChange({ paddingY: Number.isFinite(value) ? Math.max(0, Math.min(40, Math.trunc(value))) : 0 });
              }}
            />
          </label>
          <label className="field">
            <span>Горизонтальні відступи, px</span>
            <input
              type="number" min={0} max={80} value={config.paddingX}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                onChange({ paddingX: Number.isFinite(value) ? Math.max(0, Math.min(80, Math.trunc(value))) : 0 });
              }}
            />
          </label>
        </div>
      </>}
      {tab === 'visibility' && <>
        <label className="site-themes__checkbox">
          <input type="checkbox" checked={config.showDesktop} onChange={(event) => onChange({ showDesktop: event.target.checked })} />
          Показувати на десктопі
        </label>
        <label className="site-themes__checkbox">
          <input type="checkbox" checked={config.showMobile} onChange={(event) => onChange({ showMobile: event.target.checked })} />
          Показувати на мобільному
        </label>
        <p className="site-themes__hint">Зміни показу за пристроями застосовуються після публікації.</p>
      </>}
    </fieldset>
  </section>;
}

export function SiteThemePromoBarPreview({
  config, enabled
}: {
  config: SiteThemePromoBar;
  enabled: boolean;
}) {
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const visible = enabled && (viewport === 'desktop' ? config.showDesktop : config.showMobile);
  const withButton = Boolean(config.buttonText.trim() && config.buttonUrl.trim());
  const justifyContent = { left: 'flex-start', center: 'center', right: 'flex-end' }[config.alignment];
  let previewStatus = '';
  if (!enabled) previewStatus = 'Промосмугу вимкнено.';
  else if (!visible) previewStatus = 'Промосмугу приховано для цього пристрою.';
  else if (!config.text.trim()) previewStatus = 'Додайте текст, щоб побачити промосмугу.';

  return <section className="site-themes__panel site-themes__preview" aria-labelledby="site-theme-preview-heading">
    <header className="site-themes__panel-header site-themes__preview-header">
      <h3 id="site-theme-preview-heading">Попередній перегляд</h3>
      <div className="site-themes__viewport" role="group" aria-label="Пристрій для перегляду">
        <button type="button" aria-pressed={viewport === 'desktop'} onClick={() => setViewport('desktop')}>
          <Icon name="monitor" size={17} /> Десктоп
        </button>
        <button type="button" aria-pressed={viewport === 'mobile'} onClick={() => setViewport('mobile')}>
          <Icon name="phone" size={17} /> Мобільний
        </button>
      </div>
    </header>
    {previewStatus && <p className="site-themes__preview-status" role="status">{previewStatus}</p>}
    <div className="site-themes__preview-stage">
      <div className={`site-themes__store site-themes__store--${viewport}`}>
        {visible && config.text.trim() && <div className="site-themes__bar" style={{ backgroundColor: config.backgroundColor, color: config.textColor }}>
          <div
            className="site-themes__bar-inner"
            style={{ justifyContent, textAlign: config.alignment, padding: `${config.paddingY}px ${config.paddingX}px` }}
          >
            <span>{config.text}</span>
            {withButton && <span className="site-themes__bar-button" style={{ color: config.buttonTextColor, backgroundColor: config.buttonColor }}>
              {config.buttonText}
            </span>}
          </div>
        </div>}
        <div className="site-themes__store-header" aria-hidden="true">
          <Icon name="menu" size={20} />
          <strong>Mobile Trend</strong>
          <Icon name="search" size={20} />
        </div>
        <div className="site-themes__store-content" aria-hidden="true">
          <div className="site-themes__store-banner">
            <div><strong>Смартфони й аксесуари</strong><span>Каталог товарів</span></div>
            <span className="site-themes__store-device" />
          </div>
          <div className="site-themes__store-products">
            {['Смартфони', 'Навушники', 'Аксесуари'].map((category, index) => <div key={category}>
              <span className={`site-themes__store-product site-themes__store-product--${index}`}>
                <Icon name={index === 0 ? 'phone' : index === 1 ? 'catalog' : 'variants'} size={26} />
              </span>
              <strong>{category}</strong>
            </div>)}
          </div>
        </div>
      </div>
    </div>
  </section>;
}
