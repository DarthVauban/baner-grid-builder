import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { SmartSearchEntry } from './SmartSearchEntry';

afterEach(() => vi.restoreAllMocks());

function renderEntry() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <SmartSearchEntry />
  </QueryClientProvider>);
}

describe('SmartSearchEntry', () => {
  it('links to the configured Search login without requesting tool grants', async () => {
    const url = 'https://smart-search.mt-panel.sbs/auth/workspace/login';
    vi.spyOn(api.smartSearch, 'entry').mockResolvedValue({ url });
    const grants = vi.spyOn(api.users, 'toolCatalog');
    renderEntry();
    expect(await screen.findByRole('link', { name: /Розумний пошук/u })).toHaveAttribute('href', url);
    expect(grants).not.toHaveBeenCalled();
  });

  it('keeps the entry visible without an active link when integration is unconfigured', async () => {
    vi.spyOn(api.smartSearch, 'entry').mockResolvedValue({ url: null });
    renderEntry();
    expect(await screen.findByText('Сервіс тимчасово недоступний.')).toBeInTheDocument();
    expect(screen.getByText('Розумний пошук')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
