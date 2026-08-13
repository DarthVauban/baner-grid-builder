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

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
});
