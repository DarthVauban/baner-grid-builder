import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import { ToastProvider } from '../toast/ToastContext';
import type { HoroshopTitleLabelSettings } from '../types/horoshop-title-labels';
import { HoroshopTitleLabelsPage } from './HoroshopTitleLabelsPage';

const settings: HoroshopTitleLabelSettings = {
  publicId: '11111111-1111-4111-8111-111111111111',
  enabled: true,
  draftRules: [{
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Вживана техніка',
    text: 'Вживаний',
    stickerKeys: ['id:used'],
    backgroundColor: '#202020',
    textColor: '#ffe101',
    borderColor: '#202020',
    borderRadius: 4,
    enabled: true
  }],
  publishedRules: [],
  publishedVersion: 2,
  storeDomain: 'mobiletrend.com.ua',
  lastCatalogSyncAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
  publishedAt: '2026-09-01T08:00:00.000Z',
  embedCode: '<script async src="https://workspace.example.com/api/public/horoshop-title-labels/embed.js?site=11111111-1111-4111-8111-111111111111"></script>',
  stickerOptions: [
    { key: 'id:used', id: 'used', title: 'Вживаний', productCount: 84 },
    { key: 'id:sale', id: 'sale', title: 'Акція', productCount: 16 }
  ]
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><ToastProvider><ConfirmDialogProvider><HoroshopTitleLabelsPage /></ConfirmDialogProvider></ToastProvider></QueryClientProvider>);
}

beforeEach(() => {
  vi.spyOn(api.horoshopTitleLabels, 'settings').mockResolvedValue(settings);
  vi.spyOn(api.horoshopTitleLabels, 'saveDraft').mockResolvedValue(settings);
  vi.spyOn(api.horoshopTitleLabels, 'publish').mockResolvedValue(settings);
  vi.spyOn(api.horoshopTitleLabels, 'setEnabled').mockResolvedValue(settings);
});

afterEach(() => vi.restoreAllMocks());

describe('HoroshopTitleLabelsPage', () => {
  it('keeps rules, appearance and sticker bindings in separate readable sections', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Лейбли товарів' })).toBeInTheDocument();
    expect(screen.getByText(/сторінці товару, у картках вітрини та в кошику/u)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Текст і стиль' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Стікери Хорошопа' })).toBeInTheDocument();
    expect(screen.getByText(/84 товарів/u)).toBeInTheDocument();
    expect(screen.getByText('Сторінка товару')).toBeInTheDocument();
    expect(screen.getByText('Картки вітрини')).toBeInTheDocument();
    expect(screen.getByText('Кошик')).toBeInTheDocument();
  });

  it('binds one label to several stickers and publishes the ordered rules', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Лейбли товарів' });

    fireEvent.click(screen.getByRole('checkbox', { name: /Акція/u }));
    expect(screen.getByText('2 вибрано')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Текст лейбла' }), { target: { value: 'Перевірений' } });

    fireEvent.click(screen.getByRole('button', { name: /Зберегти/u }));
    await waitFor(() => expect(api.horoshopTitleLabels.saveDraft).toHaveBeenCalled());
    const savedRules = vi.mocked(api.horoshopTitleLabels.saveDraft).mock.calls[0][0];
    expect(savedRules[0].stickerKeys).toEqual(['id:used', 'id:sale']);
    expect(savedRules[0].text).toBe('Перевірений');

    fireEvent.click(screen.getByRole('button', { name: /Опублікувати/u }));
    await waitFor(() => expect(api.horoshopTitleLabels.publish).toHaveBeenCalled());
    expect(vi.mocked(api.horoshopTitleLabels.publish).mock.calls[0][0][0].stickerKeys).toHaveLength(2);
  });
});
