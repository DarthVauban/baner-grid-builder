import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

    fireEvent.click(screen.getByRole('button', { name: /Імпорт XLSX/ }));
    const choiceDialog = screen.getByRole('dialog', { name: 'Що потрібно імпортувати?' });
    fireEvent.click(within(choiceDialog).getByRole('button', { name: /Facebook-групи/ }));
    const importDialog = screen.getByRole('dialog', { name: 'Імпорт Facebook-груп' });
    expect(within(importDialog).getByRole('button', { name: /Шаблон груп/ })).toBeInTheDocument();
    fireEvent.click(within(importDialog).getAllByRole('button', { name: 'Закрити' }).at(-1)!);

    fireEvent.click(screen.getByRole('button', { name: /Facebook-групи/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Експорт груп/ })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Імпорт груп/ })).toBeInTheDocument();
    const addGroup = screen.getByRole('button', { name: /Додати групу/ });
    expect(addGroup).toBeEnabled();
    fireEvent.click(addGroup);
    const groupDialog = screen.getByRole('dialog', { name: 'Нова Facebook-група' });
    expect(within(groupDialog).getAllByRole('textbox')).toHaveLength(2);
    expect(within(groupDialog).getAllByRole('checkbox')).toHaveLength(5);
    fireEvent.click(within(groupDialog).getByRole('button', { name: 'Скасувати' }));

    fireEvent.click(screen.getByRole('button', { name: /Міста й адреси/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Експорт міст/ })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Імпорт міст/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Додати місто/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Додати місто/ }));
    const cityDialog = screen.getByRole('dialog', { name: 'Нове місто' });
    expect(within(cityDialog).getAllByRole('textbox')).toHaveLength(2);
  });
});
