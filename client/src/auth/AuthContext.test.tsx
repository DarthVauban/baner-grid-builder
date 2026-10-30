import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../lib/api';
import { AuthProvider, useAuth } from './AuthContext';
import type { User } from '../types/user';

function AuthStatusProbe() {
  const { status, logout } = useAuth();
  const [failed, setFailed] = useState(false);
  return <><span>{status}</span><button onClick={() => void logout().catch(() => setFailed(true))}>Log out</button>{failed && <span>Logout failed</span>}</>;
}

function renderProvider(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider><AuthStatusProbe /></AuthProvider>
    </QueryClientProvider>
  );
}

describe('AuthProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preserves the browser session during a temporary server outage', async () => {
    vi.spyOn(api.auth, 'me').mockRejectedValue(new ApiError(503, {
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Temporary outage' }
    }));

    renderProvider();

    await waitFor(() => expect(screen.getByText('unavailable')).toBeInTheDocument());
    expect(screen.queryByText('anonymous')).not.toBeInTheDocument();
  });

  it('returns to anonymous state when the session is actually invalid', async () => {
    vi.spyOn(api.auth, 'me').mockRejectedValue(new ApiError(401, {
      error: { code: 'INVALID_SESSION', message: 'Invalid session' }
    }));

    renderProvider();

    await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument());
  });

  it.each([
    new ApiError(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'Temporary outage' } }),
    new TypeError('Network unavailable')
  ])('preserves the session after failed logout and allows a successful retry (%s)', async (error) => {
    const user: User = {
      id: 'workspace-user', name: 'Test User', firstName: 'Test', lastName: 'User',
      email: 'user@example.test', department: '', position: '', avatarUrl: '', role: 'manager',
      status: 'approved', twoFactorEnabled: false, twoFactorMethod: null, twoFactorConfirmedAt: null,
      isPrimaryAdmin: false, approvedAt: null, createdAt: '', updatedAt: ''
    };
    vi.spyOn(api.auth, 'me').mockResolvedValue(user);
    const logout = vi.spyOn(api.auth, 'logout').mockRejectedValueOnce(error).mockResolvedValueOnce(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['retained-session-data'], 'retained');
    renderProvider(client);
    await screen.findByText('authenticated');

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await screen.findByText('Logout failed');
    expect(screen.getByText('authenticated')).toBeInTheDocument();
    expect(client.getQueryData(['retained-session-data'])).toBe('retained');

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await screen.findByText('anonymous');
    expect(logout).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(['retained-session-data'])).toBeUndefined();
  });
});
