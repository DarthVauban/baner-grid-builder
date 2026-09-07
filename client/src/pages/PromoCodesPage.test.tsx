import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import { ToastProvider } from '../toast/ToastContext';
import type { PromoCode } from '../types/promo-code';
import { PromoCodesPage } from './PromoCodesPage';

const code: PromoCode = {
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
  campaigns: [{ id: 'campaign-1', name: 'Осіння кампанія', campaignType: 'promo_code', status: 'active' }],
  createdAt: '2026-09-07T08:00:00.000Z',
  updatedAt: '2026-09-07T08:00:00.000Z'
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmDialogProvider>
          <MemoryRouter><PromoCodesPage /></MemoryRouter>
        </ConfirmDialogProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.spyOn(api.popupBanners, 'options').mockResolvedValue({
    integration: {
      id: 'connection-1', generation: 'generation-1', storeDomain: 'mobiletrend.com.ua',
      status: 'connected', lastSyncAt: '2026-09-07T08:00:00.000Z'
    },
    stickers: [], brands: [], conditions: [], categories: []
  });
  vi.spyOn(api.promoCodes, 'list').mockResolvedValue([code]);
});

afterEach(() => vi.restoreAllMocks());

describe('PromoCodesPage', () => {
  it('shows the store-scoped library and campaign usage', async () => {
    renderPage();

    expect(await screen.findByText('AUTUMN10')).toBeInTheDocument();
    expect(screen.getByText('mobiletrend.com.ua')).toBeInTheDocument();
    expect(screen.getByText('10% знижки')).toBeInTheDocument();
    expect(screen.getByText(/Кампанії: Осіння кампанія/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Видалити промокод' })).toBeDisabled();
  });

  it('keeps numeric input editable while creating a code', async () => {
    const create = vi.spyOn(api.promoCodes, 'create').mockResolvedValue({ ...code, id: 'new-code', discountValue: 14 });
    renderPage();
    await screen.findByText('AUTUMN10');

    fireEvent.click(screen.getByRole('button', { name: /Новий промокод/u }));
    fireEvent.change(screen.getByLabelText('Внутрішня назва'), { target: { value: 'Тест 14' } });
    fireEvent.change(screen.getByLabelText('Промокод'), { target: { value: 'TEST14' } });
    const discount = screen.getByLabelText('Знижка, %');
    fireEvent.change(discount, { target: { value: '1' } });
    expect(discount).toHaveValue('1');
    fireEvent.change(discount, { target: { value: '14' } });
    expect(discount).toHaveValue('14');
    fireEvent.click(screen.getByRole('button', { name: /Зберегти промокод/u }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      internalName: 'Тест 14', code: 'TEST14', discountValue: 14, type: 'percent_coupon'
    }), expect.anything()));
  });
});
