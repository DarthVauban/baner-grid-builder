import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PromoCodePickerModal } from '../components/promo-codes/PromoCodePickerModal';
import { StyledSelect } from '../components/StyledSelect';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type { HoroshopCatalogModification, HoroshopCatalogProduct } from '../types/horoshop-catalog';
import type { PromoCode, PromoCodeSnapshot } from '../types/promo-code';
import type {
  PopupCampaign,
  PopupCampaignInput,
  PopupCampaignStatus,
  PopupCampaignType,
  PopupDesktopPosition,
  PopupLayout,
  PopupLeadBlock,
  PopupLeadBlockLayout,
  PopupLeadField,
  PopupLeadFieldType,
  PopupMobilePosition,
  PopupPreviewPayload,
  PopupPromoFormat,
  PopupPromoProduct,
  PopupTrigger,
  PopupTargetMode,
  PopupTargeting
} from '../types/popup-banner';
import '../styles/popup-banners.css';

type EditorTab = 'library' | 'content' | 'products' | 'contacts' | 'targeting' | 'behavior';
type CampaignFilter = 'all' | PopupCampaignStatus;
type PreviewViewport = 'desktop' | 'mobile';
type LeadFormPreviewState = 'form' | 'success';

const statusLabels: Record<PopupCampaignStatus, string> = {
  draft: 'Чернетка',
  active: 'Активна',
  paused: 'Призупинена'
};

const campaignTypeLabels: Record<PopupCampaignType, string> = {
  message: 'Інформаційний попап',
  out_of_stock_recommendations: 'Альтернативи товару',
  product_promo: 'Товарний промобанер',
  promo_code: 'Банер із промокодом',
  lead_form: 'Форма за промокод',
  countdown: 'Банер із таймером'
};

const layoutLabels: Record<PopupLayout, string> = {
  modal: 'По центру',
  'bottom-sheet': 'Знизу',
  corner: 'У кутку'
};

const promoFormatPresets: Array<{
  value: PopupPromoFormat;
  title: string;
  description: string;
  width: number;
  products: string;
}> = [
  { value: 'notification', title: 'Сповіщення', description: 'Як у Elfsight: компактний горизонтальний віджет', width: 380, products: '1 товар із ротацією' },
  { value: 'compact', title: 'Компактний', description: 'Коротка горизонтальна картка з усіма деталями', width: 460, products: '1 товар із ротацією' },
  { value: 'standard', title: 'Стандартний', description: 'Збалансований банер із більшим фото товару', width: 640, products: '1 товар із ротацією' },
  { value: 'wide', title: 'Широкий', description: 'Широка промопанель з акцентом на товарі', width: 860, products: '1 товар із ротацією' },
  { value: 'custom', title: 'Власний', description: 'Ручне налаштування максимальної ширини', width: 680, products: '1 товар із ротацією' }
];

const desktopPositions: Array<{ value: PopupDesktopPosition; label: string }> = [
  { value: 'top_left', label: 'Зверху ліворуч' },
  { value: 'top_right', label: 'Зверху праворуч' },
  { value: 'bottom_left', label: 'Знизу ліворуч' },
  { value: 'bottom_right', label: 'Знизу праворуч' }
];

const mobilePositions: Array<{ value: PopupMobilePosition; label: string }> = [
  { value: 'top', label: 'Зверху' },
  { value: 'bottom', label: 'Знизу' }
];

const weekdays = [
  { value: 1, label: 'Пн' }, { value: 2, label: 'Вт' }, { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' }, { value: 5, label: 'Пт' }, { value: 6, label: 'Сб' }, { value: 7, label: 'Нд' }
];

const leadFieldTypeOptions: Array<{ value: PopupLeadFieldType; label: string }> = [
  { value: 'text', label: 'Короткий текст' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Телефон' },
  { value: 'textarea', label: 'Довгий текст' },
  { value: 'select', label: 'Список варіантів' },
  { value: 'checkbox', label: 'Чекбокс згоди' }
];

const targetModeLabels: Record<PopupTargetMode, string> = {
  out_of_stock: 'Товар відсутній',
  products: 'Вказані товари',
  rules: 'Умови каталогу',
  target_page: 'Цільова сторінка',
  all_products: 'Усі товари',
  all_pages: 'Усі сторінки'
};

function emptyCampaign(campaignType: PopupCampaignType = 'message'): PopupCampaignInput {
  const draft: PopupCampaignInput = {
    campaignType,
    name: 'Попередження про товар',
    priority: 100,
    content: {
      eyebrow: 'Важлива інформація',
      title: 'Зверніть увагу',
      body: 'Перед оформленням замовлення ознайомтеся з важливою інформацією про товар.',
      primaryLabel: 'Зрозуміло',
      primaryUrl: '',
      secondaryLabel: 'Закрити',
      imageUrl: '',
      acknowledgementLabel: 'Я прочитав(-ла) і розумію цю інформацію.'
    },
    styles: {
      layout: 'modal',
      promoFormat: 'notification',
      desktopPosition: 'bottom_right',
      mobilePosition: 'bottom',
      accentColor: '#6d5dfc',
      backgroundColor: '#ffffff',
      textColor: '#172033',
      mutedColor: '#667085',
      primaryButtonBackgroundColor: '#6d5dfc',
      primaryButtonTextColor: '#ffffff',
      promoCopyButtonBackgroundColor: '#6d5dfc',
      promoCopyButtonTextColor: '#ffffff',
      promoCodeBackgroundColor: '#6d5dfc',
      promoCodeBackgroundOpacity: 7,
      secondaryButtonBackgroundColor: '#ffffff',
      secondaryButtonTextColor: '#172033',
      checkboxAccentColor: '#6d5dfc',
      checkboxCheckColor: '#ffffff',
      checkboxTextColor: '#172033',
      timelineColor: '#6d5dfc',
      timelineTrackColor: '#ede9fe',
      showPromoTitle: false,
      eyebrowFontSize: 12,
      titleFontSize: 34,
      bodyFontSize: 16,
      acknowledgementFontSize: 14,
      buttonFontSize: 16,
      buttonBorderRadius: 12,
      borderRadius: 24,
      maxWidth: 520
    },
    targeting: {
      mode: 'products',
      match: 'all',
      stickers: [],
      brands: [],
      categoryIds: [],
      conditions: [],
      targetPageUrl: '',
      urlContains: [],
      recommendationLimit: 6
    },
    behavior: {
      trigger: 'delay',
      delayMs: 300,
      scrollPercent: 35,
      inactivitySeconds: 8,
      frequency: 'product',
      cooldownHours: 24,
      cooldownDays: 7,
      maxShowsPerSession: 0,
      device: 'all',
      autoCloseSeconds: 0,
      rotationSeconds: 6,
      activeWeekdays: [1, 2, 3, 4, 5, 6, 7],
      dailyStartTime: '',
      dailyEndTime: '',
      scheduleTimezone: 'Europe/Kyiv',
      dismissible: true,
      requireAcknowledgement: false,
      buttonCount: 2
    },
    startsAt: null,
    endsAt: null,
    promoCodeId: null,
    timerConfig: { mode: 'duration', deadlineAt: null, durationMinutes: 15 },
    formConfig: {
      fields: [
        { id: 'name', type: 'text', label: 'Імʼя', placeholder: 'Ваше імʼя', required: true, options: [] },
        { id: 'phone', type: 'phone', label: 'Телефон', placeholder: '+380', required: true, options: [] }
      ],
      blocks: [{ id: 'contact', layout: 'row', fieldIds: ['name', 'phone'] }],
      submitLabel: 'Отримати промокод',
      successTitle: 'Ваш промокод готовий',
      successBody: 'Скопіюйте код і використайте його під час оформлення замовлення.'
    },
    productEntries: [],
    promoItems: []
  };
  if (campaignType === 'product_promo') {
    return {
      ...draft,
      name: 'Товарний промобанер',
      content: {
        ...draft.content,
        eyebrow: 'Рекомендуємо',
        title: 'Вигідна пропозиція',
        body: 'Добірка актуальних товарів, які можуть вас зацікавити.',
        primaryLabel: 'Купити',
        secondaryLabel: '',
        acknowledgementLabel: ''
      },
      styles: {
        ...draft.styles,
        layout: 'corner',
        promoFormat: 'notification',
        desktopPosition: 'bottom_left',
        mobilePosition: 'bottom',
        accentColor: '#6d5dfc',
        primaryButtonBackgroundColor: '#ffe101',
        primaryButtonTextColor: '#111827',
        titleFontSize: 28,
        maxWidth: 380
      },
      targeting: { ...draft.targeting, mode: 'all_pages' },
      behavior: {
        ...draft.behavior,
        delayMs: 700,
        frequency: 'session',
        maxShowsPerSession: 1,
        rotationSeconds: 6,
        requireAcknowledgement: false,
        buttonCount: 1
      }
    };
  }
  if (campaignType === 'out_of_stock_recommendations') {
    return {
      ...draft,
      name: 'Альтернативи для відсутнього товару',
      content: {
        ...draft.content,
        eyebrow: 'Товар тимчасово недоступний',
        title: 'Цього товару зараз немає в наявності',
        body: 'Оберіть схожу модель із цієї самої категорії — усі запропоновані товари доступні для замовлення.',
        primaryLabel: 'Купити'
      },
      styles: { ...draft.styles, maxWidth: 960 },
      targeting: { ...draft.targeting, mode: 'out_of_stock' },
      behavior: { ...draft.behavior, frequency: 'always', buttonCount: 1 }
    };
  }
  if (campaignType === 'promo_code') {
    return {
      ...draft,
      name: 'Банер із промокодом',
      content: {
        ...draft.content,
        eyebrow: 'Промокод',
        title: 'Знижка для вас',
        body: 'Скопіюйте код і використайте його під час оформлення замовлення.',
        primaryLabel: 'Перейти до акції',
        primaryUrl: '',
        secondaryLabel: '',
        acknowledgementLabel: ''
      },
      styles: { ...draft.styles, maxWidth: 560 },
      targeting: { ...draft.targeting, mode: 'all_pages' },
      behavior: {
        ...draft.behavior,
        frequency: 'session',
        maxShowsPerSession: 1,
        requireAcknowledgement: false,
        buttonCount: 1
      }
    };
  }
  if (campaignType === 'lead_form') {
    return {
      ...draft,
      name: 'Форма за промокод',
      content: {
        ...draft.content,
        eyebrow: 'Подарунок за контакт',
        title: 'Отримайте промокод',
        body: 'Залиште контактні дані — промокод з’явиться одразу після відправлення форми.',
        primaryLabel: '',
        primaryUrl: '',
        secondaryLabel: '',
        acknowledgementLabel: ''
      },
      styles: { ...draft.styles, maxWidth: 600 },
      targeting: { ...draft.targeting, mode: 'all_pages' },
      behavior: {
        ...draft.behavior,
        frequency: 'session',
        maxShowsPerSession: 1,
        requireAcknowledgement: false,
        buttonCount: 1
      }
    };
  }
  if (campaignType === 'countdown') {
    return {
      ...draft,
      name: 'Банер із таймером',
      content: {
        ...draft.content,
        eyebrow: 'Пропозиція обмежена в часі',
        title: 'Встигніть скористатися пропозицією',
        body: 'Оберіть товари за вигідною ціною до завершення акції.',
        primaryLabel: 'Перейти до пропозиції',
        acknowledgementLabel: ''
      },
      targeting: { ...draft.targeting, mode: 'all_pages' },
      behavior: { ...draft.behavior, frequency: 'always', requireAcknowledgement: false, buttonCount: 1 }
    };
  }
  return draft;
}

function campaignInput(campaign: PopupCampaign): PopupCampaignInput {
  const styles = { ...campaign.styles };
  const formConfig = campaign.formConfig || emptyCampaign(campaign.campaignType).formConfig;
  const blocks = formConfig.blocks?.length
    ? formConfig.blocks
    : formConfig.fields.map((field, index) => ({
      id: `legacy_${index + 1}`,
      layout: 'column' as const,
      fieldIds: [field.id]
    }));
  if (campaign.campaignType === 'product_promo' && styles.promoFormat !== 'custom') {
    styles.maxWidth = promoFormatPresets.find((preset) => preset.value === styles.promoFormat)?.width || 380;
  }
  return {
    campaignType: campaign.campaignType,
    name: campaign.name,
    priority: campaign.priority,
    content: { ...campaign.content },
    styles,
    targeting: { ...campaign.targeting },
    behavior: { ...campaign.behavior },
    timerConfig: { ...(campaign.timerConfig || emptyCampaign().timerConfig) },
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    promoCodeId: campaign.promoCodeId,
    formConfig: {
      ...formConfig,
      fields: formConfig.fields.map((field) => ({ ...field, options: [...field.options] })),
      blocks: blocks.map((block) => ({ ...block, fieldIds: [...block.fieldIds] }))
    },
    productEntries: campaign.productTargets.map((item) => item.sku),
    promoItems: campaign.promoProducts.map((item) => ({
      productExternalId: item.productExternalId,
      modificationExternalId: item.modificationExternalId
    }))
  };
}

function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function isoDateTime(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function inputLines(value: string) {
  return [...new Set(value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean))];
}

function localizedTitle(titles: Record<string, string>) {
  return titles.uk || titles.ua || titles.ru || titles.en || Object.values(titles).find(Boolean) || '';
}

function isAvailable(value: string | null) {
  const availability = String(value || '').trim().toLocaleLowerCase('uk-UA');
  return Boolean(availability) && !/(немає\s+(?:в\s+)?наявност|нет\s+(?:в\s+)?наличи|out[\s-]*of[\s-]*stock|not[\s-]*available|закінчив|отсутств)/iu.test(availability);
}

function promoKey(item: Pick<PopupPromoProduct, 'productExternalId' | 'modificationExternalId'>) {
  return `${item.productExternalId}\0${item.modificationExternalId || ''}`;
}

function promoOffer(product: HoroshopCatalogProduct, modification?: HoroshopCatalogModification): PopupPromoProduct {
  return {
    id: `${product.externalId}:${modification?.externalId || 'product'}`,
    productId: product.id,
    modificationId: modification?.id || null,
    productExternalId: product.externalId,
    modificationExternalId: modification?.externalId || null,
    position: 0,
    sku: modification?.sku || product.sku,
    title: localizedTitle(modification?.titles || product.titles) || localizedTitle(product.titles),
    imageUrl: storefrontImageUrl(modification?.imageUrl || product.primaryImageUrl || ''),
    pageUrl: modification?.pageUrl || product.canonicalUrl || '',
    price: modification?.price || product.price || '',
    oldPrice: modification?.oldPrice || product.oldPrice || '',
    currency: modification?.currency || product.currency || '',
    availability: modification?.availability || product.availability || '',
    visible: modification?.visible ?? product.visible,
    available: isAvailable(modification?.availability || product.availability),
    buyId: ''
  };
}

function storefrontImageUrl(value: string) {
  return value.replace(/_\+[0-9a-f]{6,}(?=\.[a-z0-9]+(?:[?#]|$))/iu, '');
}

function money(value: string, currency: string) {
  if (!value) return 'Ціна не вказана';
  return `${value}${currency.toUpperCase() === 'UAH' ? ' грн' : currency ? ` ${currency}` : ''}`;
}

function promoCodeValue(value: PromoCode | PromoCodeSnapshot) {
  return value.type === 'percent_coupon'
    ? `−${value.discountValue}%`
    : `${value.discountValue.toLocaleString('uk-UA')} ${value.currency}`;
}

function campaignUsesAttachedProducts(campaignType: PopupCampaignType) {
  return campaignType === 'product_promo';
}

function campaignSupportsExitIntent(campaignType: PopupCampaignType, targetMode: PopupTargetMode) {
  return campaignType !== 'product_promo'
    && campaignType !== 'out_of_stock_recommendations'
    && targetMode !== 'out_of_stock';
}

function newLeadField(index: number): PopupLeadField {
  return {
    id: `field_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_${index}`,
    type: 'text',
    label: 'Нове поле',
    placeholder: '',
    required: false,
    options: []
  };
}

function newLeadBlock(index: number): { block: PopupLeadBlock; field: PopupLeadField } {
  const field = newLeadField(index);
  return {
    field,
    block: {
      id: `block_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_${index}`,
      layout: 'column',
      fieldIds: [field.id]
    }
  };
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Без обмеження';
}

function Toggle({ checked, label, description, onChange }: {
  checked: boolean;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  return <label className="popup-toggle">
    <span className="popup-toggle__copy"><strong>{label}</strong><small>{description}</small></span>
    <input className="switch" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
  </label>;
}

function SectionHeading({ icon, title, description, aside }: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  description: string;
  aside?: string;
}) {
  return <header className="popup-section-heading">
    <span className="popup-section-heading__icon"><Icon name={icon} size={19} /></span>
    <div><h2>{title}</h2><p>{description}</p></div>
    {aside && <small>{aside}</small>}
  </header>;
}

function RulePicker({ label, values, selected, options, onChange }: {
  label: string;
  values: string[];
  selected: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return <div className="popup-rule-picker">
    <span className="field-label">{label}</span>
    <StyledSelect
      value={selected}
      options={[{ value: '', label: `Додати: ${label.toLocaleLowerCase('uk-UA')}` }, ...options.filter((item) => !values.includes(item.value))]}
      onChange={onChange}
      searchable
      searchPlaceholder={`Пошук: ${label.toLocaleLowerCase('uk-UA')}`}
      ariaLabel={label}
    />
    {values.length > 0 && <div className="popup-rule-chips">
      {values.map((value) => <button type="button" key={value} onClick={() => onChange(value)}>
        {options.find((item) => item.value === value)?.label || value}<Icon name="close" size={13} />
      </button>)}
    </div>}
  </div>;
}

function LayoutPicker({ value, onChange }: { value: PopupLayout; onChange: (value: PopupLayout) => void }) {
  const layouts: PopupLayout[] = ['modal', 'bottom-sheet', 'corner'];
  return <div className="popup-layout-picker" role="radiogroup" aria-label="Розташування попапа">
    {layouts.map((layout) => <button
      type="button"
      role="radio"
      aria-checked={layout === value}
      className={layout === value ? 'is-active' : ''}
      key={layout}
      onClick={() => onChange(layout)}
    >
      <span className={`popup-layout-picker__scheme is-${layout}`}><i /></span>
      <strong>{layoutLabels[layout]}</strong>
    </button>)}
  </div>;
}

function TargetModePicker({ value, campaignType, onChange }: { value: PopupTargetMode; campaignType: PopupCampaignType; onChange: (value: PopupTargetMode) => void }) {
  const modes: Array<{ value: PopupTargetMode; icon: Parameters<typeof Icon>[0]['name']; description: string }> = [
    { value: 'out_of_stock', icon: 'visibility', description: 'Автоматично запропонувати доступні альтернативи' },
    { value: 'products', icon: 'productSelection', description: 'Назви, артикули або модифікації' },
    { value: 'rules', icon: 'characteristics', description: 'Стікери, бренди, категорії та стан' },
    { value: 'target_page', icon: 'link', description: 'Точне посилання окремої сторінки' },
    { value: 'all_products', icon: 'storefront', description: 'Будь-яка сторінка товару' },
    { value: 'all_pages', icon: 'productPage', description: 'Увесь сайт без обмежень' }
  ];
  const visibleModes = ['product_promo', 'promo_code', 'lead_form', 'countdown'].includes(campaignType)
    ? modes.filter((mode) => mode.value !== 'out_of_stock')
    : modes;
  return <div className="popup-target-mode" role="radiogroup" aria-label="Тип вибірки">
    {visibleModes.map((mode) => <button
      type="button"
      role="radio"
      aria-checked={mode.value === value}
      className={mode.value === value ? 'is-active' : ''}
      key={mode.value}
      onClick={() => onChange(mode.value)}
    >
      <span><Icon name={mode.icon} size={18} /></span>
      <div><strong>{targetModeLabels[mode.value]}</strong><small>{mode.description}</small></div>
      <i><Icon name="check" size={13} /></i>
    </button>)}
  </div>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="popup-color-field">
    <span>{label}</span>
    <div>
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={`${label}: вибрати колір`} />
      <input type="text" value={value} readOnly aria-label={`${label}: HEX`} />
    </div>
  </label>;
}

function OpacityField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const update = (nextValue: string) => onChange(Math.min(100, Math.max(0, Number(nextValue) || 0)));
  return <label className="popup-opacity-field">
    <span>{label}</span>
    <div>
      <input type="range" min={0} max={100} step={1} value={value} onChange={(event) => update(event.target.value)} aria-label={`${label}: повзунок`} />
      <input type="number" min={0} max={100} step={1} value={value} onChange={(event) => update(event.target.value)} aria-label={`${label}: значення`} />
    </div>
    <small>0% — повністю прозорий, 100% — суцільний колір.</small>
  </label>;
}

function PromoFormatPicker({ value, onChange }: { value: PopupPromoFormat; onChange: (preset: typeof promoFormatPresets[number]) => void }) {
  return <div className="popup-promo-format" role="radiogroup" aria-label="Формат товарного банера">
    {promoFormatPresets.map((preset) => <button
      type="button"
      role="radio"
      aria-checked={value === preset.value}
      className={value === preset.value ? 'is-active' : ''}
      onClick={() => onChange(preset)}
      key={preset.value}
    >
      <span className={`popup-promo-format__scheme is-${preset.value}`}><i /><b /><em /></span>
      <span><strong>{preset.title}</strong><small>{preset.description}</small><i>{preset.products} · {preset.value === 'custom' ? 'до 1400 px' : `${preset.width} px`}</i></span>
    </button>)}
  </div>;
}

function PromoPositionPicker({
  desktop,
  mobile,
  onDesktop,
  onMobile
}: {
  desktop: PopupDesktopPosition;
  mobile: PopupMobilePosition;
  onDesktop: (value: PopupDesktopPosition) => void;
  onMobile: (value: PopupMobilePosition) => void;
}) {
  return <div className="popup-position-settings">
    <div><strong>Положення на desktop</strong><div className="popup-position-grid" role="radiogroup" aria-label="Положення на desktop">
      {desktopPositions.map((item) => <button type="button" role="radio" aria-checked={desktop === item.value} className={desktop === item.value ? 'is-active' : ''} onClick={() => onDesktop(item.value)} key={item.value}>
        <span className={`is-${item.value}`}><i /></span><small>{item.label}</small>
      </button>)}
    </div></div>
    <div><strong>Положення на mobile</strong><div className="popup-position-grid is-mobile" role="radiogroup" aria-label="Положення на mobile">
      {mobilePositions.map((item) => <button type="button" role="radio" aria-checked={mobile === item.value} className={mobile === item.value ? 'is-active' : ''} onClick={() => onMobile(item.value)} key={item.value}>
        <span className={`is-${item.value}`}><i /></span><small>{item.label}</small>
      </button>)}
    </div></div>
  </div>;
}

function CampaignTypePicker({ onSelect }: { onSelect: (type: PopupCampaignType) => void }) {
  return <section className="popup-type-picker">
    <header><p className="eyebrow">Нова кампанія</p><h2>Оберіть тип банера</h2><p>Тип визначає структуру конструктора, поведінку на сайті та набір доступних налаштувань.</p></header>
    <div className="popup-type-picker__group">
      <div className="popup-type-picker__group-heading"><span><Icon name="bannerGrid" size={19} /></span><div><strong>Промобанери</strong><small>Маркетингові формати для просування товарів і пропозицій.</small></div></div>
      <div className="popup-type-picker__primary">
        <button type="button" onClick={() => onSelect('product_promo')}>
          <span><Icon name="productCard" size={25} /></span><i>НОВИЙ</i>
          <strong>Товарний промобанер</strong>
          <small>Від компактного Elfsight-подібного сповіщення до широкої добірки. Без оверлею — сайт залишається доступним.</small>
          <b>Створити банер <Icon name="arrow" size={16} /></b>
        </button>
        <button type="button" onClick={() => onSelect('promo_code')}>
          <span><Icon name="copy" size={25} /></span><i>НОВИЙ</i>
          <strong>Банер із промокодом</strong>
          <small>Код із локальної бібліотеки, швидке копіювання та опційний CTA. Промокод не застосовується автоматично.</small>
          <b>Створити банер <Icon name="arrow" size={16} /></b>
        </button>
        <button type="button" onClick={() => onSelect('lead_form')}>
          <span><Icon name="formBuilder" size={25} /></span><i>НОВИЙ</i>
          <strong>Форма за промокод</strong>
          <small>Збір контактів із настроюваними полями. Промокод відкривається лише після успішного надсилання.</small>
          <b>Створити банер <Icon name="arrow" size={16} /></b>
        </button>
        <button type="button" onClick={() => onSelect('countdown')}>
          <span><Icon name="schedule" size={25} /></span><i>НОВИЙ</i>
          <strong>Банер із таймером</strong>
          <small>Спільний відлік до дати або персональний таймер для кожного відвідувача. Автоматично приховується після завершення.</small>
          <b>Створити банер <Icon name="arrow" size={16} /></b>
        </button>
      </div>
    </div>
    <div className="popup-type-picker__group is-scenarios">
      <div className="popup-type-picker__group-heading"><span><Icon name="tools" size={19} /></span><div><strong>Сценарні банери</strong><small>Сервісні повідомлення, що запускаються за контекстом сторінки або станом товару.</small></div></div>
      <div className="popup-type-picker__scenario-grid">
        <button type="button" onClick={() => onSelect('message')}><span><Icon name="popup" size={23} /></span><strong>Інформаційний попап</strong><small>Повідомлення, явне підтвердження або перехід за посиланням.</small><b>Створити сценарій <Icon name="arrow" size={16} /></b></button>
        <button type="button" onClick={() => onSelect('out_of_stock_recommendations')}><span><Icon name="productSelection" size={23} /></span><strong>Альтернативи відсутнього товару</strong><small>Автоматична добірка доступних моделей із тієї самої категорії.</small><b>Створити сценарій <Icon name="arrow" size={16} /></b></button>
      </div>
    </div>
  </section>;
}

function previewDocument(payload: PopupPreviewPayload, viewport: PreviewViewport, leadFormState: LeadFormPreviewState) {
  const serializedPayload = JSON.stringify(payload)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&#60;');
  const origin = window.location.origin.replaceAll('"', '&quot;');
  return `<!doctype html>
<html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<base href="${origin}/"><style>
*{box-sizing:border-box}html,body{width:100%;min-height:100%;margin:0}body{min-height:100vh;overflow:hidden;background:#f5f7fb;color:#172033;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
.site{min-height:100vh;background:linear-gradient(145deg,#fff 0 57%,#eef1f7 57%)}.top{display:flex;align-items:center;gap:18px;height:68px;padding:0 5%;border-bottom:1px solid #e5e9f0;background:#fff}.logo{width:96px;height:20px;border-radius:7px;background:#6d5dfc}.nav{width:52px;height:8px;border-radius:9px;background:#d9dee8}.nav.first{margin-left:auto}.hero{display:grid;grid-template-columns:1fr .9fr;gap:7%;padding:8%}.visual{aspect-ratio:1.15;border-radius:24px;background:linear-gradient(140deg,#e9e6ff,#dbe5f7)}.copy{display:grid;align-content:start;gap:14px;padding-top:7%}.copy b,.copy span,.copy i{display:block;border-radius:8px;background:#d4dae5}.copy b{width:88%;height:22px}.copy span{width:68%;height:11px}.copy i{width:118px;height:38px;margin-top:14px;background:#ffe101}
@media(max-width:600px){.top{height:56px;padding:0 18px}.logo{width:70px}.nav{width:28px}.hero{grid-template-columns:1fr;padding:30px 18px}.copy{display:none}}
</style></head><body><div class="site" aria-hidden="true"><div class="top"><div class="logo"></div><div class="nav first"></div><div class="nav"></div><div class="nav"></div></div><div class="hero"><div class="visual"></div><div class="copy"><b></b><span></span><span></span><i></i></div></div></div>
<script src="/api/public/popup-banners/embed.js" data-preview-payload="${serializedPayload}" data-preview-device="${viewport}" data-preview-state="${leadFormState === 'success' ? 'lead-success' : 'form'}"></script></body></html>`;
}

function Preview({ input }: { input: PopupCampaignInput }) {
  const [viewport, setViewport] = useState<PreviewViewport>('desktop');
  const [leadFormState, setLeadFormState] = useState<LeadFormPreviewState>('form');
  const [fullscreen, setFullscreen] = useState(false);
  const [payload, setPayload] = useState<PopupPreviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      void api.popupBanners.preview(input, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        setPayload(result);
      }).catch((caught) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : 'Не вдалося побудувати прев’ю.');
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [input]);

  useEffect(() => {
    if (!fullscreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const background = Array.from(document.body.children)
      .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== previewRef.current)
      .map((node) => ({ node, inert: node.inert }));
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setFullscreen(false); };
    document.body.style.overflow = 'hidden';
    for (const { node } of background) node.inert = true;
    document.addEventListener('keydown', onKeyDown);
    fullscreenButtonRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      for (const { node, inert } of background) node.inert = inert;
      document.removeEventListener('keydown', onKeyDown);
      fullscreenButtonRef.current?.focus({ preventScroll: true });
    };
  }, [fullscreen]);

  const isLeadForm = input.campaignType === 'lead_form';
  useEffect(() => {
    if (!isLeadForm) setLeadFormState('form');
  }, [isLeadForm]);

  const documentSource = useMemo(
    () => payload ? previewDocument(payload, viewport, leadFormState) : '',
    [leadFormState, payload, viewport]
  );
  useEffect(() => {
    if (!fullscreen) return undefined;
    const iframe = iframeRef.current;
    let frameDocument: Document | null = null;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setFullscreen(false); };
    // Keyboard events inside the same-origin preview do not bubble to the workspace.
    const bindFrame = () => {
      frameDocument?.removeEventListener('keydown', onKeyDown);
      frameDocument = iframe?.contentDocument || null;
      frameDocument?.addEventListener('keydown', onKeyDown);
    };
    iframe?.addEventListener('load', bindFrame);
    bindFrame();
    return () => {
      iframe?.removeEventListener('load', bindFrame);
      frameDocument?.removeEventListener('keydown', onKeyDown);
    };
  }, [fullscreen, documentSource]);

  const preview = <div
    ref={previewRef}
    className={`popup-live-preview${fullscreen ? ' is-fullscreen' : ''}`}
    role={fullscreen ? 'dialog' : undefined}
    aria-modal={fullscreen || undefined}
    aria-label={fullscreen ? 'Повноекранний перегляд банера' : undefined}
  >
    <header>
      <div><strong>Живий перегляд</strong><small>Реальний storefront-runtime банера</small></div>
      <div className="popup-preview-toolbar">
        {isLeadForm && <div className="popup-preview-state" role="group" aria-label="Стан форми у попередньому перегляді">
          <button type="button" className={leadFormState === 'form' ? 'is-active' : ''} onClick={() => setLeadFormState('form')} aria-pressed={leadFormState === 'form'}>Форма</button>
          <button
            type="button"
            className={leadFormState === 'success' ? 'is-active' : ''}
            onClick={() => setLeadFormState('success')}
            aria-pressed={leadFormState === 'success'}
            title={payload?.campaign.promoCode ? 'Показати стан після успішного надсилання' : 'Буде показано демонстраційний промокод'}
          >Промокод отримано</button>
        </div>}
        <div className="popup-preview-device" role="group" aria-label="Розмір попереднього перегляду">
          <button type="button" className={viewport === 'desktop' ? 'is-active' : ''} onClick={() => setViewport('desktop')} aria-label="Комп’ютер" aria-pressed={viewport === 'desktop'}><Icon name="monitor" size={16} /><span>Десктоп</span></button>
          <button type="button" className={viewport === 'mobile' ? 'is-active' : ''} onClick={() => setViewport('mobile')} aria-label="Телефон" aria-pressed={viewport === 'mobile'}><Icon name="phone" size={16} /><span>Мобільний</span></button>
        </div>
        <button ref={fullscreenButtonRef} className="popup-preview-fullscreen" type="button" onClick={() => setFullscreen((value) => !value)} aria-label={fullscreen ? 'Закрити повноекранний перегляд' : 'Відкрити прев’ю на весь екран'}>
          <Icon name={fullscreen ? 'fullscreenExit' : 'fullscreen'} size={18} />
          <span>{fullscreen ? 'Вийти' : 'На весь екран'}</span>
        </button>
      </div>
    </header>
    <div className={`popup-runtime-preview is-${viewport}`}>
      {payload && <iframe ref={iframeRef} key={`${payload.campaign.revision}:${viewport}:${leadFormState}`} title="Живий перегляд банера" srcDoc={documentSource} sandbox="allow-scripts allow-same-origin" />}
      {!payload && !error && <div className="popup-runtime-preview__state">Готуємо точне прев’ю…</div>}
      {error && <div className="popup-runtime-preview__state is-error"><Icon name="deadline" size={22} /><span>{error}</span></div>}
      {loading && payload && <span className="popup-runtime-preview__refresh">Оновлюємо…</span>}
    </div>
  </div>;
  // Escape the sticky editor column's stacking context, including the app sidebar and topbar.
  return fullscreen ? createPortal(preview, document.body) : preview;
}

export function PopupBannersPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const confirm = useConfirmDialog();
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<PopupCampaignInput>(() => emptyCampaign());
  const [tab, setTab] = useState<EditorTab>('content');
  const [productText, setProductText] = useState('');
  const [promoProducts, setPromoProducts] = useState<PopupPromoProduct[]>([]);
  const [selectedPromoCode, setSelectedPromoCode] = useState<PromoCode | PromoCodeSnapshot | null>(null);
  const [promoCodePickerOpen, setPromoCodePickerOpen] = useState(false);
  const [promoCatalogSearch, setPromoCatalogSearch] = useState('');
  const [promoCategory, setPromoCategory] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [choosingType, setChoosingType] = useState(false);
  const [campaignSearch, setCampaignSearch] = useState('');
  const [campaignFilter, setCampaignFilter] = useState<CampaignFilter>('all');
  const campaigns = useQuery({ queryKey: ['popup-campaigns'], queryFn: api.popupBanners.list });
  const options = useQuery({ queryKey: ['popup-campaign-options'], queryFn: api.popupBanners.options });
  const promoCatalog = useQuery({
    queryKey: ['popup-campaign-catalog', promoCatalogSearch, promoCategory],
    queryFn: ({ signal }) => api.popupBanners.catalog({ search: promoCatalogSearch, category: promoCategory, page: 1, pageSize: 60 }, signal),
    enabled: campaignUsesAttachedProducts(draft.campaignType) && !choosingType,
    staleTime: 30_000
  });
  const embed = useQuery({ queryKey: ['popup-embed-code'], queryFn: api.popupBanners.embedCode });
  const contacts = useQuery({
    queryKey: ['popup-campaign-contacts', selectedId],
    queryFn: ({ signal }) => api.popupBanners.contacts(selectedId, { page: 1, pageSize: 100 }, signal),
    enabled: Boolean(selectedId) && draft.campaignType === 'lead_form' && tab === 'contacts'
  });
  const createCampaign = useMutation({ mutationFn: api.popupBanners.create });
  const updateCampaign = useMutation({ mutationFn: ({ id, input }: { id: string; input: PopupCampaignInput }) => api.popupBanners.update(id, input) });
  const changeStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: PopupCampaignStatus }) => api.popupBanners.setStatus(id, status) });
  const removeCampaign = useMutation({ mutationFn: api.popupBanners.remove });
  const selectedCampaign = campaigns.data?.find((item) => item.id === selectedId) || null;
  const saving = createCampaign.isPending || updateCampaign.isPending;
  const isPromoNotification = draft.campaignType === 'product_promo'
    && draft.styles.promoFormat === 'notification';
  const hasAttachedProducts = campaignUsesAttachedProducts(draft.campaignType);
  const supportsExitIntent = campaignSupportsExitIntent(draft.campaignType, draft.targeting.mode);
  const triggerOptions: Array<{ value: PopupTrigger; label: string }> = [
    { value: 'delay', label: 'Через задану затримку' },
    { value: 'scroll', label: 'Після прокручування сторінки' },
    { value: 'inactivity', label: 'Після періоду бездіяльності' },
    ...(supportsExitIntent ? [{ value: 'exit_intent' as const, label: 'Коли покупець збирається вийти' }] : [])
  ];

  const campaignOverview = useMemo(() => {
    const items = campaigns.data || [];
    return {
      active: items.filter((item) => item.status === 'active').length,
      impressions: items.reduce((sum, item) => sum + item.stats.impressions, 0),
        actions: items.reduce((sum, item) => sum + item.stats.acknowledgements + item.stats.clicks + item.stats.copies + item.stats.promoCtaClicks + item.stats.contacts, 0)
    };
  }, [campaigns.data]);

  const visibleCampaigns = useMemo(() => {
    const query = campaignSearch.trim().toLocaleLowerCase('uk-UA');
    return (campaigns.data || []).filter((campaign) => {
      if (campaignFilter !== 'all' && campaign.status !== campaignFilter) return false;
      return !query || campaign.name.toLocaleLowerCase('uk-UA').includes(query);
    });
  }, [campaignFilter, campaignSearch, campaigns.data]);

  useEffect(() => {
    if (selectedId || isCreating || !campaigns.data) return;
    const campaign = campaigns.data[0];
    if (!campaign) {
      setIsCreating(true);
      setChoosingType(true);
      return;
    }
    setSelectedId(campaign.id);
    setDraft(campaignInput(campaign));
    setProductText(campaign.productTargets.map((item) => item.sku).join('\n'));
    setPromoProducts(campaign.promoProducts);
    setSelectedPromoCode(campaign.promoCode);
  }, [campaigns.data, isCreating, selectedId]);

  const promoCatalogOffers = useMemo(() => (promoCatalog.data?.items || []).flatMap((product) => {
    const modifications = product.modifications.filter((item) => item.active && item.visible);
    return modifications.length ? modifications.map((item) => promoOffer(product, item)) : [promoOffer(product)];
  }), [promoCatalog.data?.items]);
  const selectedPromoKeys = useMemo(() => new Set(promoProducts.map(promoKey)), [promoProducts]);

  const targetSummary = useMemo(() => {
    const target = draft.targeting;
    if (target.mode === 'out_of_stock') return `${target.recommendationLimit} альтернатив із тієї самої категорії`;
    if (target.mode === 'target_page') return target.targetPageUrl ? 'Одна цільова сторінка' : 'Вкажіть посилання';
    if (target.mode === 'all_pages') return 'Усі сторінки сайту';
    if (target.mode === 'all_products') return 'Усі сторінки товарів';
    if (target.mode === 'products') return `${inputLines(productText).length} вказаних позицій`;
    const count = target.stickers.length + target.brands.length + target.categoryIds.length
      + target.conditions.length + target.urlContains.length;
    return `${count} умов · ${target.match === 'all' ? 'усі одночасно' : 'будь-яка'}`;
  }, [draft.targeting, productText]);

  const currentInput = useMemo(() => ({
    ...draft,
    productEntries: inputLines(productText),
    promoItems: promoProducts.map((item) => ({
      productExternalId: item.productExternalId,
      modificationExternalId: item.modificationExternalId
    }))
  }), [draft, productText, promoProducts]);
  const targetPageMissing = draft.targeting.mode === 'target_page' && !draft.targeting.targetPageUrl.trim();
  const timerInvalid = draft.campaignType === 'countdown' && (
    (draft.timerConfig.mode === 'deadline' && !draft.timerConfig.deadlineAt)
    || !Number.isInteger(draft.timerConfig.durationMinutes)
    || draft.timerConfig.durationMinutes < 1 || draft.timerConfig.durationMinutes > 43200
  );
  const isDirty = useMemo(() => {
    if (isCreating || !selectedCampaign) return true;
    return JSON.stringify(currentInput) !== JSON.stringify(campaignInput(selectedCampaign));
  }, [currentInput, isCreating, selectedCampaign]);

  const behaviorSummary = draft.behavior.frequency === 'product'
    ? 'Раз для кожного товару'
    : draft.behavior.frequency === 'session'
      ? 'Раз за сесію'
      : draft.behavior.frequency === 'hours'
        ? `Раз на ${draft.behavior.cooldownHours} год.`
      : draft.behavior.frequency === 'days'
        ? `Раз на ${draft.behavior.cooldownDays} дн.`
        : 'Кожен перегляд';

  function editCampaign(campaign: PopupCampaign) {
    setSelectedId(campaign.id);
    setIsCreating(false);
    setChoosingType(false);
    setDraft(campaignInput(campaign));
    setProductText(campaign.productTargets.map((item) => item.sku).join('\n'));
    setPromoProducts(campaign.promoProducts);
    setSelectedPromoCode(campaign.promoCode);
    setTab('content');
  }

  function createNew() {
    setSelectedId('');
    setIsCreating(true);
    setChoosingType(true);
    setDraft(emptyCampaign());
    setProductText('');
    setPromoProducts([]);
    setSelectedPromoCode(null);
    setTab('content');
  }

  function beginCampaign(campaignType: PopupCampaignType) {
    setDraft(emptyCampaign(campaignType));
    setProductText('');
    setPromoProducts([]);
    setSelectedPromoCode(null);
    setChoosingType(false);
    setTab('content');
  }

  function addPromoProduct(product: PopupPromoProduct) {
    if (selectedPromoKeys.has(promoKey(product)) || promoProducts.length >= 12) return;
    setPromoProducts((current) => [...current, { ...product, position: current.length }]);
  }

  function movePromoProduct(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= promoProducts.length) return;
    setPromoProducts((current) => {
      const items = [...current];
      [items[index], items[target]] = [items[target], items[index]];
      return items.map((item, position) => ({ ...item, position }));
    });
  }

  function updateTargeting(patch: Partial<PopupTargeting>) {
    setDraft((current) => ({ ...current, targeting: { ...current.targeting, ...patch } }));
  }

  function changeTargetMode(mode: PopupTargetMode) {
    setDraft((current) => {
      const isFirstOutOfStockSetup = mode === 'out_of_stock' && current.targeting.mode !== 'out_of_stock';
      const hasDefaultCopy = current.content.title === 'Зверніть увагу'
        && current.content.body === 'Перед оформленням замовлення ознайомтеся з важливою інформацією про товар.';
      return {
        ...current,
        campaignType: ['product_promo', 'promo_code', 'lead_form', 'countdown'].includes(current.campaignType)
          ? current.campaignType
          : mode === 'out_of_stock' ? 'out_of_stock_recommendations' : 'message',
        name: isFirstOutOfStockSetup && current.name === 'Попередження про товар'
          ? 'Альтернативи для відсутнього товару' : current.name,
        content: isFirstOutOfStockSetup && hasDefaultCopy ? {
          ...current.content,
          eyebrow: 'Товар тимчасово недоступний',
          title: 'Цього товару зараз немає в наявності',
          body: 'Оберіть схожу модель із цієї самої категорії — усі запропоновані товари доступні для замовлення.'
        } : current.content,
        styles: isFirstOutOfStockSetup ? {
          ...current.styles,
          layout: 'modal',
          maxWidth: Math.max(960, current.styles.maxWidth)
        } : current.styles,
        behavior: {
          ...current.behavior,
          ...(isFirstOutOfStockSetup ? {
            frequency: 'always' as const,
            requireAcknowledgement: false,
            buttonCount: 1 as const
          } : {}),
          ...(mode === 'out_of_stock' && current.behavior.trigger === 'exit_intent'
            ? { trigger: 'delay' as const }
            : {})
        },
        targeting: { ...current.targeting, mode }
      };
    });
  }

  function toggleRule(key: 'stickers' | 'brands' | 'categoryIds' | 'conditions', value: string) {
    if (!value) return;
    const current = draft.targeting[key];
    updateTargeting({ [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] });
  }

  function updateLeadField(fieldId: string, patch: Partial<PopupLeadField>) {
    setDraft((current) => ({
      ...current,
      formConfig: {
        ...current.formConfig,
        fields: current.formConfig.fields.map((field) => field.id === fieldId ? { ...field, ...patch } : field)
      }
    }));
  }

  function updateLeadBlock(blockId: string, patch: Partial<PopupLeadBlock>) {
    setDraft((current) => ({
      ...current,
      formConfig: {
        ...current.formConfig,
        blocks: current.formConfig.blocks.map((block) => block.id === blockId ? { ...block, ...patch } : block)
      }
    }));
  }

  function resizeLeadBlock(blockId: string, requestedCount: number) {
    setDraft((current) => {
      const block = current.formConfig.blocks.find((candidate) => candidate.id === blockId);
      if (!block) return current;
      const count = Math.min(4, Math.max(1, requestedCount));
      if (count === block.fieldIds.length) return current;
      if (count < block.fieldIds.length) {
        const removedIds = new Set(block.fieldIds.slice(count));
        return {
          ...current,
          formConfig: {
            ...current.formConfig,
            fields: current.formConfig.fields.filter((field) => !removedIds.has(field.id)),
            blocks: current.formConfig.blocks.map((candidate) => candidate.id === blockId
              ? { ...candidate, fieldIds: candidate.fieldIds.slice(0, count) } : candidate)
          }
        };
      }
      const available = 12 - current.formConfig.fields.length;
      const additions = Array.from({ length: Math.min(count - block.fieldIds.length, available) }, (_, index) => (
        newLeadField(current.formConfig.fields.length + index + 1)
      ));
      return {
        ...current,
        formConfig: {
          ...current.formConfig,
          fields: [...current.formConfig.fields, ...additions],
          blocks: current.formConfig.blocks.map((candidate) => candidate.id === blockId
            ? { ...candidate, fieldIds: [...candidate.fieldIds, ...additions.map((field) => field.id)] } : candidate)
        }
      };
    });
  }

  function moveLeadBlock(index: number, direction: -1 | 1) {
    setDraft((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.formConfig.blocks.length) return current;
      const blocks = [...current.formConfig.blocks];
      [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
      return { ...current, formConfig: { ...current.formConfig, blocks } };
    });
  }

  function removeLeadBlock(blockId: string) {
    setDraft((current) => {
      if (current.formConfig.blocks.length <= 1) return current;
      const removed = current.formConfig.blocks.find((block) => block.id === blockId);
      if (!removed) return current;
      const removedIds = new Set(removed.fieldIds);
      return {
        ...current,
        formConfig: {
          ...current.formConfig,
          fields: current.formConfig.fields.filter((field) => !removedIds.has(field.id)),
          blocks: current.formConfig.blocks.filter((block) => block.id !== blockId)
        }
      };
    });
  }

  function addLeadBlock() {
    setDraft((current) => {
      if (current.formConfig.fields.length >= 12) return current;
      const addition = newLeadBlock(current.formConfig.blocks.length + 1);
      return {
        ...current,
        formConfig: {
          ...current.formConfig,
          fields: [...current.formConfig.fields, addition.field],
          blocks: [...current.formConfig.blocks, addition.block]
        }
      };
    });
  }

  async function save() {
    const input = currentInput;
    try {
      const saved = isCreating
        ? await createCampaign.mutateAsync(input)
        : await updateCampaign.mutateAsync({ id: selectedId, input });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['popup-campaigns'] }),
        queryClient.invalidateQueries({ queryKey: ['popup-campaign-options'] })
      ]);
      setSelectedId(saved.id);
      setIsCreating(false);
      setDraft(campaignInput(saved));
      setProductText(saved.productTargets.map((item) => item.sku).join('\n'));
      setPromoProducts(saved.promoProducts);
      setSelectedPromoCode(saved.promoCode);
      const missed = saved.resolution?.unmatched || [];
      showToast(missed.length ? `Кампанію збережено. Не знайдено позицій: ${missed.length}.` : 'Попап-кампанію збережено.', missed.length ? 'error' : 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти кампанію.', 'error');
    }
  }

  async function setStatus(status: PopupCampaignStatus) {
    if (!selectedId) return;
    try {
      const updated = await changeStatus.mutateAsync({ id: selectedId, status });
      queryClient.setQueryData<PopupCampaign[]>(['popup-campaigns'], (current = []) => current.map((item) => item.id === updated.id ? updated : item));
      showToast(status === 'active' ? 'Кампанію опубліковано.' : status === 'paused' ? 'Кампанію призупинено.' : 'Кампанію повернено у чернетки.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося змінити статус.', 'error');
    }
  }

  async function remove() {
    if (!selectedId || !await confirm({
      title: 'Видалити попап-кампанію?',
      message: 'Кампанію, її версії, товарні прив’язки та статистику буде видалено безповоротно.',
      confirmLabel: 'Видалити',
      tone: 'danger'
    })) return;
    try {
      await removeCampaign.mutateAsync(selectedId);
      await queryClient.invalidateQueries({ queryKey: ['popup-campaigns'] });
      createNew();
      showToast('Кампанію видалено.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося видалити кампанію.', 'error');
    }
  }

  async function copyEmbed() {
    if (!embed.data?.code) return;
    try {
      await navigator.clipboard.writeText(embed.data.code);
      showToast('Код віджета скопійовано.', 'success');
    } catch {
      showToast('Не вдалося скопіювати код.', 'error');
    }
  }

  const stickerOptions = (options.data?.stickers || []).map((item) => ({
    value: item.id || item.title.toLocaleLowerCase('uk-UA'),
    label: item.title
  }));
  const brandOptions = (options.data?.brands || []).map((item) => ({ value: item, label: item }));
  const categoryOptions = (options.data?.categories || []).map((item) => ({ value: item.id, label: item.title || item.id }));
  const promoCategoryOptions = [
    { value: '', label: 'Усі категорії' },
    ...(promoCatalog.data?.categories || []).map((item) => ({
      value: item.externalId,
      label: `${localizedTitle(item.titles) || item.externalId} (${item.productCount})`
    }))
  ];
  const conditionOptions = (options.data?.conditions || []).map((item) => ({ value: item, label: item }));
  const campaignLibrary = <section className="popup-campaign-list popup-campaign-list--tab">
    <header className="popup-campaign-list__header">
      <div><span className="popup-campaign-list__icon"><Icon name="popup" size={19} /></span><div><small>БІБЛІОТЕКА</small><strong>Кампанії</strong></div></div>
      <div className="popup-campaign-list__header-actions">
        <a className="button button--secondary button--small" href="/api/popup-banners/contacts/export"><Icon name="download" size={17} /> Усі контакти</a>
        <button className="button button--primary button--small" type="button" onClick={createNew}><Icon name="add" size={17} /> Нова кампанія</button>
      </div>
    </header>
    <div className="popup-campaign-overview">
      <span><strong>{campaigns.data?.length || 0}</strong><small>всього</small></span>
      <span><strong>{campaignOverview.active}</strong><small>активні</small></span>
      <span><strong>{campaignOverview.impressions}</strong><small>покази</small></span>
    </div>
    <div className="popup-campaign-list__tools">
      <label className="popup-campaign-search">
        <Icon name="search" size={18} />
        <input value={campaignSearch} onChange={(event) => setCampaignSearch(event.target.value)} placeholder="Знайти кампанію" aria-label="Пошук кампаній" />
      </label>
      <div className="popup-campaign-filters" role="group" aria-label="Фільтр кампаній">
        {([['all', 'Усі'], ['active', 'Активні'], ['draft', 'Чернетки'], ['paused', 'Пауза']] as Array<[CampaignFilter, string]>).map(([value, label]) => <button type="button" className={campaignFilter === value ? 'is-active' : ''} onClick={() => setCampaignFilter(value)} key={value}>{label}</button>)}
      </div>
    </div>
    {campaigns.isLoading && <div className="popup-list-state">Завантажуємо кампанії…</div>}
    {campaigns.isError && <div className="popup-list-state is-error">Не вдалося завантажити кампанії.</div>}
    {!campaigns.isLoading && !campaigns.data?.length && <div className="popup-list-state"><span><Icon name="popup" size={25} /></span><strong>Кампаній ще немає</strong><small>Створіть перше повідомлення для покупців.</small><button className="button button--primary button--small" type="button" onClick={createNew}>Створити кампанію</button></div>}
    {!campaigns.isLoading && Boolean(campaigns.data?.length) && !visibleCampaigns.length && <div className="popup-list-state"><strong>Нічого не знайдено</strong><small>Змініть пошук або фільтр статусу.</small></div>}
    <div className="popup-campaign-list__items">
      {visibleCampaigns.map((campaign) => <button type="button" className={campaign.id === selectedId && !isCreating ? 'is-active' : ''} key={campaign.id} onClick={() => editCampaign(campaign)}>
        <span className="popup-campaign-list__row"><span className={`popup-status is-${campaign.status}`}><i />{statusLabels[campaign.status]}</span><small>{formatDate(campaign.updatedAt)}</small></span>
        <strong>{campaign.name}</strong>
        <small>{campaignTypeLabels[campaign.campaignType]} · {campaignUsesAttachedProducts(campaign.campaignType) ? `${campaign.promoProducts.length} товарів` : campaign.targeting.mode === 'products' ? `${campaign.productTargets.length} позицій` : targetModeLabels[campaign.targeting.mode]}</small>
        <span className="popup-campaign-list__stats"><span><b>{campaign.stats.impressions}</b> показів</span><span><b>{campaign.campaignType === 'lead_form' ? campaign.stats.contacts : campaign.stats.acknowledgements + campaign.stats.clicks + campaign.stats.copies + campaign.stats.promoCtaClicks}</b> {campaign.campaignType === 'lead_form' ? 'контактів' : 'дій'}</span></span>
      </button>)}
    </div>
    <footer className="popup-campaign-list__footer"><Icon name="visibility" size={15} /><span>Усього взаємодій: <strong>{campaignOverview.actions}</strong></span></footer>
  </section>;

  return <div className="popup-banners-page">
    <header className="popup-banners-header">
      <div className="popup-banners-header__copy">
        <p className="eyebrow">Комунікація на сайті</p>
        <h1>Попап-банери</h1>
        <p>Створюйте охайні повідомлення та показуйте їх потрібним покупцям у потрібний момент.</p>
      </div>
      <div className="popup-banners-header__actions">
        <Link className="button button--secondary" to="/tools/promo-codes"><Icon name="copy" size={17} /> Промокоди</Link>
        <button className="button button--secondary" type="button" onClick={() => void copyEmbed()} disabled={!embed.data?.code}><Icon name="copy" size={17} /> Код для сайту</button>
        <button className="button button--primary" type="button" onClick={createNew}><Icon name="add" size={18} /> Нова кампанія</button>
      </div>
    </header>

    {!options.isLoading && !options.data?.integration && <div className="popup-connection is-warning">
      <span className="popup-connection__icon"><Icon name="integrations" size={21} /></span>
      <div><strong>Хорошоп не підключено</strong><small>Підключіть магазин і синхронізуйте каталог, щоб налаштовувати товарні кампанії.</small></div>
    </div>}
    {options.data?.integration && <div className="popup-connection is-connected">
      <span className="popup-connection__icon"><Icon name="storefront" size={20} /></span>
      <div><strong>{options.data.integration.storeDomain}</strong><small>Каталог підключено · остання синхронізація {formatDate(options.data.integration.lastSyncAt)}</small></div>
      <span className="popup-connection__badge"><i /> Підключено</span>
    </div>}

    <div className="popup-banners-workspace">
      <main className="popup-editor">
        {choosingType ? <CampaignTypePicker onSelect={beginCampaign} /> : <>
        <header className="popup-editor__header">
          <div className="popup-editor__identity">
            <div><span className={`popup-status is-${selectedCampaign?.status || 'draft'}`}><i />{isCreating ? 'Нова кампанія' : statusLabels[selectedCampaign?.status || 'draft']}</span>{isDirty && <small className="popup-unsaved"><i /> Є незбережені зміни</small>}</div>
            <input value={draft.name} maxLength={160} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} aria-label="Назва кампанії" placeholder="Назва кампанії" />
            <p>{targetSummary} · {behaviorSummary}</p>
          </div>
          <div className="popup-editor__actions">
            {!isCreating && selectedCampaign?.status !== 'active' && <button className="button button--secondary button--small" type="button" onClick={() => void setStatus('active')} disabled={changeStatus.isPending || isDirty}><Icon name="publication" size={16} /> Опублікувати</button>}
            {!isCreating && selectedCampaign?.status === 'active' && <button className="button button--secondary button--small" type="button" onClick={() => void setStatus('paused')} disabled={changeStatus.isPending}><Icon name="deadline" size={16} /> Призупинити</button>}
            {!isCreating && <button className="icon-button icon-button--danger" type="button" onClick={() => void remove()} aria-label="Видалити кампанію"><Icon name="delete" size={18} /></button>}
            <button className="button button--primary button--small" type="button" onClick={() => void save()} disabled={saving || !options.data?.integration || !draft.name.trim() || targetPageMissing || timerInvalid || (hasAttachedProducts && !promoProducts.length) || (['promo_code', 'lead_form'].includes(draft.campaignType) && !draft.promoCodeId) || (draft.campaignType === 'lead_form' && !draft.formConfig.fields.length) || !isDirty}><Icon name="save" size={16} /> {saving ? 'Зберігаємо…' : 'Зберегти'}</button>
          </div>
        </header>

        <nav className="popup-editor-tabs" aria-label="Розділи конструктора">
          {([
            ['library', 'catalog', 'Бібліотека', `${campaigns.data?.length || 0} кампаній`],
            ['content', 'popup', 'Контент і дизайн', draft.campaignType === 'product_promo' ? 'Плаваюча панель · без оверлею' : `${layoutLabels[draft.styles.layout]} · ${draft.styles.maxWidth}px`],
            ...(hasAttachedProducts ? [['products', 'catalog', 'Товари банера', `${promoProducts.length} із 12`]] : []),
            ...(draft.campaignType === 'lead_form' ? [['contacts', 'users', 'Зібрані контакти', `${selectedCampaign?.stats.contacts || 0} записів`]] : []),
            ['targeting', 'productSelection', 'Умови показу', targetSummary],
            ['behavior', 'schedule', 'Поведінка й розклад', behaviorSummary]
          ] as Array<[EditorTab, Parameters<typeof Icon>[0]['name'], string, string]>).map(([value, icon, label, summary], index) => <button type="button" className={tab === value ? 'is-active' : ''} onClick={() => setTab(value)} key={value}>
            <span className="popup-editor-tabs__number">{index + 1}</span>
            <span className="popup-editor-tabs__icon"><Icon name={icon} size={18} /></span>
            <span><strong>{label}</strong><small>{summary}</small></span>
            <Icon name="arrow" size={17} />
          </button>)}
        </nav>

        <div className={`popup-editor__body${tab === 'library' ? ' is-library' : ''}`}>
          {tab === 'library' ? campaignLibrary : <>
          <section className="popup-editor__form">
            {tab === 'content' && <>
              <div className="popup-form-section">
                <SectionHeading
                  icon="edit"
                  title={isPromoNotification ? 'Текст сповіщення' : 'Текст повідомлення'}
                  description={isPromoNotification
                    ? 'Заголовок і основний текст необов’язкові. Залиште обидва поля порожніми для суто товарного віджета.'
                    : 'Сформулюйте коротке повідомлення, яке покупець зрозуміє з першого погляду.'}
                />
                {!isPromoNotification && <div className="popup-template-variables"><span>Змінні товару</span><code>{'{{product.title}}'}</code><code>{'{{product.article}}'}</code><code>{'{{product.condition}}'}</code></div>}
                {isPromoNotification ? <div className="popup-form-grid">
                  <label><span>Заголовок <i>необов’язково</i></span><input value={draft.content.title} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, title: event.target.value } }))} placeholder="Наприклад, Вигідна пропозиція" /></label>
                  <label className="is-full"><span>Основний текст <i>необов’язково</i></span><textarea rows={3} value={draft.content.body} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, body: event.target.value } }))} /><small>{draft.content.body.length} символів</small></label>
                </div> : <div className="popup-form-grid">
                  <label><span>Надзаголовок</span><input value={draft.content.eyebrow} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, eyebrow: event.target.value } }))} placeholder="Наприклад, Важлива інформація" /></label>
                  <label><span>Заголовок</span><input value={draft.content.title} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, title: event.target.value } }))} placeholder="Зверніть увагу" /></label>
                  <label className="is-full"><span>Основний текст</span><textarea rows={6} value={draft.content.body} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, body: event.target.value } }))} /><small>{draft.content.body.length} символів</small></label>
                  <label className="is-full"><span>Зображення</span><input type="url" placeholder="https://..." value={draft.content.imageUrl} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, imageUrl: event.target.value } }))} /><small>Необов’язково. Використовуйте пряме HTTPS-посилання.</small></label>
                </div>}
              </div>

              {draft.campaignType === 'countdown' && <div className="popup-form-section">
                <SectionHeading icon="schedule" title="Зворотний відлік" description="Після завершення таймера банер автоматично приховається." />
                <div className="popup-form-grid">
                  <label className="is-full"><span>Режим таймера</span><StyledSelect
                    ariaLabel="Режим таймера"
                    value={draft.timerConfig.mode}
                    onChange={(mode) => setDraft((current) => ({ ...current, timerConfig: {
                      ...current.timerConfig, mode,
                      deadlineAt: mode === 'deadline' && !current.timerConfig.deadlineAt
                        ? new Date(Date.now() + 86400000).toISOString() : current.timerConfig.deadlineAt
                    } }))}
                    options={[{ value: 'duration', label: 'Персональний відлік' }, { value: 'deadline', label: 'До заданої дати й часу' }]}
                  /></label>
                  {draft.timerConfig.mode === 'deadline' ? <label className="is-full"><span>Дата й час завершення таймера</span>
                    <input type="datetime-local" value={localDateTime(draft.timerConfig.deadlineAt)} onChange={(event) => setDraft((current) => ({ ...current, timerConfig: { ...current.timerConfig, deadlineAt: isoDateTime(event.target.value) } }))} />
                    <small>Часовий пояс: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Усі відвідувачі бачать однаковий відлік.</small>
                    {draft.timerConfig.deadlineAt && Date.parse(draft.timerConfig.deadlineAt) <= Date.now() && <small>Цей час уже минув. Вкажіть майбутню дату, щоб опублікувати банер.</small>}
                  </label> : <label className="is-full"><span>Тривалість таймера, хвилин</span>
                    <input type="number" min={1} max={43200} step={1} value={draft.timerConfig.durationMinutes} onChange={(event) => setDraft((current) => ({ ...current, timerConfig: { ...current.timerConfig, durationMinutes: Number(event.target.value) } }))} />
                    <small>Від 1 хвилини до 30 днів. Відлік починається з першого показу та зберігається в браузері між сторінками й перезавантаженнями. Після завершення повторно не запускається.</small>
                  </label>}
                </div>
              </div>}

              {['promo_code', 'lead_form'].includes(draft.campaignType) && <div className="popup-form-section">
                <SectionHeading icon="copy" title="Промокод" description={draft.campaignType === 'lead_form' ? 'Код не передається у браузер до успішного збереження контакту. Під час публікації кампанія отримає незмінний snapshot.' : 'Оберіть код із бібліотеки поточного магазину. Хорошоп залишається джерелом істини, а банер отримає snapshot під час публікації.'} />
                {selectedPromoCode ? <div className="popup-selected-code">
                  <div className="popup-selected-code__identity"><small>Обраний код</small><strong>{selectedPromoCode.internalName}</strong><code>{selectedPromoCode.code}</code></div>
                  <strong className="popup-selected-code__value">{promoCodeValue(selectedPromoCode)}</strong>
                  <span className={`promo-code-status is-${selectedPromoCode.status}`}><i />{selectedPromoCode.status === 'active' ? 'Активний' : selectedPromoCode.status === 'scheduled' ? 'Запланований' : selectedPromoCode.status === 'ended' ? 'Завершений' : 'Вимкнений'}</span>
                  <button className="button button--secondary button--small" type="button" onClick={() => setPromoCodePickerOpen(true)}>Змінити</button>
                  {(!selectedPromoCode.horoshopConfirmed || selectedPromoCode.status === 'ended' || selectedPromoCode.status === 'disabled') && <p className="popup-selected-code__warning"><Icon name="deadline" size={15} />{!selectedPromoCode.horoshopConfirmed ? 'Код не підтверджено в Хорошоп. Перевірте його перед публікацією.' : selectedPromoCode.status === 'ended' ? 'Термін дії коду завершився.' : 'Запис вимкнено в бібліотеці.'}</p>}
                </div> : <button className="popup-select-code" type="button" onClick={() => setPromoCodePickerOpen(true)}><span><Icon name="copy" size={22} /></span><div><strong>Обрати промокод</strong><small>Пошук, фільтри статусу та створення нового запису</small></div><Icon name="arrow" size={18} /></button>}
                <div className="popup-settings-group">
                  <strong>Вигляд отриманого промокоду</strong>
                  <small>Підкладка та кнопка копіювання налаштовуються окремо від загального акценту банера.</small>
                  <div className="popup-color-grid">
                    <ColorField label="Фон блоку промокоду" value={draft.styles.promoCodeBackgroundColor} onChange={(promoCodeBackgroundColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, promoCodeBackgroundColor } }))} />
                    <ColorField label="Кнопка «Скопіювати»" value={draft.styles.promoCopyButtonBackgroundColor} onChange={(promoCopyButtonBackgroundColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, promoCopyButtonBackgroundColor } }))} />
                    <ColorField label="Текст кнопки «Скопіювати»" value={draft.styles.promoCopyButtonTextColor} onChange={(promoCopyButtonTextColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, promoCopyButtonTextColor } }))} />
                  </div>
                  <OpacityField label="Непрозорість фону промокоду" value={draft.styles.promoCodeBackgroundOpacity} onChange={(promoCodeBackgroundOpacity) => setDraft((current) => ({ ...current, styles: { ...current.styles, promoCodeBackgroundOpacity } }))} />
                </div>
                <div className="popup-snapshot-note"><Icon name="save" size={16} /><span><strong>Опублікована версія не змінюється непомітно</strong><small>Редагування чи архівація коду в бібліотеці потребує повторної публікації кампанії.</small></span></div>
              </div>}

              {draft.campaignType === 'lead_form' && <div className="popup-form-section">
                <SectionHeading icon="formBuilder" title="Блоки контактної форми" description="Задайте кількість полів і розміщення для кожного блоку. Один елемент завжди займає всю ширину." aside={`${draft.formConfig.blocks.length} блоків · ${draft.formConfig.fields.length} із 12 полів`} />
                <div className="popup-lead-blocks">
                  {draft.formConfig.blocks.map((block, blockIndex) => {
                    const blockFields = block.fieldIds.map((fieldId) => draft.formConfig.fields.find((field) => field.id === fieldId)).filter((field): field is PopupLeadField => Boolean(field));
                    const maximumCount = Math.min(4, blockFields.length + 12 - draft.formConfig.fields.length);
                    return <article className="popup-lead-block" key={block.id}>
                      <header className="popup-lead-block__header">
                        <span className="popup-lead-block__position">{blockIndex + 1}</span>
                        <div><strong>Блок {blockIndex + 1}</strong><small>{blockFields.length === 1 ? 'Поле займає 100% ширини' : block.layout === 'row' ? 'Поля в одному рядку' : 'Поля одне під одним'}</small></div>
                        <label><span>Кількість полів</span><StyledSelect value={String(blockFields.length)} options={Array.from({ length: maximumCount }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }))} onChange={(value) => resizeLeadBlock(block.id, Number(value))} ariaLabel={`Кількість полів у блоці ${blockIndex + 1}`} /></label>
                        <label><span>Розміщення</span><StyledSelect value={block.layout} options={[{ value: 'row', label: 'Рядок' }, { value: 'column', label: 'Колонка' }]} onChange={(layout) => updateLeadBlock(block.id, { layout: layout as PopupLeadBlockLayout })} ariaLabel={`Розміщення блоку ${blockIndex + 1}`} /></label>
                        <span className="popup-lead-block__actions">
                          <button className="icon-button" type="button" disabled={blockIndex === 0} onClick={() => moveLeadBlock(blockIndex, -1)} aria-label="Перемістити блок вище"><Icon name="arrowUp" size={16} /></button>
                          <button className="icon-button" type="button" disabled={blockIndex === draft.formConfig.blocks.length - 1} onClick={() => moveLeadBlock(blockIndex, 1)} aria-label="Перемістити блок нижче"><Icon name="arrowDown" size={16} /></button>
                          <button className="icon-button icon-button--danger" type="button" disabled={draft.formConfig.blocks.length === 1} onClick={() => removeLeadBlock(block.id)} aria-label="Видалити блок"><Icon name="delete" size={16} /></button>
                        </span>
                      </header>
                      <div className={`popup-lead-block__fields is-${block.layout}${blockFields.length === 1 ? ' is-single' : ''}`}>
                        {blockFields.map((field, fieldIndex) => <section className="popup-lead-field" key={field.id}>
                          <div className="popup-lead-field__heading"><strong>Поле {blockIndex + 1}.{fieldIndex + 1}</strong><small>{leadFieldTypeOptions.find((option) => option.value === field.type)?.label}</small></div>
                          <div className="popup-lead-field__grid">
                            <label><span>Назва поля <i>необов’язково</i></span><input value={field.label} maxLength={120} onChange={(event) => updateLeadField(field.id, { label: event.target.value })} /></label>
                            <label><span>Тип</span><StyledSelect value={field.type} options={leadFieldTypeOptions} onChange={(type) => updateLeadField(field.id, { type, options: type === 'select' ? field.options : [] })} ariaLabel={`Тип поля ${field.label || `${blockIndex + 1}.${fieldIndex + 1}`}`} /></label>
                            {field.type !== 'checkbox' && <label><span>Підказка <i>необов’язково</i></span><input value={field.placeholder} maxLength={200} onChange={(event) => updateLeadField(field.id, { placeholder: event.target.value })} /></label>}
                            {field.type === 'select' && <label className="is-full"><span>Варіанти — по одному з рядка</span><textarea rows={3} value={field.options.join('\n')} onChange={(event) => updateLeadField(field.id, { options: inputLines(event.target.value).slice(0, 20) })} /></label>}
                            <label className="popup-lead-field__required"><input type="checkbox" checked={field.required} onChange={(event) => updateLeadField(field.id, { required: event.target.checked })} /><span>{field.type === 'checkbox' ? 'Потрібна згода' : 'Обов’язкове поле'}</span></label>
                          </div>
                        </section>)}
                      </div>
                    </article>;
                  })}
                </div>
                <button className="button button--secondary" type="button" disabled={draft.formConfig.fields.length >= 12} onClick={addLeadBlock}><Icon name="add" size={17} /> Додати блок</button>
                <div className="popup-form-grid popup-lead-result-settings">
                  <label><span>Кнопка відправлення</span><input value={draft.formConfig.submitLabel} maxLength={120} onChange={(event) => setDraft((current) => ({ ...current, formConfig: { ...current.formConfig, submitLabel: event.target.value } }))} /></label>
                  <label><span>Заголовок після відправлення</span><input value={draft.formConfig.successTitle} maxLength={240} onChange={(event) => setDraft((current) => ({ ...current, formConfig: { ...current.formConfig, successTitle: event.target.value } }))} /></label>
                  <label className="is-full"><span>Текст після відправлення</span><textarea rows={3} value={draft.formConfig.successBody} maxLength={1000} onChange={(event) => setDraft((current) => ({ ...current, formConfig: { ...current.formConfig, successBody: event.target.value } }))} /></label>
                </div>
                <div className="popup-settings-group">
                  <strong>Кнопка форми</strong>
                  <small>Окремо задайте фон і колір тексту кнопки, яка надсилає контактні дані.</small>
                  <div className="popup-color-grid is-pair">
                    <ColorField label="Колір кнопки форми" value={draft.styles.primaryButtonBackgroundColor} onChange={(primaryButtonBackgroundColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, primaryButtonBackgroundColor } }))} />
                    <ColorField label="Колір тексту кнопки форми" value={draft.styles.primaryButtonTextColor} onChange={(primaryButtonTextColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, primaryButtonTextColor } }))} />
                  </div>
                </div>
              </div>}

              {draft.campaignType !== 'lead_form' && (draft.campaignType === 'promo_code' ? <div className="popup-form-section">
                <SectionHeading icon="link" title="CTA банера" description="Кнопка переходу необов’язкова. Кнопка копіювання коду відображається завжди." />
                <div className="popup-form-grid">
                  <label><span>Текст CTA <i>необов’язково</i></span><input value={draft.content.primaryLabel} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, primaryLabel: event.target.value } }))} placeholder="Перейти до акції" /></label>
                  <label><span>Посилання CTA <i>необов’язково</i></span><input type="url" value={draft.content.primaryUrl} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, primaryUrl: event.target.value } }))} placeholder="https://... або /шлях/" /></label>
                </div>
                <div className="popup-color-grid is-pair">
                  <ColorField label="Колір CTA" value={draft.styles.primaryButtonBackgroundColor} onChange={(primaryButtonBackgroundColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, primaryButtonBackgroundColor } }))} />
                  <ColorField label="Колір тексту" value={draft.styles.primaryButtonTextColor} onChange={(primaryButtonTextColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, primaryButtonTextColor } }))} />
                </div>
              </div> : draft.targeting.mode !== 'out_of_stock' && !hasAttachedProducts ? <div className="popup-form-section">
                <SectionHeading icon="link" title="Кнопки й дія" description="Назвіть дію зрозуміло та вкажіть сторінку, куди вона веде." />
                <div className="popup-form-grid">
                  <label><span>Кількість кнопок</span><StyledSelect value={String(draft.behavior.buttonCount)} options={[{ value: '1', label: 'Одна кнопка' }, { value: '2', label: 'Дві кнопки' }]} onChange={(value) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, buttonCount: Number(value) as 1 | 2 } }))} ariaLabel="Кількість кнопок" /></label>
                  <label><span>Основна кнопка</span><input value={draft.content.primaryLabel} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, primaryLabel: event.target.value } }))} /></label>
                  {draft.behavior.buttonCount === 2 && <label><span>Додаткова кнопка</span><input value={draft.content.secondaryLabel} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, secondaryLabel: event.target.value } }))} /></label>}
                  <label className="is-full"><span>Посилання основної кнопки</span><input type="url" placeholder="https://... або /шлях/" value={draft.content.primaryUrl} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, primaryUrl: event.target.value } }))} /></label>
                </div>
                <div className="popup-color-groups">
                  <div><strong>Основна кнопка</strong><div className="popup-color-grid is-pair">
                    <ColorField label="Колір кнопки" value={draft.styles.primaryButtonBackgroundColor} onChange={(primaryButtonBackgroundColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, primaryButtonBackgroundColor } }))} />
                    <ColorField label="Колір тексту" value={draft.styles.primaryButtonTextColor} onChange={(primaryButtonTextColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, primaryButtonTextColor } }))} />
                  </div></div>
                  {draft.behavior.buttonCount === 2 && <div><strong>Додаткова кнопка</strong><div className="popup-color-grid is-pair">
                    <ColorField label="Колір кнопки" value={draft.styles.secondaryButtonBackgroundColor} onChange={(secondaryButtonBackgroundColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, secondaryButtonBackgroundColor } }))} />
                    <ColorField label="Колір тексту" value={draft.styles.secondaryButtonTextColor} onChange={(secondaryButtonTextColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, secondaryButtonTextColor } }))} />
                  </div></div>}
                </div>
              </div> : <div className="popup-form-section">
                <SectionHeading icon="productCard" title="Кнопки товарів" description="Кнопка на кожній картці додає вибраний товар через нативний кошик Хорошоп." />
                {hasAttachedProducts && <div className="popup-form-grid">
                  <label><span>Текст кнопки</span><input value={draft.content.primaryLabel} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, primaryLabel: event.target.value } }))} /></label>
                  <label><span>Заокруглення кнопки, px</span><input type="number" min={0} max={40} value={draft.styles.buttonBorderRadius} onChange={(event) => setDraft((current) => ({ ...current, styles: { ...current.styles, buttonBorderRadius: Number(event.target.value) } }))} /></label>
                </div>}
                <div className="popup-color-grid is-pair">
                  <ColorField label="Колір кнопки" value={draft.styles.primaryButtonBackgroundColor} onChange={(primaryButtonBackgroundColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, primaryButtonBackgroundColor } }))} />
                  <ColorField label="Колір тексту" value={draft.styles.primaryButtonTextColor} onChange={(primaryButtonTextColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, primaryButtonTextColor } }))} />
                </div>
              </div>)}

              <div className="popup-form-section">
                <SectionHeading icon="productCard" title="Вигляд попапа" description="Оберіть розташування, кольори та комфортний розмір повідомлення." />
                {draft.campaignType === 'product_promo' ? <>
                  <div className="popup-nonblocking-note"><Icon name="check" size={18} /><span><strong>Неблокуюча плаваюча панель</strong><small>Затемнення, блокування сторінки та перехоплення кліків поза банером не використовуються.</small></span></div>
                  <div className="popup-settings-group">
                    <strong>Формат банера</strong>
                    <small>«Сповіщення» повторює компактну логіку Elfsight: у кадрі один товар, а добірка змінюється автоматично.</small>
                    <PromoFormatPicker value={draft.styles.promoFormat} onChange={(preset) => setDraft((current) => ({
                      ...current,
                      styles: { ...current.styles, promoFormat: preset.value, maxWidth: preset.width }
                    }))} />
                    {draft.styles.promoFormat === 'compact' && <Toggle
                      checked={draft.styles.showPromoTitle}
                      label="Показувати заголовок кампанії"
                      description="Перемикач керує лише заголовком кампанії. Основний текст і назва товару не змінюються."
                      onChange={(showPromoTitle) => setDraft((current) => ({ ...current, styles: { ...current.styles, showPromoTitle } }))}
                    />}
                  </div>
                  <div className="popup-settings-group">
                    <strong>Положення банера</strong>
                    <small>Desktop і mobile налаштовуються окремо, оскільки це різні вітрини Хорошопа.</small>
                    <PromoPositionPicker
                      desktop={draft.styles.desktopPosition}
                      mobile={draft.styles.mobilePosition}
                      onDesktop={(desktopPosition) => setDraft((current) => ({ ...current, styles: { ...current.styles, desktopPosition } }))}
                      onMobile={(mobilePosition) => setDraft((current) => ({ ...current, styles: { ...current.styles, mobilePosition } }))}
                    />
                  </div>
                </> : <LayoutPicker value={draft.styles.layout} onChange={(layout) => setDraft((current) => ({ ...current, styles: { ...current.styles, layout } }))} />}
                <div className="popup-color-grid is-base">
                  <ColorField label="Акцент" value={draft.styles.accentColor} onChange={(accentColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, accentColor } }))} />
                  <ColorField label="Фон" value={draft.styles.backgroundColor} onChange={(backgroundColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, backgroundColor } }))} />
                  <ColorField label="Заголовок" value={draft.styles.textColor} onChange={(textColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, textColor } }))} />
                  <ColorField label="Основний текст" value={draft.styles.mutedColor} onChange={(mutedColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, mutedColor } }))} />
                </div>
                {draft.campaignType === 'product_promo' && <div className="popup-settings-group">
                  <strong>Часова лінія ротації</strong>
                  <small>Лінія з’являється, якщо у банері вибрано щонайменше два товари.</small>
                  <div className="popup-color-grid is-pair">
                    <ColorField label="Колір прогресу" value={draft.styles.timelineColor} onChange={(timelineColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, timelineColor } }))} />
                    <ColorField label="Колір підкладки" value={draft.styles.timelineTrackColor} onChange={(timelineTrackColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, timelineTrackColor } }))} />
                  </div>
                </div>}
                <div className="popup-settings-group">
                  <strong>Розміри шрифту</strong>
                  <div className="popup-form-grid popup-font-grid">
                    <label><span>Надзаголовок, px</span><input type="number" min={8} max={32} value={draft.styles.eyebrowFontSize} onChange={(event) => setDraft((current) => ({ ...current, styles: { ...current.styles, eyebrowFontSize: Number(event.target.value) } }))} /></label>
                    <label><span>Заголовок, px</span><input type="number" min={18} max={72} value={draft.styles.titleFontSize} onChange={(event) => setDraft((current) => ({ ...current, styles: { ...current.styles, titleFontSize: Number(event.target.value) } }))} /></label>
                    <label><span>Основний текст, px</span><input type="number" min={10} max={36} value={draft.styles.bodyFontSize} onChange={(event) => setDraft((current) => ({ ...current, styles: { ...current.styles, bodyFontSize: Number(event.target.value) } }))} /></label>
                  {draft.targeting.mode !== 'out_of_stock' && !['product_promo', 'promo_code', 'lead_form', 'countdown'].includes(draft.campaignType) && <label><span>Підтвердження, px</span><input type="number" min={10} max={28} value={draft.styles.acknowledgementFontSize} onChange={(event) => setDraft((current) => ({ ...current, styles: { ...current.styles, acknowledgementFontSize: Number(event.target.value) } }))} /></label>}
                    <label><span>Кнопки, px</span><input type="number" min={10} max={28} value={draft.styles.buttonFontSize} onChange={(event) => setDraft((current) => ({ ...current, styles: { ...current.styles, buttonFontSize: Number(event.target.value) } }))} /></label>
                  </div>
                </div>
                {draft.targeting.mode !== 'out_of_stock' && !['product_promo', 'promo_code', 'lead_form', 'countdown'].includes(draft.campaignType) && <div className="popup-settings-group">
                  <strong>Стиль чекбокса підтвердження</strong>
                  <small>Ці кольори застосуються, коли в розділі поведінки увімкнено явне підтвердження.</small>
                  <div className="popup-color-grid">
                    <ColorField label="Колір чекбокса" value={draft.styles.checkboxAccentColor} onChange={(checkboxAccentColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, checkboxAccentColor } }))} />
                    <ColorField label="Колір галочки" value={draft.styles.checkboxCheckColor} onChange={(checkboxCheckColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, checkboxCheckColor } }))} />
                    <ColorField label="Колір тексту чекбокса" value={draft.styles.checkboxTextColor} onChange={(checkboxTextColor) => setDraft((current) => ({ ...current, styles: { ...current.styles, checkboxTextColor } }))} />
                  </div>
                </div>}
                <div className="popup-form-grid popup-dimensions-grid">
                  <label><span>Максимальна ширина, px</span><input type="number" min={320} max={1400} step={10} value={draft.styles.maxWidth} disabled={draft.campaignType === 'product_promo' && draft.styles.promoFormat !== 'custom'} onChange={(event) => setDraft((current) => ({ ...current, styles: { ...current.styles, maxWidth: Number(event.target.value) } }))} /><small>{draft.campaignType === 'product_promo' && draft.styles.promoFormat !== 'custom' ? 'Ширина визначається вибраним пресетом.' : 'До 1400 px; на вузьких екранах попап автоматично вміститься у viewport.'}</small></label>
                  <label><span>Заокруглення, px</span><input type="number" min={0} max={40} value={draft.styles.borderRadius} onChange={(event) => setDraft((current) => ({ ...current, styles: { ...current.styles, borderRadius: Number(event.target.value) } }))} /></label>
                </div>
              </div>
            </>}

            {tab === 'products' && hasAttachedProducts && <div className="popup-promo-products">
              <div className="popup-form-section">
                <SectionHeading icon="catalog" title="Каталог Хорошопа" description="Знайдіть товар або конкретну модифікацію. У банер потрапляють лише видимі позиції в наявності." aside={`${promoProducts.length} із 12`} />
                <div className="popup-promo-catalog-tools">
                  <label><span>Пошук</span><input value={promoCatalogSearch} onChange={(event) => setPromoCatalogSearch(event.target.value)} placeholder="Назва або артикул" /></label>
                  <label><span>Категорія</span><StyledSelect value={promoCategory} options={promoCategoryOptions} onChange={setPromoCategory} ariaLabel="Категорія промотоварів" /></label>
                </div>
                {promoCatalog.isLoading && <p className="popup-promo-state">Шукаємо товари…</p>}
                {promoCatalog.isError && <p className="popup-promo-state is-error">Не вдалося завантажити каталог.</p>}
                {!promoCatalog.isLoading && !promoCatalogOffers.length && <p className="popup-promo-state">За цими умовами товарів не знайдено.</p>}
                <div className="popup-promo-catalog-grid">{promoCatalogOffers.map((item) => {
                  const added = selectedPromoKeys.has(promoKey(item));
                  const disabled = added || promoProducts.length >= 12 || !item.available || !item.visible || !item.pageUrl || !item.imageUrl;
                  return <article className={!item.available || !item.visible ? 'is-unavailable' : added ? 'is-added' : ''} key={promoKey(item)}>
                    <span>{item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <Icon name="productCard" size={28} />}</span>
                    <div><strong>{item.title || item.sku}</strong><small>{item.sku || 'Без артикулу'}</small><b>{money(item.price, item.currency)}</b></div>
                    <button className="button button--secondary button--small" type="button" disabled={disabled} onClick={() => addPromoProduct(item)}>{added ? <><Icon name="check" size={14} /> Додано</> : <><Icon name="add" size={14} /> Додати</>}</button>
                  </article>;
                })}</div>
              </div>
              <div className="popup-form-section">
                <SectionHeading icon="productSelection" title="Товари у банері" description="Порядок у цьому списку відповідає порядку карток у промобанері." aside={`${promoProducts.length} товарів`} />
                {!promoProducts.length && <div className="popup-promo-empty"><Icon name="productCard" size={28} /><strong>Банер поки порожній</strong><small>Додайте хоча б один товар із каталогу вище.</small></div>}
                <div className="popup-promo-selected-list">{promoProducts.map((item, index) => <article key={promoKey(item)}>
                  <span className="popup-promo-position">{index + 1}</span>
                  <span className="popup-promo-thumb">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <Icon name="productCard" size={24} />}</span>
                  <div><strong>{item.title || item.sku}</strong><small>{item.sku} · {item.availability}</small><b>{money(item.price, item.currency)}</b></div>
                  <span className="popup-promo-order">
                    <button className="icon-button" type="button" disabled={index === 0} onClick={() => movePromoProduct(index, -1)} aria-label="Перемістити вище"><Icon name="arrow" size={15} /></button>
                    <button className="icon-button" type="button" disabled={index === promoProducts.length - 1} onClick={() => movePromoProduct(index, 1)} aria-label="Перемістити нижче"><Icon name="arrow" size={15} /></button>
                    <button className="icon-button icon-button--danger" type="button" onClick={() => setPromoProducts((current) => current.filter((_, itemIndex) => itemIndex !== index).map((entry, position) => ({ ...entry, position })))} aria-label="Прибрати товар"><Icon name="delete" size={15} /></button>
                  </span>
                </article>)}</div>
              </div>
            </div>}

            {tab === 'contacts' && draft.campaignType === 'lead_form' && <div className="popup-form-section popup-contacts-section">
              <SectionHeading icon="users" title="Контакти цього банера" description="Кожне успішне відправлення зберігається лише у списку цієї кампанії. Повтор однакових даних не створює дубль." aside={`${contacts.data?.total || selectedCampaign?.stats.contacts || 0} записів`} />
              <div className="popup-contacts-toolbar">
                <div><strong>Експорт Excel</strong><small>Колонки відповідають опублікованим полям форми.</small></div>
                {selectedId && <a className="button button--secondary button--small" href={`/api/popup-banners/${encodeURIComponent(selectedId)}/contacts/export`}><Icon name="download" size={17} /> Завантажити XLSX</a>}
              </div>
              {!selectedId && <div className="popup-list-state"><strong>Спочатку збережіть кампанію</strong><small>Після збереження тут з’явиться окремий список її контактів.</small></div>}
              {selectedId && contacts.isLoading && <div className="popup-list-state">Завантажуємо контакти…</div>}
              {selectedId && contacts.isError && <div className="popup-list-state is-error">Не вдалося завантажити контакти.</div>}
              {selectedId && !contacts.isLoading && !contacts.data?.items.length && <div className="popup-list-state"><span><Icon name="users" size={25} /></span><strong>Контактів ще немає</strong><small>Записи з’являться після успішного заповнення форми на сайті.</small></div>}
              {Boolean(contacts.data?.items.length) && <div className="popup-contacts-table-wrap"><table className="popup-contacts-table">
                <thead><tr><th>Дата</th>{contacts.data!.campaign.formConfig.fields.map((field, index) => <th key={field.id}>{field.label || field.placeholder || `Поле ${index + 1}`}</th>)}<th>Сторінка</th></tr></thead>
                <tbody>{contacts.data!.items.map((contact) => <tr key={contact.id}>
                  <td>{formatDate(contact.createdAt)}</td>
                  {contacts.data!.campaign.formConfig.fields.map((field) => <td key={field.id}>{contact.values[field.id] === true ? 'Так' : contact.values[field.id] === false ? 'Ні' : String(contact.values[field.id] || '—')}</td>)}
                  <td>{contact.pageUrl ? <a href={contact.pageUrl} target="_blank" rel="noreferrer">Відкрити <Icon name="openInNew" size={13} /></a> : '—'}</td>
                </tr>)}</tbody>
              </table></div>}
              {(contacts.data?.total || 0) > (contacts.data?.items.length || 0) && <p className="popup-contacts-limit">Показано перші {contacts.data?.items.length} записів. Повний список доступний у XLSX.</p>}
            </div>}

            {tab === 'targeting' && <>
              <div className="popup-form-section">
                <SectionHeading icon="productSelection" title="Де показувати" description="Оберіть найпростіший спосіб сформувати аудиторію цієї кампанії." aside={targetSummary} />
                <TargetModePicker value={draft.targeting.mode} campaignType={draft.campaignType} onChange={changeTargetMode} />
              </div>
              {draft.targeting.mode === 'out_of_stock' && <div className="popup-form-section">
                <SectionHeading icon="productCard" title="Доступні альтернативи" description="Система визначить категорію відкритого товару й покаже доступні позиції з актуального каталогу Хорошоп." aside="Автоматично" />
                <div className="popup-wide-target-note"><span><Icon name="visibility" size={20} /></span><div><strong>Лише для товарів, яких немає в наявності</strong><p>Наявність визначається на сторінці товару. Поточний товар виключається, а кнопка «Купити» використовує штатний кошик магазину.</p></div></div>
                <label><span>Кількість рекомендованих товарів</span><input type="number" min={3} max={8} aria-label="Кількість рекомендованих товарів" value={draft.targeting.recommendationLimit} onChange={(event) => updateTargeting({ recommendationLimit: Number(event.target.value) })} /><small>Від 3 до 8 карток. На мобільних їх можна гортати горизонтально.</small></label>
              </div>}
              {draft.targeting.mode === 'target_page' && <div className="popup-form-section">
                <SectionHeading icon="link" title="Цільова сторінка" description="Попап з’явиться лише тоді, коли покупець відкриє саме цю сторінку." aside="Точний збіг" />
                <label><span>Цільова сторінка</span><input type="url" required aria-label="Цільова сторінка" placeholder="https://mobiletrend.com.ua/potribna-storinka/" value={draft.targeting.targetPageUrl} onChange={(event) => updateTargeting({ targetPageUrl: event.target.value })} /><small>Вставте повне посилання з підключеного магазину. Параметри після «?» і фрагмент після «#» не впливають на збіг.</small></label>
              </div>}
              {draft.targeting.mode === 'products' && <div className="popup-form-section">
                <SectionHeading icon="catalog" title="Товари й модифікації" description="Вкажіть кожну назву або артикул з нового рядка. Система знайде точні позиції в каталозі." aside={`${inputLines(productText).length} позицій`} />
                <label><span>Назви та артикули</span><textarea className="popup-products-input" rows={12} value={productText} onChange={(event) => setProductText(event.target.value)} placeholder={'П0000012345\nСмартфон Apple iPhone 15 128GB Black'} /></label>
              </div>}
              {draft.targeting.mode === 'rules' && <div className="popup-form-section">
                <SectionHeading icon="characteristics" title="Правила каталогу" description="Додавайте лише потрібні групи. Порожні правила не впливають на вибірку." aside={`${draft.targeting.stickers.length + draft.targeting.brands.length + draft.targeting.categoryIds.length + draft.targeting.conditions.length + draft.targeting.urlContains.length} умов`} />
                <label><span>Логіка між групами</span><StyledSelect value={draft.targeting.match} options={[{ value: 'all', label: 'Мають виконуватись усі групи' }, { value: 'any', label: 'Достатньо будь-якої групи' }]} onChange={(match) => updateTargeting({ match })} ariaLabel="Логіка між групами" /></label>
                <div className="popup-rules-grid">
                  <RulePicker label="Стікери" values={draft.targeting.stickers} selected="" options={stickerOptions} onChange={(value) => toggleRule('stickers', value)} />
                  <RulePicker label="Бренди" values={draft.targeting.brands} selected="" options={brandOptions} onChange={(value) => toggleRule('brands', value)} />
                  <RulePicker label="Категорії" values={draft.targeting.categoryIds} selected="" options={categoryOptions} onChange={(value) => toggleRule('categoryIds', value)} />
                  <RulePicker label="Стан товару" values={draft.targeting.conditions} selected="" options={conditionOptions} onChange={(value) => toggleRule('conditions', value)} />
                </div>
                {!options.isLoading && stickerOptions.length === 0 && <div className="popup-rule-note"><Icon name="deadline" size={16} /> У поточному каталозі Хорошоп ще не отримано призначених стікерів. Після синхронізації перевірте поле ще раз.</div>}
                <label><span>URL містить — один фрагмент з рядка</span><textarea rows={4} value={draft.targeting.urlContains.join('\n')} onChange={(event) => updateTargeting({ urlContains: inputLines(event.target.value) })} placeholder="/vzhyvani-smartfony/" /></label>
              </div>}
              {(draft.targeting.mode === 'all_products' || draft.targeting.mode === 'all_pages') && <div className="popup-wide-target-note"><span><Icon name="visibility" size={20} /></span><div><strong>Широка аудиторія</strong><p>Попап охопить {draft.targeting.mode === 'all_pages' ? 'всі сторінки сайту' : 'всі картки товарів'}. Перевірте частоту показу, щоб повідомлення не заважало покупцям.</p></div></div>}
            </>}

            {tab === 'behavior' && <>
              <div className="popup-form-section">
                <SectionHeading
                  icon="schedule"
                  title="Умова показу"
                  description="Визначте, в який момент банер має з’явитися після відкриття сторінки."
                />
                <div className="popup-form-grid">
                  <label><span>Умова появи</span><StyledSelect value={draft.behavior.trigger} options={triggerOptions} onChange={(trigger) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, trigger } }))} ariaLabel="Умова появи" /></label>
                  {draft.behavior.trigger === 'delay' && <label><span>Затримка перед показом, мс</span><input type="number" min={0} max={60000} step={100} value={draft.behavior.delayMs} onChange={(event) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, delayMs: Number(event.target.value) } }))} /><small>300–800 мс зазвичай сприймаються природно.</small></label>}
                  {draft.behavior.trigger === 'scroll' && <label><span>Показати після прокрутки, %</span><input type="number" min={5} max={100} value={draft.behavior.scrollPercent} onChange={(event) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, scrollPercent: Number(event.target.value) } }))} /><small>Відсоток довжини сторінки, який має пройти покупець.</small></label>}
                  {draft.behavior.trigger === 'inactivity' && <label><span>Бездіяльність, секунд</span><input type="number" min={1} max={300} value={draft.behavior.inactivitySeconds} onChange={(event) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, inactivitySeconds: Number(event.target.value) } }))} /><small>Таймер перезапускається після кліку, дотику, скролу або натискання клавіші.</small></label>}
                  {draft.behavior.trigger === 'exit_intent' && <label><span>Активувати розпізнавання через, секунд</span><input type="number" min={0} max={60} step={1} value={draft.behavior.delayMs / 1000} onChange={(event) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, delayMs: Math.round(Number(event.target.value) * 1000) } }))} /><small>Захищає від випадкового показу одразу після завантаження. Рекомендовано 5–10 секунд.</small></label>}
                </div>
                {draft.behavior.trigger === 'exit_intent' && <>
                  <div className="popup-exit-intent-note">
                    <span><Icon name="monitor" size={19} /></span>
                    <div><strong>Desktop</strong><small>Вихід курсора через верхню межу вікна після періоду активації.</small></div>
                    <span><Icon name="phone" size={19} /></span>
                    <div><strong>Mobile</strong><small>Швидке повернення до початку сторінки або повернення на вкладку після її згортання.</small></div>
                  </div>
                </>}
              </div>
              <div className="popup-form-section">
                <SectionHeading icon="visibility" title="Повторні покази й пристрої" description="Обмежте частоту для одного покупця та потрібний тип вітрини." aside={behaviorSummary} />
                <div className="popup-form-grid">
                  <label><span>Частота показу</span><StyledSelect value={draft.behavior.frequency} options={[{ value: 'always', label: 'Під час кожного перегляду' }, { value: 'session', label: 'Один раз за сесію' }, { value: 'product', label: 'Один раз для кожного товару/сторінки' }, { value: 'hours', label: 'Повторити через кілька годин' }, { value: 'days', label: 'Повторити через кілька днів' }]} onChange={(frequency) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, frequency } }))} ariaLabel="Частота показу" /></label>
                  <label><span>Пристрої</span><StyledSelect value={draft.behavior.device} options={[{ value: 'all', label: 'Desktop і mobile' }, { value: 'desktop', label: 'Лише desktop' }, { value: 'mobile', label: 'Лише mobile' }]} onChange={(device) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, device } }))} ariaLabel="Пристрої" /></label>
                  {draft.behavior.frequency === 'hours' && <label><span>Повторити через, годин</span><input type="number" min={1} max={8760} value={draft.behavior.cooldownHours} onChange={(event) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, cooldownHours: Number(event.target.value) } }))} /></label>}
                  {draft.behavior.frequency === 'days' && <label><span>Повторити через, днів</span><input type="number" min={1} max={365} value={draft.behavior.cooldownDays} onChange={(event) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, cooldownDays: Number(event.target.value) } }))} /></label>}
                  <label><span>Ліміт показів за сесію</span><input type="number" min={0} max={20} value={draft.behavior.maxShowsPerSession} onChange={(event) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, maxShowsPerSession: Number(event.target.value) } }))} /><small>0 — без окремого ліміту. Частота вище все одно застосовується.</small></label>
                  <label><span>Автозакриття, секунд</span><input type="number" min={0} max={300} value={draft.behavior.autoCloseSeconds} onChange={(event) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, autoCloseSeconds: Number(event.target.value) } }))} /><small>0 — не закривати автоматично.</small></label>
                  {draft.campaignType === 'product_promo' && promoProducts.length > 1 && <label><span>Зміна товару, секунд</span><input type="number" min={2} max={60} value={draft.behavior.rotationSeconds} onChange={(event) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, rotationSeconds: Number(event.target.value) } }))} /><small>Для пресета «Сповіщення» товари показуються по черзі.</small></label>}
                </div>
                <div className="popup-toggle-list">
                  <Toggle checked={draft.behavior.dismissible} label="Покупець може закрити попап" description={draft.campaignType === 'product_promo' ? 'Показувати хрестик у самій панелі. Банер не перехоплює кліки поза нею.' : 'Показувати хрестик і дозволити закриття кліком по затемненому фону.'} onChange={(dismissible) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, dismissible } }))} />
                  {draft.targeting.mode !== 'out_of_stock' && !['product_promo', 'promo_code', 'lead_form', 'countdown'].includes(draft.campaignType) && <Toggle checked={draft.behavior.requireAcknowledgement} label="Потрібне явне підтвердження" description="Основна кнопка стане доступною лише після встановлення прапорця." onChange={(requireAcknowledgement) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, requireAcknowledgement } }))} />}
                </div>
                {draft.targeting.mode !== 'out_of_stock' && !['product_promo', 'promo_code', 'lead_form', 'countdown'].includes(draft.campaignType) && draft.behavior.requireAcknowledgement && <>
                  <label><span>Текст підтвердження</span><textarea rows={3} value={draft.content.acknowledgementLabel} onChange={(event) => setDraft((current) => ({ ...current, content: { ...current.content, acknowledgementLabel: event.target.value } }))} /></label>
                </>}
              </div>
              <div className="popup-form-section">
                <SectionHeading icon="calendar" title="Розклад кампанії" description="Налаштуйте загальний період, дні тижня та щоденні години показу." />
                <div className="popup-form-grid">
                  <label><span>Початок</span><input type="datetime-local" value={localDateTime(draft.startsAt)} onChange={(event) => setDraft((current) => ({ ...current, startsAt: isoDateTime(event.target.value) }))} /></label>
                  <label><span>Завершення</span><input type="datetime-local" value={localDateTime(draft.endsAt)} onChange={(event) => setDraft((current) => ({ ...current, endsAt: isoDateTime(event.target.value) }))} /></label>
                  <label><span>Часовий пояс</span><StyledSelect value={draft.behavior.scheduleTimezone} options={[{ value: 'Europe/Kyiv', label: 'Київ' }, { value: 'Europe/Warsaw', label: 'Варшава' }, { value: 'Europe/Berlin', label: 'Берлін' }, { value: 'UTC', label: 'UTC' }]} onChange={(scheduleTimezone) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, scheduleTimezone } }))} ariaLabel="Часовий пояс розкладу" /></label>
                  <label><span>Пріоритет</span><input type="number" min={0} max={1000} value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: Number(event.target.value) }))} /><small>Якщо підходять кілька кампаній, перемагає більший пріоритет.</small></label>
                  <label><span>Щодня з</span><input type="time" value={draft.behavior.dailyStartTime} onChange={(event) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, dailyStartTime: event.target.value } }))} /><small>Залиште обидва поля порожніми для цілодобового показу.</small></label>
                  <label><span>Щодня до</span><input type="time" value={draft.behavior.dailyEndTime} onChange={(event) => setDraft((current) => ({ ...current, behavior: { ...current.behavior, dailyEndTime: event.target.value } }))} /></label>
                </div>
                <div className="popup-weekdays"><strong>Активні дні</strong><div role="group" aria-label="Активні дні тижня">{weekdays.map((day) => {
                  const active = draft.behavior.activeWeekdays.includes(day.value);
                  return <button type="button" className={active ? 'is-active' : ''} aria-pressed={active} onClick={() => setDraft((current) => {
                    const currentDays = current.behavior.activeWeekdays;
                    const activeWeekdays = active ? currentDays.filter((value) => value !== day.value) : [...currentDays, day.value].sort();
                    return activeWeekdays.length ? { ...current, behavior: { ...current.behavior, activeWeekdays } } : current;
                  })} key={day.value}>{day.label}</button>;
                })}</div><small>Принаймні один день має залишатися активним.</small></div>
              </div>
            </>}
          </section>
          <aside className="popup-editor__preview">
            <Preview input={currentInput} />
            <div className="popup-preview-summary">
              <span><i><Icon name="productSelection" size={16} /></i><span><strong>Аудиторія</strong><small>{targetSummary}</small></span></span>
              <span><i><Icon name="schedule" size={16} /></i><span><strong>Частота</strong><small>{behaviorSummary}</small></span></span>
              <span><i><Icon name="calendar" size={16} /></i><span><strong>Період</strong><small>{draft.startsAt || draft.endsAt ? `${formatDate(draft.startsAt)} — ${formatDate(draft.endsAt)}` : 'Без обмежень'}</small></span></span>
            </div>
          </aside>
          </>}
        </div>
        </>}
      </main>
      {promoCodePickerOpen && <PromoCodePickerModal
        selectedId={draft.promoCodeId}
        onClose={() => setPromoCodePickerOpen(false)}
        onSelect={(promoCode) => {
          setSelectedPromoCode(promoCode);
          setDraft((current) => ({ ...current, promoCodeId: promoCode.id }));
          setPromoCodePickerOpen(false);
        }}
      />}
    </div>
  </div>;
}
