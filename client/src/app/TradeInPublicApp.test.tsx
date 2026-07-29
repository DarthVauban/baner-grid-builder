import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TradeInPublicApp } from './TradeInPublicApp';

const apiMocks = vi.hoisted(() => ({
  previewSettings: vi.fn(),
  publicSettings: vi.fn(),
  submitPreviewApplication: vi.fn(),
  submitApplication: vi.fn()
}));

vi.mock('../lib/api', () => ({
  api: {
    tradeIn: apiMocks
  }
}));

vi.mock('../components/trade-in/TradeInPublicPage', () => ({
  TradeInPublicPage: ({ preview, onSubmit }: { preview?: boolean; onSubmit?: (values: Record<string, string>) => Promise<unknown> }) => (
    <button data-testid="trade-in-public-page" data-preview={String(preview)} onClick={() => void onSubmit?.({ category: 'smartphone' })}>Надіслати</button>
  )
}));

function renderApp(pathname: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false }
    }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[pathname]}>
        <TradeInPublicApp />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('TradeInPublicApp', () => {
  beforeEach(() => {
    apiMocks.previewSettings.mockReset();
    apiMocks.publicSettings.mockReset();
    apiMocks.submitPreviewApplication.mockReset();
    apiMocks.submitApplication.mockReset();
    apiMocks.previewSettings.mockResolvedValue({ config: { seo: { title: 'Trade-in preview' } } });
    apiMocks.publicSettings.mockResolvedValue({ config: { seo: { title: 'Trade-in' } } });
    apiMocks.submitPreviewApplication.mockResolvedValue({ number: '00001' });
    apiMocks.submitApplication.mockResolvedValue({ number: '00002' });
  });

  it('loads the saved draft for the canonical portal preview route', async () => {
    renderApp('/trade-in/preview/storefront');

    expect(await screen.findByTestId('trade-in-public-page')).toHaveAttribute('data-preview', 'true');
    await waitFor(() => expect(apiMocks.previewSettings).toHaveBeenCalledTimes(1));
    expect(apiMocks.publicSettings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('trade-in-public-page'));
    await waitFor(() => expect(apiMocks.submitPreviewApplication).toHaveBeenCalledWith(expect.objectContaining({
      values: { category: 'smartphone' }
    })));
    expect(apiMocks.submitApplication).not.toHaveBeenCalled();
  });

  it('keeps the public route connected to published settings', async () => {
    renderApp('/trade-in');

    expect(await screen.findByTestId('trade-in-public-page')).toHaveAttribute('data-preview', 'false');
    await waitFor(() => expect(apiMocks.publicSettings).toHaveBeenCalledTimes(1));
    expect(apiMocks.previewSettings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('trade-in-public-page'));
    await waitFor(() => expect(apiMocks.submitApplication).toHaveBeenCalledWith(expect.objectContaining({
      values: { category: 'smartphone' }
    })));
    expect(apiMocks.submitPreviewApplication).not.toHaveBeenCalled();
  });
});
