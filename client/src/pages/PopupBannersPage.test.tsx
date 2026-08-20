import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import { ToastProvider } from '../toast/ToastContext';
import type { PopupCampaign, PopupCampaignOptions } from '../types/popup-banner';
import { PopupBannersPage } from './PopupBannersPage';

const baseCampaign: PopupCampaign = {
  id: 'campaign-used',
  publicId: 'public-used',
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
    eyebrowFontSize: 12,
    titleFontSize: 34,
    bodyFontSize: 16,
    acknowledgementFontSize: 14,
    buttonFontSize: 16,
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
    urlContains: []
  },
  behavior: {
    delayMs: 300,
    frequency: 'product',
    cooldownDays: 7,
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
  stats: { impressions: 1280, dismissals: 32, clicks: 14, acknowledgements: 115 },
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
  stats: { impressions: 0, dismissals: 0, clicks: 0, acknowledgements: 0 }
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
});

afterEach(() => vi.restoreAllMocks());

describe('PopupBannersPage', () => {
  it('opens an existing campaign in the redesigned workspace', async () => {
    renderPage();

    expect(await screen.findByDisplayValue(baseCampaign.name)).toBeInTheDocument();
    expect(screen.getByText('Живий перегляд')).toBeInTheDocument();
    expect(screen.getAllByText('mobiletrend.com.ua')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Контент і дизайн/u })).toHaveClass('is-active');
    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeDisabled();
  });

  it('filters the campaign library by search and status', async () => {
    renderPage();
    await screen.findByDisplayValue(baseCampaign.name);

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
});
