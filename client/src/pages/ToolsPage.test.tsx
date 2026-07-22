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
