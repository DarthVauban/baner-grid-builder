import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { copyToClipboard } from '../lib/banner-generator';
import type { ToolId } from '../types/tool';
import { HoroshopWidgetsPage } from './HoroshopWidgetsPage';

vi.mock('../lib/banner-generator', () => ({ copyToClipboard: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../toast/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

afterEach(() => vi.restoreAllMocks());

function renderPage(ids: ToolId[], blocked: ToolId[] = []) {
  vi.spyOn(api.users, 'toolCatalog').mockResolvedValue({
    tools: ids.map((toolId) => ({
      toolId,
      granted: true,
      accessible: !blocked.includes(toolId),
      blockedByTwoFactor: blocked.includes(toolId),
      requiresTwoFactor: blocked.includes(toolId)
    })),
    twoFactorEnabled: blocked.length === 0
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><HoroshopWidgetsPage /></MemoryRouter></QueryClientProvider>);
}

describe('HoroshopWidgetsPage', () => {
  it('shows one copyable global script and only storefront widget tools', async () => {
    renderPage([
      'popup_banners', 'horoshop_title_labels', 'horoshop_cart_theme', 'horoshop_catalog_menu',
      'horoshop_checkout_telegram', 'online_support', 'form_builder', 'product_selection'
    ]);

    const code = await screen.findByText((value) => value.includes('/api/public/horoshop-widgets/embed.js'));
    expect(code).toHaveTextContent(`<script async src="${window.location.origin}/api/public/horoshop-widgets/embed.js"></script>`);
    expect(screen.getByText('8 у переліку')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Кнопки форм/u })).toHaveAttribute('href', '/tools/form-buttons');
    expect(screen.getByRole('link', { name: /Telegram після замовлення/u })).toHaveAttribute('href', '/tools/horoshop-checkout-telegram');
    expect(screen.getByRole('link', { name: /Промооформлення добірок/u })).toHaveAttribute('href', '/tools/product-selection');
    expect(screen.queryByText('Мапа магазинів')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Копіювати скрипт' }));
    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith(code.textContent));
  });

  it('keeps a widget requiring 2FA visible without an active link', async () => {
    renderPage(['form_builder'], ['form_builder']);
    expect(await screen.findByText('Кнопки форм')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Кнопки форм/u })).not.toBeInTheDocument();
    expect(screen.getByText('Для відкриття увімкніть 2FA у профілі.')).toBeInTheDocument();
  });
});
