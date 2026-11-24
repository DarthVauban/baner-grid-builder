import { useEffect, useRef, useState } from 'react';
import { mountPromoBarGoldGlint, mountPromoBarMarquee, promoBarBackgroundImage } from '../../../src/modules/site-themes/site-theme-presentation.js';
import { mountSiteThemeConfetti, mountSiteThemeCornerRibbons } from '../../../src/modules/site-themes/site-theme-storefront-effects.js';
import { Icon } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';
import type { StyledSelectOption } from '../components/StyledSelect';
import type { SiteThemeFontWeight, SiteThemePromoBar, SiteThemeStorefrontEffects } from '../types/site-theme';

const alignmentOptions: StyledSelectOption<SiteThemePromoBar['alignment']>[] = [
  { value: 'left', label: 'Ліворуч' },
  { value: 'center', label: 'По центру' },
  { value: 'right', label: 'Праворуч' }
];

const messageColorFields = [
  { field: 'backgroundColor', label: 'Колір фону' },
  { field: 'textColor', label: 'Колір тексту' }
] as const;

const buttonColorFields = [
  { field: 'buttonColor', label: 'Колір кнопки' },
  { field: 'buttonTextColor', label: 'Колір тексту кнопки' }
] as const;

const fontWeights: SiteThemeFontWeight[] = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const buttonFontWeightOptions = fontWeights.map((value) => ({ value, label: String(value) }));
const textFontWeightOptions: StyledSelectOption<SiteThemePromoBar['textFontWeight']>[] = [
  { value: 'inherit', label: 'Як на сайті' },
  ...buttonFontWeightOptions
];

const tabs = [
  { value: 'content', label: 'Контент' },
  { value: 'style', label: 'Стилі' },
  { value: 'visibility', label: 'Показ' }
] as const;

function PixelField({
  label, value, min, max, onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [typedValue, setTypedValue] = useState<string | null>(null);

  return <label className="field">
    <span>{label}</span>
    <input
      type="number"
      min={min}
      max={max}
      value={typedValue ?? value}
      onChange={(event) => {
        const nextValue = event.currentTarget.valueAsNumber;
        setTypedValue(event.currentTarget.value);
        if (Number.isInteger(nextValue) && nextValue >= min && nextValue <= max) onChange(nextValue);
      }}
      onBlur={(event) => {
        const nextValue = event.currentTarget.valueAsNumber;
        setTypedValue(null);
        if (!Number.isFinite(nextValue)) return;
        const boundedValue = Math.max(min, Math.min(max, Math.trunc(nextValue)));
        if (boundedValue !== value) onChange(boundedValue);
      }}
    />
  </label>;
}

export function SiteThemePromoBarSettings({
  config, disabled, onChange, onUploadBackgroundImage
}: {
  config: SiteThemePromoBar;
  disabled: boolean;
  onChange: (patch: Partial<SiteThemePromoBar>) => void;
  onUploadBackgroundImage: (file: File) => void;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]['value']>('content');
  const marquee = config.mode === 'marquee';

  function renderColorFields(fields: typeof messageColorFields | typeof buttonColorFields) {
    return fields.map(({ field, label }) => <label className="site-themes__color-field" key={field}>
      <span>{label}</span>
      <input type="color" value={config[field]} onChange={(event) => onChange({ [field]: event.target.value })} />
      <code aria-hidden="true">{config[field].toUpperCase()}</code>
    </label>);
  }

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
        <div className="site-themes__viewport site-themes__mode" role="group" aria-label="Режим промосмуги">
          <button type="button" aria-pressed={!marquee} onClick={() => onChange({ mode: 'standard' })}>Текст і кнопка</button>
          <button type="button" aria-pressed={marquee} onClick={() => onChange({ mode: 'marquee' })}>Біжучий текст</button>
        </div>
        <label className="field">
          <span>Текст промосмуги</span>
          <textarea
            rows={3}
            maxLength={240}
            value={config.text}
            onChange={(event) => onChange({ text: event.target.value })}
          />
        </label>
        {marquee ? <PixelField
          label="Швидкість тексту, px/с"
          value={config.marqueeSpeed}
          min={20}
          max={240}
          onChange={(marqueeSpeed) => onChange({ marqueeSpeed })}
        /> : <>
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
      </>}
      {tab === 'style' && <>
        <div className="site-themes__style-group">
          <h4>Промосмуга</h4>
          <div className="site-themes__style-grid">{renderColorFields(messageColorFields)}</div>
          <label className="field">
            <span>Посилання на фонове зображення</span>
            <input
              inputMode="url"
              maxLength={2048}
              value={config.backgroundImageUrl}
              placeholder="https://…"
              onChange={(event) => onChange({ backgroundImageUrl: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Завантажити фонове зображення</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const input = event.currentTarget;
                const file = input.files?.[0];
                if (file) onUploadBackgroundImage(file);
                input.value = '';
              }}
            />
          </label>
          {config.backgroundImageUrl && <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => onChange({ backgroundImageUrl: '' })}
          >Прибрати фонове зображення</button>}
          <PixelField
            label="Розмір тексту промосмуги, px"
            value={config.textFontSize}
            min={10}
            max={48}
            onChange={(textFontSize) => onChange({ textFontSize })}
          />
          <div className="field">
            <span>Насиченість тексту промосмуги</span>
            <StyledSelect
              ariaLabel="Насиченість тексту промосмуги"
              value={config.textFontWeight}
              options={textFontWeightOptions}
              onChange={(textFontWeight) => onChange({ textFontWeight })}
              disabled={disabled}
              compact
            />
          </div>
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
          <div className="site-themes__style-grid">
            <PixelField label="Вертикальні відступи, px" value={config.paddingY} min={0} max={40} onChange={(paddingY) => onChange({ paddingY })} />
            <PixelField label="Горизонтальні відступи, px" value={config.paddingX} min={0} max={80} onChange={(paddingX) => onChange({ paddingX })} />
          </div>
        </div>
        {!marquee && <div className="site-themes__style-group">
          <h4>Кнопка</h4>
          <div className="site-themes__style-grid">{renderColorFields(buttonColorFields)}</div>
          <PixelField
            label="Розмір тексту кнопки, px"
            value={config.buttonFontSize}
            min={10}
            max={48}
            onChange={(buttonFontSize) => onChange({ buttonFontSize })}
          />
          <div className="field">
            <span>Насиченість тексту кнопки</span>
            <StyledSelect
              ariaLabel="Насиченість тексту кнопки"
              value={config.buttonFontWeight}
              options={buttonFontWeightOptions}
              onChange={(buttonFontWeight) => onChange({ buttonFontWeight })}
              disabled={disabled}
              compact
            />
          </div>
          <div className="site-themes__style-grid">
            <PixelField
              label="Вертикальні відступи кнопки, px"
              value={config.buttonPaddingY}
              min={0}
              max={32}
              onChange={(buttonPaddingY) => onChange({ buttonPaddingY })}
            />
            <PixelField
              label="Горизонтальні відступи кнопки, px"
              value={config.buttonPaddingX}
              min={0}
              max={48}
              onChange={(buttonPaddingX) => onChange({ buttonPaddingX })}
            />
          </div>
        </div>}
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
  config, enabled, viewport, onViewportChange, glintReplay, cornerRibbons, confetti, confettiReplay
}: SiteThemeStorefrontEffects & {
  config: SiteThemePromoBar;
  enabled: boolean;
  viewport: 'desktop' | 'mobile';
  onViewportChange: (value: 'desktop' | 'mobile') => void;
  glintReplay: number;
  confettiReplay: number;
}) {
  const store = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const marqueeViewport = useRef<HTMLDivElement>(null);
  const marqueeMessage = useRef<HTMLSpanElement>(null);
  const visible = enabled && (viewport === 'desktop' ? config.showDesktop : config.showMobile);
  const { mode, text, textFontSize, textFontWeight, marqueeSpeed, goldGlint } = config;
  const withButton = mode !== 'marquee' && Boolean(config.buttonText.trim() && config.buttonUrl.trim());
  const messageStyle = { fontSize: textFontSize, fontWeight: textFontWeight };
  const backgroundImage = promoBarBackgroundImage(config.backgroundImageUrl.trim());
  const justifyContent = { left: 'flex-start', center: 'center', right: 'flex-end' }[config.alignment];
  let previewStatus = '';
  if (!enabled) previewStatus = 'Промосмугу вимкнено.';
  else if (!visible) previewStatus = 'Промосмугу приховано для цього пристрою.';
  else if (!text.trim()) previewStatus = 'Додайте текст, щоб побачити промосмугу.';

  useEffect(() => {
    if (!marqueeViewport.current || !marqueeMessage.current) return;
    return mountPromoBarMarquee(marqueeViewport.current, marqueeMessage.current, marqueeSpeed);
  }, [visible, mode, text, textFontSize, textFontWeight, marqueeSpeed]);

  useEffect(() => {
    if (!visible || !bar.current || !glintReplay || !goldGlint) return;
    return mountPromoBarGoldGlint(bar.current, goldGlint, true);
  }, [visible, goldGlint, glintReplay]);

  useEffect(() => {
    if (!store.current || !cornerRibbons) return;
    return mountSiteThemeCornerRibbons(store.current, cornerRibbons, viewport, promoBarBackgroundImage);
  }, [cornerRibbons, viewport]);

  useEffect(() => {
    if (!store.current || !confetti || !confettiReplay) return;
    return mountSiteThemeConfetti(store.current, confetti, viewport, '', true);
  }, [confetti, confettiReplay, viewport]);

  return <section className="site-themes__panel site-themes__preview" aria-labelledby="site-theme-preview-heading">
    <header className="site-themes__panel-header site-themes__preview-header">
      <h3 id="site-theme-preview-heading">Попередній перегляд</h3>
      <div className="site-themes__viewport" role="group" aria-label="Пристрій для перегляду">
        <button type="button" aria-pressed={viewport === 'desktop'} onClick={() => onViewportChange('desktop')}>
          <Icon name="monitor" size={17} /> Десктоп
        </button>
        <button type="button" aria-pressed={viewport === 'mobile'} onClick={() => onViewportChange('mobile')}>
          <Icon name="phone" size={17} /> Мобільний
        </button>
      </div>
    </header>
    {previewStatus && <p className="site-themes__preview-status" role="status">{previewStatus}</p>}
    <div className="site-themes__preview-stage">
      <div className={`site-themes__store site-themes__store--${viewport}`} ref={store}>
        {visible && text.trim() && <div className="site-themes__bar" ref={bar} style={{ backgroundColor: config.backgroundColor, backgroundImage, color: config.textColor }}>
          <div
            className="site-themes__bar-inner"
            style={{ justifyContent, textAlign: config.alignment, padding: `${config.paddingY}px ${config.paddingX}px` }}
          >
            {mode === 'marquee' ? <div className="site-themes__marquee" ref={marqueeViewport}>
              <span className="site-themes__bar-message" style={messageStyle} ref={marqueeMessage}>{text}</span>
            </div> : <span className="site-themes__bar-message" style={messageStyle}>{text}</span>}
            {withButton && <span className="site-themes__bar-button" style={{
              color: config.buttonTextColor,
              backgroundColor: config.buttonColor,
              fontSize: config.buttonFontSize,
              fontWeight: config.buttonFontWeight,
              padding: `${config.buttonPaddingY}px ${config.buttonPaddingX}px`
            }}>
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
