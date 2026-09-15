import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import { ToastProvider } from '../toast/ToastContext';
import type { HoroshopCheckoutTelegramSettings } from '../types/horoshop-checkout-telegram';
import { HoroshopCheckoutTelegramPage } from './HoroshopCheckoutTelegramPage';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async (value: string) => `data:image/png;base64,${btoa(value)}`) }
}));

const settings: HoroshopCheckoutTelegramSettings = {
  publicId: '71ca5c29-5a72-4af8-b5d7-4020e6ec1215',
  enabled: false,
  draftConfig: {
    telegramUrl: '',
    buttonText: 'Відкрити Telegram',
    buttonBackgroundColor: '#229ed9',
    buttonHoverBackgroundColor: '#168ac2',
    buttonTextColor: '#ffffff',
    buttonBorderColor: '#229ed9',
    buttonBorderRadius: 12,
    buttonFontSize: 16,
    qrSize: 240,
    mobileButtonFontSize: 15,
    mobileQrSize: 208
  },
  publishedConfig: null,
  publishedVersion: 0,
  storeDomain: 'shop551651.horoshop.ua',
  updatedAt: '2026-09-15T08:00:00.000Z',
  publishedAt: null,
  embedCode: '<script async src="https://workspace.example.com/api/public/horoshop-checkout-telegram/embed.js?site=71ca5c29-5a72-4af8-b5d7-4020e6ec1215"></script>'
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><ToastProvider><HoroshopCheckoutTelegramPage /></ToastProvider></QueryClientProvider>);
}

beforeEach(() => {
  vi.mocked(QRCode.toDataURL).mockClear();
  vi.spyOn(api.horoshopCheckoutTelegram, 'settings').mockResolvedValue(settings);
  vi.spyOn(api.horoshopCheckoutTelegram, 'saveDraft').mockResolvedValue(settings);
  vi.spyOn(api.horoshopCheckoutTelegram, 'publish').mockResolvedValue({ ...settings, enabled: true, publishedVersion: 1 });
  vi.spyOn(api.horoshopCheckoutTelegram, 'setEnabled').mockResolvedValue(settings);
});

afterEach(() => vi.restoreAllMocks());

describe('HoroshopCheckoutTelegramPage', () => {
  it('regenerates the QR preview when the Telegram link changes', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Telegram після замовлення' })).toBeInTheDocument();
    expect(screen.getByText('shop551651.horoshop.ua')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Посилання на Telegram-бота'), {
      target: { value: 'https://t.me/mobiletrend_test_bot?start=order' }
    });

    await waitFor(() => expect(QRCode.toDataURL).toHaveBeenCalledWith(
      'https://t.me/mobiletrend_test_bot?start=order',
      expect.objectContaining({ width: 240 })
    ));
    expect(await screen.findByAltText('QR-код для переходу в Telegram')).toBeInTheDocument();
  });

  it('publishes button text and style settings as one contract', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Telegram після замовлення' });
    fireEvent.change(screen.getByLabelText('Посилання на Telegram-бота'), { target: { value: 'https://t.me/mobiletrend_test_bot' } });
    fireEvent.change(screen.getByLabelText('Текст кнопки'), { target: { value: 'Стежити за замовленням' } });
    fireEvent.change(screen.getByLabelText('Скруглення кнопки'), { target: { value: '20' } });

    const publishButton = screen.getByRole('button', { name: /Опублікувати й увімкнути/u });
    await waitFor(() => expect(publishButton).toBeEnabled());
    fireEvent.click(publishButton);

    await waitFor(() => expect(api.horoshopCheckoutTelegram.publish).toHaveBeenCalled());
    expect(vi.mocked(api.horoshopCheckoutTelegram.publish).mock.calls[0][0]).toEqual(expect.objectContaining({
      telegramUrl: 'https://t.me/mobiletrend_test_bot',
      buttonText: 'Стежити за замовленням',
      buttonBorderRadius: 20,
      mobileButtonFontSize: 15,
      mobileQrSize: 208
    }));
  });

  it('shows QR limits and blocks requests for out-of-range sizes', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Telegram після замовлення' });
    fireEvent.change(screen.getByLabelText('Посилання на Telegram-бота'), { target: { value: 'https://t.me/mobiletrend_test_bot' } });
    fireEvent.change(screen.getByLabelText('Розмір QR-коду для десктопа'), { target: { value: '321' } });

    expect(screen.getByText('Вкажіть ціле число від 160 до 320 px.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Зберегти чернетку/u })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Опублікувати й увімкнути/u })).toBeDisabled();
    expect(api.horoshopCheckoutTelegram.saveDraft).not.toHaveBeenCalled();
    expect(api.horoshopCheckoutTelegram.publish).not.toHaveBeenCalled();
  });

  it('uses independent mobile QR and font sizes in the preview and publish payload', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Telegram після замовлення' });
    fireEvent.change(screen.getByLabelText('Посилання на Telegram-бота'), { target: { value: 'https://t.me/mobiletrend_test_bot' } });
    fireEvent.change(screen.getByLabelText('Розмір QR-коду для мобільного'), { target: { value: '196' } });
    fireEvent.change(screen.getByLabelText('Розмір шрифту кнопки для мобільного'), { target: { value: '19' } });
    fireEvent.click(screen.getByRole('button', { name: /Мобільний/u }));

    await waitFor(() => expect(QRCode.toDataURL).toHaveBeenCalledWith(
      'https://t.me/mobiletrend_test_bot',
      expect.objectContaining({ width: 196 })
    ));
    const previewButton = screen.getByRole('link', { name: 'Відкрити Telegram' });
    expect(previewButton).toHaveStyle({ fontSize: '19px' });

    fireEvent.click(screen.getByRole('button', { name: /Опублікувати й увімкнути/u }));
    await waitFor(() => expect(api.horoshopCheckoutTelegram.publish).toHaveBeenCalled());
    expect(vi.mocked(api.horoshopCheckoutTelegram.publish).mock.calls[0][0]).toEqual(expect.objectContaining({
      mobileQrSize: 196,
      mobileButtonFontSize: 19
    }));
  });
});
