import type { PopupCampaignInput, PopupCampaignType, PopupPreviewPayload, PopupPromoProduct } from '../types/popup-banner';
import type { HoroshopCatalogProduct, HoroshopCatalogModification } from '../types/horoshop-catalog';

export function emptyCampaign(campaignType: PopupCampaignType = 'message'): PopupCampaignInput {
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

function localizedTitle(titles: Record<string, string>) {
  return titles.uk || titles.ua || titles.ru || titles.en || Object.values(titles).find(Boolean) || '';
}

function isAvailable(value: string | null) {
  const availability = String(value || '').trim().toLocaleLowerCase('uk-UA');
  return Boolean(availability) && !/(немає\s+(?:в\s+)?наявност|нет\s+(?:в\s+)?наличи|out[\s-]*of[\s-]*stock|not[\s-]*available|закінчив|отсутств)/iu.test(availability);
}

export function promoOffer(product: HoroshopCatalogProduct, modification?: HoroshopCatalogModification): PopupPromoProduct {
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

export function previewDocument(payload: PopupPreviewPayload, viewport: 'desktop' | 'mobile') {
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
<script src="/api/public/popup-banners/embed.js" data-preview-payload="${serializedPayload}" data-preview-device="${viewport}"></script></body></html>`;
}
