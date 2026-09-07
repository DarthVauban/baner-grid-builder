import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import { ToastProvider } from '../toast/ToastContext';
import type { PopupCampaign, PopupCampaignInput, PopupCampaignOptions, PopupPreviewPayload } from '../types/popup-banner';
import type { PromoCode } from '../types/promo-code';
import { PopupBannersPage } from './PopupBannersPage';

const baseCampaign: PopupCampaign = {
  id: 'campaign-used',
  publicId: 'public-used',
  campaignType: 'message',
  name: 'Попередження про вживаний товар',
  status: 'active',
  priority: 100,
  content: {
    eyebrow: 'Важлива інформація',
    title: 'Цей товар був у використанні',
    body: 'Перед замовленням ознайомтеся зі станом і комплектацією товару.',
    primaryLabel: 'Зрозуміло',
    primaryUrl: '',
    secondaryLabel: 'Закрити',
    imageUrl: '',
    acknowledgementLabel: 'Я прочитав(-ла) цю інформацію.'
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
    primaryButtonBackgroundColor: '#ffe101',
    primaryButtonTextColor: '#172033',
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
  publishedAt: '2026-08-21T09:00:00.000Z',
  productTargets: [{
    id: 'target-1',
    productId: 'product-1',
    modificationId: null,
    sku: 'USED-PHONE-1',
    title: 'Смартфон Apple iPhone 15 128GB Used',
    inputValue: 'USED-PHONE-1',
    matchedBy: 'sku'
  }],
  promoProducts: [],
  promoCodeId: null,
  promoCode: null,
  publishedPromoCode: null,
  formConfig: {
    fields: [{ id: 'phone', type: 'phone', label: 'Телефон', placeholder: '+380', required: true, options: [] }],
    blocks: [{ id: 'contact', layout: 'column', fieldIds: ['phone'] }],
    submitLabel: 'Отримати промокод', successTitle: 'Ваш промокод готовий', successBody: 'Скопіюйте код.'
  },
  publishedFormConfig: null,
  stats: { impressions: 1280, dismissals: 32, clicks: 14, acknowledgements: 115, copies: 0, promoCtaClicks: 0, contacts: 0 },
  connection: { id: 'connection-1', generation: 'generation-1', storeDomain: 'mobiletrend.com.ua' },
  createdAt: '2026-08-20T08:00:00.000Z',
  updatedAt: '2026-08-21T09:00:00.000Z'
};

const secondCampaign: PopupCampaign = {
  ...structuredClone(baseCampaign),
  id: 'campaign-delivery',
  publicId: 'public-delivery',
  name: 'Умови доставки великої техніки',
  status: 'draft',
  targeting: { ...baseCampaign.targeting, mode: 'all_products' },
  productTargets: [],
  stats: { impressions: 0, dismissals: 0, clicks: 0, acknowledgements: 0, copies: 0, promoCtaClicks: 0, contacts: 0 }
};

const options: PopupCampaignOptions = {
  integration: {
    id: 'connection-1',
    generation: 'generation-1',
    storeDomain: 'mobiletrend.com.ua',
    status: 'connected',
    lastSyncAt: '2026-08-21T08:30:00.000Z'
  },
  stickers: [{ id: 'sticker-used', title: 'Вживаний' }],
  brands: ['Apple', 'Samsung'],
  conditions: ['Вживаний', 'Новий'],
  categories: [{ id: 'phones', title: 'Смартфони' }]
};

const promoCode: PromoCode = {
  id: '9a70136d-6538-47b8-9645-d6897a8ab854',
  connectionId: 'connection-1',
  storeDomain: 'mobiletrend.com.ua',
  internalName: 'Осіння знижка',
  code: 'AUTUMN10',
  type: 'percent_coupon',
  discountValue: 10,
  currency: '',
  startsAt: null,
  endsAt: null,
  usageLimit: 200,
  scopeNote: 'Лише аксесуари',
  status: 'active',
  enabled: true,
  horoshopConfirmed: true,
  campaigns: [],
  createdAt: '2026-09-07T08:00:00.000Z',
  updatedAt: '2026-09-07T08:00:00.000Z'
};

function previewPayload(campaign: PopupCampaignInput): PopupPreviewPayload {
  const products = campaign.promoItems.map((item, position) => ({
    id: `preview-${position}`,
    productId: `product-db-${position + 1}`,
    modificationId: null,
    productExternalId: item.productExternalId,
    modificationExternalId: item.modificationExternalId,
    position,
    sku: `PROMO-${position + 1}`,
    article: `PROMO-${position + 1}`,
    title: position === 0 ? 'Промотовар' : 'Другий промотовар',
    imageUrl: `https://cdn.example.com/promo-${position + 1}.webp`,
    pageUrl: `https://mobiletrend.com.ua/promo-${position + 1}/`,
    price: position === 0 ? '399' : '499',
    oldPrice: position === 0 ? '599' : '',
    currency: 'UAH',
    availability: 'В наявності',
    visible: true,
    available: true,
    buyId: `900${position + 1}`
  }));
  return {
    campaign: {
      publicId: 'preview',
      revision: `preview-${JSON.stringify(campaign).length}`,
      type: campaign.campaignType,
      mode: campaign.targeting.mode,
      content: campaign.content,
      styles: campaign.styles,
      behavior: campaign.behavior,
      formConfig: campaign.formConfig,
      promoCode: campaign.promoCodeId ? {
        libraryId: promoCode.id,
        internalName: promoCode.internalName,
        code: promoCode.code,
        type: promoCode.type,
        discountValue: promoCode.discountValue,
        currency: promoCode.currency,
        startsAt: promoCode.startsAt,
        endsAt: promoCode.endsAt,
        usageLimit: promoCode.usageLimit,
        scopeNote: promoCode.scopeNote,
        status: promoCode.status,
        horoshopConfirmed: promoCode.horoshopConfirmed,
        capturedAt: promoCode.updatedAt
      } : null
    },
    product: null,
    recommendations: [],
    products
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmDialogProvider>
          <MemoryRouter><PopupBannersPage /></MemoryRouter>
        </ConfirmDialogProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.spyOn(api.popupBanners, 'list').mockResolvedValue([baseCampaign, secondCampaign]);
  vi.spyOn(api.popupBanners, 'options').mockResolvedValue(options);
  vi.spyOn(api.popupBanners, 'embedCode').mockResolvedValue({ code: '<script src="/widget.js"></script>' });
  vi.spyOn(api.popupBanners, 'preview').mockImplementation(async (campaign) => previewPayload(campaign));
  vi.spyOn(api.popupBanners, 'catalog').mockResolvedValue({
    integration: {
      configured: true, status: 'connected', storeDomain: 'mobiletrend.com.ua',
      pollingIntervalMinutes: 30, lastSyncAt: '2026-08-21T08:30:00.000Z', lastError: null,
      counts: { categories: 1, products: 2, modifications: 0 }, latestRun: null
    },
    items: [{
      id: 'product-db-1', externalId: 'promo-product-1', parentExternalId: null,
      sku: 'PROMO-1', titles: { uk: 'Промотовар' }, brand: 'Mobile Trend',
      categoryExternalId: 'phones', price: '399', oldPrice: '599', currency: 'UAH',
      availability: 'В наявності', visible: true, active: true,
      primaryImageUrl: 'https://cdn.example.com/promo.webp', canonicalUrl: 'https://mobiletrend.com.ua/promo/',
      popularity: '10', horoshopCreatedAt: null, hasPhotos: true,
      updatedAt: '2026-08-21T08:30:00.000Z', modifications: []
    }, {
      id: 'product-db-2', externalId: 'promo-product-2', parentExternalId: null,
      sku: 'PROMO-2', titles: { uk: 'Другий промотовар' }, brand: 'Mobile Trend',
      categoryExternalId: 'phones', price: '499', oldPrice: '', currency: 'UAH',
      availability: 'В наявності', visible: true, active: true,
      primaryImageUrl: 'https://cdn.example.com/promo-2.webp', canonicalUrl: 'https://mobiletrend.com.ua/promo-2/',
      popularity: '8', horoshopCreatedAt: null, hasPhotos: true,
      updatedAt: '2026-08-21T08:30:00.000Z', modifications: []
    }],
    categories: [{ externalId: 'phones', parentExternalId: null, titles: { uk: 'Смартфони' }, productCount: 1 }],
    availabilityOptions: ['В наявності'], total: 2, page: 1, pageSize: 60, pageCount: 1
  });
  vi.spyOn(api.promoCodes, 'list').mockResolvedValue([promoCode]);
});

afterEach(() => vi.restoreAllMocks());

describe('PopupBannersPage', () => {
  it('opens an existing campaign in the redesigned workspace', async () => {
    renderPage();

    expect(await screen.findByDisplayValue(baseCampaign.name)).toBeInTheDocument();
    expect(screen.getByText('Живий перегляд')).toBeInTheDocument();
    expect(screen.getAllByText('mobiletrend.com.ua')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Контент і дизайн/u })).toHaveClass('is-active');
    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeDisabled();
    await waitFor(() => expect(screen.getByTitle('Живий перегляд банера')).toHaveAttribute(
      'srcdoc', expect.stringContaining(baseCampaign.content.title)
    ));
    const iframe = screen.getByTitle('Живий перегляд банера');
    expect(iframe).toHaveAttribute('srcdoc', expect.stringContaining('/api/public/popup-banners/embed.js'));
    fireEvent.click(screen.getByRole('button', { name: 'Відкрити прев’ю на весь екран' }));
    expect(iframe.closest('.popup-live-preview')).toHaveClass('is-fullscreen');
    expect(screen.getByRole('button', { name: 'Закрити повноекранний перегляд' })).toHaveTextContent('Вийти');
    fireEvent.click(screen.getByRole('button', { name: 'Телефон' }));
    expect(screen.getByTitle('Живий перегляд банера').parentElement).toHaveClass('is-mobile');
    expect(screen.getByTitle('Живий перегляд банера').getAttribute('srcdoc')).toContain('data-preview-device="mobile"');
    fireEvent.click(screen.getByRole('button', { name: 'Закрити повноекранний перегляд' }));
    expect(screen.getByTitle('Живий перегляд банера').closest('.popup-live-preview')).not.toHaveClass('is-fullscreen');
  });

  it('filters the campaign library by search and status', async () => {
    renderPage();
    await screen.findByDisplayValue(baseCampaign.name);

    fireEvent.click(screen.getByRole('button', { name: /Бібліотека/u }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Пошук кампаній' }), { target: { value: 'доставки' } });
    expect(screen.getByRole('button', { name: /Умови доставки великої техніки/u })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Попередження про вживаний товар/u })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Активні' }));
    expect(screen.getByText('Нічого не знайдено')).toBeInTheDocument();
  });

  it('navigates to targeting and exposes the branded rule controls', async () => {
    renderPage();
    await screen.findByDisplayValue(baseCampaign.name);

    fireEvent.click(screen.getByRole('button', { name: /Умови показу/u }));
    fireEvent.click(screen.getByRole('radio', { name: /Умови каталогу/u }));

    expect(screen.getByText('Правила каталогу')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Логіка між групами' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Стікери' })).toBeInTheDocument();
  });

  it('saves an exact target page as a dedicated targeting mode', async () => {
    const targetPageUrl = 'https://mobiletrend.com.ua/dostavka-ta-oplata/';
    const update = vi.spyOn(api.popupBanners, 'update').mockResolvedValue({
      ...structuredClone(baseCampaign),
      targeting: { ...baseCampaign.targeting, mode: 'target_page', targetPageUrl },
      productTargets: []
    });
    renderPage();
    await screen.findByDisplayValue(baseCampaign.name);

    fireEvent.click(screen.getByRole('button', { name: /Умови показу/u }));
    fireEvent.click(screen.getByRole('radio', { name: /Цільова сторінка/u }));
    const targetPage = screen.getByRole('textbox', { name: 'Цільова сторінка' });
    expect(targetPage).toBeRequired();
    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeDisabled();

    fireEvent.change(targetPage, { target: { value: targetPageUrl } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Зберегти' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(
      baseCampaign.id,
      expect.objectContaining({
        targeting: expect.objectContaining({ mode: 'target_page', targetPageUrl })
      })
    ));
  });

  it('configures automatic alternatives for an unavailable product', async () => {
    const update = vi.spyOn(api.popupBanners, 'update').mockImplementation(async (_id, campaign) => ({
      ...structuredClone(baseCampaign),
      ...campaign,
      status: 'active',
      publishedAt: baseCampaign.publishedAt,
      productTargets: [],
      stats: baseCampaign.stats,
      connection: baseCampaign.connection,
      createdAt: baseCampaign.createdAt,
      updatedAt: baseCampaign.updatedAt
    }));
    renderPage();
    await screen.findByDisplayValue(baseCampaign.name);

    fireEvent.click(screen.getByRole('button', { name: /Умови показу/u }));
    fireEvent.click(screen.getByRole('radio', { name: /Товар відсутній/u }));

    expect(screen.getByText('Доступні альтернативи')).toBeInTheDocument();
    const limit = screen.getByRole('spinbutton', { name: 'Кількість рекомендованих товарів' });
    expect(limit).toHaveValue(6);
    fireEvent.change(limit, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(
      baseCampaign.id,
      expect.objectContaining({
        targeting: expect.objectContaining({ mode: 'out_of_stock', recommendationLimit: 5 }),
        behavior: expect.objectContaining({ frequency: 'always', requireAcknowledgement: false })
      })
    ));
  });

  it('marks edited content as unsaved and enables saving', async () => {
    renderPage();
    const name = await screen.findByDisplayValue(baseCampaign.name);

    fireEvent.change(name, { target: { value: 'Оновлена кампанія' } });

    expect(screen.getByText('Є незбережені зміни')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Зберегти' })).toBeEnabled());
  });

  it('exposes button and acknowledgement colors in the branded editor', async () => {
    renderPage();
    await screen.findByDisplayValue(baseCampaign.name);

    expect(screen.getAllByLabelText('Колір кнопки: вибрати колір')).toHaveLength(2);
    expect(screen.getAllByLabelText('Колір кнопки: вибрати колір')[0]).toHaveValue('#ffe101');
    expect(screen.getAllByLabelText('Колір тексту: вибрати колір')).toHaveLength(2);
    expect(screen.getByLabelText('Основний текст: вибрати колір')).toHaveValue('#667085');
    expect(screen.getByRole('spinbutton', { name: 'Заголовок, px' })).toHaveValue(34);
    expect(screen.getByRole('spinbutton', { name: 'Основний текст, px' })).toHaveValue(16);
    expect(screen.getByText('Стиль чекбокса підтвердження')).toBeInTheDocument();
    expect(screen.getByLabelText('Колір чекбокса: вибрати колір')).toHaveValue('#6d5dfc');
    expect(screen.getByLabelText('Колір галочки: вибрати колір')).toHaveValue('#ffffff');
    expect(screen.getByLabelText('Колір тексту чекбокса: вибрати колір')).toHaveValue('#172033');

    fireEvent.click(screen.getByRole('button', { name: 'Кількість кнопок' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Одна кнопка' }));
    expect(screen.queryByRole('textbox', { name: 'Додаткова кнопка' })).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Колір кнопки: вибрати колір')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /Поведінка й розклад/u }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Потрібне явне підтвердження/u }));

    expect(screen.getByRole('textbox', { name: 'Текст підтвердження' })).toHaveValue('Я прочитав(-ла) цю інформацію.');
    expect(screen.queryByText('Стиль чекбокса підтвердження')).not.toBeInTheDocument();
  });

  it('configures exit intent as a display condition for an information popup', async () => {
    const { container } = renderPage();
    await screen.findByDisplayValue(baseCampaign.name);

    fireEvent.click(screen.getByRole('button', { name: /Поведінка й розклад/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Умова появи' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Коли покупець збирається вийти' }));

    expect(screen.getByText('Desktop')).toBeInTheDocument();
    expect(screen.getByText('Mobile')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /Активувати розпізнавання/u })).toHaveValue(0.3);
    expect(screen.getByRole('checkbox', { name: /Потрібне явне підтвердження/u })).toBeInTheDocument();
    await waitFor(() => expect(api.popupBanners.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({ behavior: expect.objectContaining({ trigger: 'exit_intent' }) }),
      expect.any(AbortSignal)
    ));
    expect(container.querySelector('.popup-runtime-preview iframe')).toBeInTheDocument();
  });

  it('creates a non-blocking product promo campaign from the catalog', async () => {
    const create = vi.spyOn(api.popupBanners, 'create').mockImplementation(async (campaign) => ({
      ...structuredClone(baseCampaign),
      ...campaign,
      id: 'product-promo-campaign',
      publicId: 'product-promo-public',
      status: 'draft',
      promoProducts: [{
        id: 'promo-item-1', productId: 'product-db-1', modificationId: null,
        productExternalId: 'promo-product-1', modificationExternalId: null, position: 0,
        sku: 'PROMO-1', title: 'Промотовар', imageUrl: 'https://cdn.example.com/promo.webp',
        pageUrl: 'https://mobiletrend.com.ua/promo/', price: '399', oldPrice: '599',
        currency: 'UAH', availability: 'В наявності', visible: true, available: true, buyId: '9001'
      }],
      productTargets: [], stats: baseCampaign.stats, connection: baseCampaign.connection,
      createdAt: baseCampaign.createdAt, updatedAt: baseCampaign.updatedAt, publishedAt: null
    }));
    renderPage();
    await screen.findByDisplayValue(baseCampaign.name);

    fireEvent.click(screen.getAllByRole('button', { name: /Нова кампанія/u })[0]);
    expect(screen.getByRole('heading', { name: 'Оберіть тип банера' })).toBeInTheDocument();
    expect(screen.getByText('Промобанери')).toBeInTheDocument();
    expect(screen.getByText('Сценарні банери')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Товарний промобанер/u }));

    expect(screen.getByText('Неблокуюча плаваюча панель')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Розташування попапа' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Сповіщення/u })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Знизу ліворуч/u })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /^Знизу$/u })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByLabelText('Надзаголовок')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Зображення')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: /Заголовок необов’язково/u }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('textbox', { name: /Основний текст необов’язково/u }), { target: { value: '' } });
    expect(screen.queryByRole('checkbox', { name: /Показувати заголовок кампанії/u })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Компактний/u }));
    expect(screen.getByRole('checkbox', { name: /Показувати заголовок кампанії/u })).not.toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /Сповіщення/u }));
    expect(screen.getByLabelText('Колір прогресу: HEX')).toHaveValue('#6d5dfc');
    expect(screen.getByLabelText('Колір підкладки: HEX')).toHaveValue('#ede9fe');
    expect(screen.getByRole('spinbutton', { name: /Заокруглення кнопки/u })).toHaveValue(12);
    fireEvent.click(screen.getByRole('button', { name: /Товари банера/u }));
    const add = await screen.findAllByRole('button', { name: /Додати/u });
    fireEvent.click(add[0]);
    fireEvent.click(add[1]);
    expect(screen.getByText('Товари у банері')).toBeInTheDocument();
    await waitFor(() => expect(api.popupBanners.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({ promoItems: [
        { productExternalId: 'promo-product-1', modificationExternalId: null },
        { productExternalId: 'promo-product-2', modificationExternalId: null }
      ] }),
      expect.any(AbortSignal)
    ));
    const iframe = screen.getByTitle('Живий перегляд банера');
    expect(iframe.getAttribute('srcdoc')).toContain('Промотовар');
    expect(iframe.getAttribute('srcdoc')).toContain('Другий промотовар');
    fireEvent.click(screen.getByRole('button', { name: 'Телефон' }));
    const mobileIframe = screen.getByTitle('Живий перегляд банера');
    expect(mobileIframe.parentElement).toHaveClass('is-mobile');
    expect(mobileIframe.getAttribute('srcdoc')).toContain('data-preview-device="mobile"');
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      campaignType: 'product_promo',
      styles: expect.objectContaining({
        promoFormat: 'notification', desktopPosition: 'bottom_left', mobilePosition: 'bottom', maxWidth: 380,
        timelineColor: '#6d5dfc', timelineTrackColor: '#ede9fe', showPromoTitle: false, buttonBorderRadius: 12
      }),
      content: expect.objectContaining({ title: '', body: '' }),
      targeting: expect.objectContaining({ mode: 'all_pages' }),
      promoItems: [
        { productExternalId: 'promo-product-1', modificationExternalId: null },
        { productExternalId: 'promo-product-2', modificationExternalId: null }
      ]
    }), expect.anything()));
  }, 10_000);

  it('creates a promo code banner from the reusable library', async () => {
    const create = vi.spyOn(api.popupBanners, 'create').mockImplementation(async (campaign) => ({
      ...structuredClone(baseCampaign),
      ...campaign,
      id: 'promo-code-campaign',
      publicId: 'promo-code-public',
      status: 'draft',
      productTargets: [],
      promoProducts: [],
      promoCodeId: promoCode.id,
      promoCode: {
        libraryId: promoCode.id,
        internalName: promoCode.internalName,
        code: promoCode.code,
        type: promoCode.type,
        discountValue: promoCode.discountValue,
        currency: promoCode.currency,
        startsAt: promoCode.startsAt,
        endsAt: promoCode.endsAt,
        usageLimit: promoCode.usageLimit,
        scopeNote: promoCode.scopeNote,
        status: promoCode.status,
        horoshopConfirmed: promoCode.horoshopConfirmed,
        capturedAt: '2026-09-07T09:00:00.000Z'
      },
      publishedPromoCode: null,
      stats: baseCampaign.stats,
      connection: baseCampaign.connection,
      createdAt: baseCampaign.createdAt,
      updatedAt: baseCampaign.updatedAt,
      publishedAt: null
    }));
    renderPage();
    await screen.findByDisplayValue(baseCampaign.name);

    fireEvent.click(screen.getAllByRole('button', { name: /Нова кампанія/u })[0]);
    fireEvent.click(screen.getByRole('button', { name: /Банер із промокодом/u }));
    expect(screen.getByText('Опублікована версія не змінюється непомітно')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Обрати промокод/u }));
    const codeOption = (await screen.findByText('AUTUMN10')).closest('button');
    expect(codeOption).not.toBeNull();
    fireEvent.click(codeOption!);

    await waitFor(() => expect(api.popupBanners.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({ campaignType: 'promo_code', promoCodeId: promoCode.id }),
      expect.any(AbortSignal)
    ));
    expect(screen.getByTitle('Живий перегляд банера').getAttribute('srcdoc')).toContain('AUTUMN10');
    expect(screen.getByText('−10%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Поведінка й розклад/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Умова появи' }));
    expect(await screen.findByRole('option', { name: 'Коли покупець збирається вийти' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement || document.body, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: /Контент і дизайн/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      campaignType: 'promo_code',
      promoCodeId: promoCode.id,
      targeting: expect.objectContaining({ mode: 'all_pages' }),
      content: expect.objectContaining({ primaryLabel: 'Перейти до акції', primaryUrl: '' })
    }), expect.anything()));
  });

  it('builds a configurable contact form that reveals a selected promo code', async () => {
    const create = vi.spyOn(api.popupBanners, 'create').mockImplementation(async (campaign) => ({
      ...structuredClone(baseCampaign),
      ...campaign,
      id: 'lead-form-campaign',
      publicId: 'lead-form-public',
      status: 'draft',
      productTargets: [],
      promoProducts: [],
      promoCodeId: promoCode.id,
      promoCode: previewPayload(campaign).campaign.promoCode,
      publishedPromoCode: null,
      publishedFormConfig: null,
      stats: { ...baseCampaign.stats, contacts: 0 },
      connection: baseCampaign.connection,
      createdAt: baseCampaign.createdAt,
      updatedAt: baseCampaign.updatedAt,
      publishedAt: null
    }));
    renderPage();
    await screen.findByDisplayValue(baseCampaign.name);

    fireEvent.click(screen.getAllByRole('button', { name: /Нова кампанія/u })[0]);
    fireEvent.click(screen.getByRole('button', { name: /Форма за промокод/u }));

    expect(screen.getByText('Блоки контактної форми')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Назва поля/u)).toHaveLength(2);
    const firstLabel = screen.getAllByLabelText(/^Назва поля/u)[0];
    firstLabel.focus();
    fireEvent.change(firstLabel, { target: { value: '' } });
    expect(firstLabel).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: /Додати блок/u }));
    expect(screen.getAllByLabelText(/^Назва поля/u)).toHaveLength(3);
    expect(screen.getByText('Поле займає 100% ширини')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Кількість полів у блоці 2' }));
    fireEvent.click(await screen.findByRole('option', { name: '2' }));
    expect(screen.getAllByLabelText(/^Назва поля/u)).toHaveLength(4);
    fireEvent.change(screen.getAllByLabelText(/^Назва поля/u)[2], { target: { value: 'Місто' } });
    fireEvent.click(screen.getByRole('button', { name: 'Тип поля Місто' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Список варіантів' }));
    fireEvent.change(screen.getByText('Варіанти — по одному з рядка').closest('label')!.querySelector('textarea')!, {
      target: { value: 'Київ\nЛьвів' }
    });

    fireEvent.click(screen.getByRole('button', { name: /Обрати промокод/u }));
    fireEvent.click((await screen.findByText('AUTUMN10')).closest('button')!);

    await waitFor(() => expect(api.popupBanners.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        campaignType: 'lead_form',
        promoCodeId: promoCode.id,
        formConfig: expect.objectContaining({
          blocks: expect.arrayContaining([expect.objectContaining({ layout: 'column', fieldIds: expect.arrayContaining([expect.any(String), expect.any(String)]) })]),
          fields: expect.arrayContaining([
            expect.objectContaining({ label: '' }),
            expect.objectContaining({ label: 'Місто', type: 'select', options: ['Київ', 'Львів'] })
          ])
        })
      }),
      expect.any(AbortSignal)
    ));
    expect(screen.getByTitle('Живий перегляд банера').getAttribute('srcdoc')).toContain('Отримати промокод');
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      campaignType: 'lead_form',
      promoCodeId: promoCode.id,
      formConfig: expect.objectContaining({
        blocks: expect.arrayContaining([expect.objectContaining({ layout: 'column', fieldIds: expect.any(Array) })]),
        fields: expect.arrayContaining([
          expect.objectContaining({ label: '' }),
          expect.objectContaining({ label: 'Місто', type: 'select', options: ['Київ', 'Львів'] })
        ])
      })
    }), expect.anything()));
  }, 10_000);
});
