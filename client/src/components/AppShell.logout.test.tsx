import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { AppShell } from './AppShell';

const mocks = vi.hoisted(() => ({ logout: vi.fn(), showToast: vi.fn() }));
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'workspace-user', name: 'Test User', role: 'manager', avatarUrl: '' }, logout: mocks.logout })
}));
vi.mock('../toast/ToastContext', () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock('./NotificationCenter', () => ({ NotificationCenter: () => null }));
vi.mock('./HoroshopCatalogSyncIndicator', () => ({ HoroshopCatalogSyncIndicator: () => null }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('AppShell logout', () => {
  it('reports an unconfirmed logout and leaves a retry available', async () => {
    vi.spyOn(api.users, 'toolAccess').mockResolvedValue([]);
    mocks.logout.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(undefined);
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><AppShell /></MemoryRouter>
    </QueryClientProvider>);

    const logout = screen.getByRole('button', { name: 'Вийти' });
    await userEvent.click(logout);
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith('Не вдалося завершити вихід. Спробуйте ще раз.', 'error'));
    expect(logout).toBeEnabled();
    await userEvent.click(logout);
    await waitFor(() => expect(mocks.logout).toHaveBeenCalledTimes(2));
    expect(mocks.showToast).toHaveBeenCalledTimes(1);
  });
});
