import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { ProductSelectionPage } from './ProductSelectionPage';

vi.mock('../dialogs/ConfirmDialogContext', () => ({
  useConfirmDialog: () => vi.fn()
}));

vi.mock('../toast/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() })
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  vi.spyOn(api.productSelections, 'list').mockResolvedValue([]);
  vi.spyOn(api.productSelections, 'catalog').mockResolvedValue({
    integration: {
      configured: true,
      storeDomain: 'shop551651.horoshop.ua',
      lastSyncAt: '2026-09-01T08:00:00.000Z'
    },
    items: [],
    categories: []
  } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ProductSelectionPage /></QueryClientProvider>);
}

describe('ProductSelectionPage editor layout', () => {
  it('separates the builder into readable workflow tabs', async () => {
    renderPage();

    expect(await screen.findByText('Вигляд товарного блоку')).toBeInTheDocument();
    expect(screen.queryByText('Каталог Хорошопа')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Товари/u }));
    expect(await screen.findByText('Каталог Хорошопа')).toBeInTheDocument();
    expect(screen.getByText('Склад вибірки')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Перегляд/u }));
    expect(await screen.findByText('Немає що показувати')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Встановлення/u }));
    expect(await screen.findByText('Спочатку збережіть вибірку')).toBeInTheDocument();
    expect(screen.getByText('1. Код сторінки')).toBeInTheDocument();
    expect(screen.getByText('2. Глобальний promo loader')).toBeInTheDocument();
  });
});
