import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../lib/api';
import { AuthProvider, useAuth } from './AuthContext';

function AuthStatusProbe() {
  const { status } = useAuth();
  return <span>{status}</span>;
}

function renderProvider() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
});
