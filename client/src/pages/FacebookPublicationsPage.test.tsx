import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { FacebookPublicationsPage } from './FacebookPublicationsPage';

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-id', name: 'Admin', role: 'admin' } })
}));

vi.mock('../toast/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() })
}));

vi.mock('../dialogs/ConfirmDialogContext', () => ({
  useConfirmDialog: () => vi.fn().mockResolvedValue(true)
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><FacebookPublicationsPage /></QueryClientProvider>);
}

describe('FacebookPublicationsPage', () => {
  beforeEach(() => {
    vi.spyOn(api.facebookPublications, 'stores').mockResolvedValue([]);
    vi.spyOn(api.facebookPublications, 'groups').mockResolvedValue([]);
    vi.spyOn(api.facebookPublications, 'campaigns').mockResolvedValue([]);
    vi.spyOn(api.facebookPublications, 'history').mockResolvedValue([]);
  });

  it('exposes the manual workflow and admin directories', async () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Публікації у міські Facebook-групи' })).toBeInTheDocument();
    expect(screen.getByText('Фінальна публікація завжди ручна')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Імпорт XLSX/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Магазини/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Додати магазин/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Додати магазин/ }));
    expect(screen.getByRole('dialog', { name: 'Новий магазин' })).toBeInTheDocument();
  });
});
