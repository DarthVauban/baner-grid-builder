import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { ToolsPage } from './ToolsPage';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderPage(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ToolsPage /></MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ToolsPage loading recovery', () => {
  it('lets the user cancel and restart a stalled catalog request', async () => {
    vi.useFakeTimers();
    const catalogSpy = vi.spyOn(api.users, 'toolCatalog').mockImplementation((signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));

    renderPage();
    expect(screen.getByText('Завантажуємо інструменти…')).toBeInTheDocument();

    await act(async () => vi.advanceTimersByTimeAsync(8_000));
    const restart = screen.getByRole('button', { name: 'Перезапустити завантаження' });
    expect(screen.getByText('Завантаження триває довше, ніж зазвичай.')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(restart);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(catalogSpy).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Завантажуємо інструменти…')).toBeInTheDocument();
  });
});

describe('ToolsPage catalog', () => {
  it('keeps cached tools visible while a slow background refresh is pending', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['tool-catalog'], {
      tools: [{
        toolId: 'horoshop_photo_parser',
        granted: true,
        accessible: true,
        blockedByTwoFactor: false,
        requiresTwoFactor: false
      }],
      twoFactorEnabled: true
    }, { updatedAt: Date.now() - 31_000 });
    vi.spyOn(api.users, 'toolCatalog').mockImplementation(() => new Promise(() => {}));

    renderPage(client);

    expect(await screen.findByRole('link', { name: /Фото товарів Хорошоп/ })).toBeInTheDocument();
    expect(screen.queryByText('Завантажуємо інструменти…')).not.toBeInTheDocument();
  });

  it('shows Facebook group publications as a separate tool tile', async () => {
    vi.spyOn(api.users, 'toolCatalog').mockResolvedValue({
      tools: [{
        toolId: 'facebook_group_publications',
        granted: true,
        accessible: true,
        blockedByTwoFactor: false,
        requiresTwoFactor: false
      }],
      twoFactorEnabled: true
    });

    renderPage();

    const tile = await screen.findByRole('link', { name: /Публікації у міські Facebook-групи/ });
    expect(tile).toHaveAttribute('href', '/tools/facebook-publications');
  });

  it('shows the Horoshop related-products catalog as a separate tool tile', async () => {
    vi.spyOn(api.users, 'toolCatalog').mockResolvedValue({
      tools: [{
        toolId: 'horoshop_related_products',
        granted: true,
        accessible: true,
        blockedByTwoFactor: false,
        requiresTwoFactor: false
      }],
      twoFactorEnabled: true
    });

    renderPage();

    const tile = await screen.findByRole('link', { name: /Супутні товари Хорошоп/ });
    expect(tile).toHaveAttribute('href', '/tools/horoshop-related-products');
  });

  it('shows the popup banner constructor as a separate tool tile', async () => {
    vi.spyOn(api.users, 'toolCatalog').mockResolvedValue({
      tools: [{
        toolId: 'popup_banners',
        granted: true,
        accessible: true,
        blockedByTwoFactor: false,
        requiresTwoFactor: false
      }],
      twoFactorEnabled: true
    });

    renderPage();

    const tile = await screen.findByRole('link', { name: /Попап-банери/ });
    expect(tile).toHaveAttribute('href', '/tools/popup-banners');
  });

  it('shows the Horoshop catalog menu visual tool as a separate tile', async () => {
    vi.spyOn(api.users, 'toolCatalog').mockResolvedValue({
      tools: [{
        toolId: 'horoshop_catalog_menu',
        granted: true,
        accessible: true,
        blockedByTwoFactor: false,
        requiresTwoFactor: false
      }],
      twoFactorEnabled: true
    });

    renderPage();

    const tile = await screen.findByRole('link', { name: /Меню каталогу Хорошоп/u });
    expect(tile).toHaveAttribute('href', '/tools/horoshop-catalog-menu');
  });
});
