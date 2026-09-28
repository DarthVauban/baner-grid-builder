import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { ToolAccessRoute } from './ToolAccessRoute';

function renderRoute(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/tools/horoshop-stickers']}><Routes>
    <Route element={<ToolAccessRoute tool="horoshop_stickers" />}><Route path="/tools/horoshop-stickers" element={<h1>Робота зі стікерами</h1>} /></Route>
    <Route path="/tools" element={<h1>Список інструментів</h1>} />
  </Routes></MemoryRouter></QueryClientProvider>);
  return client;
}

afterEach(() => vi.restoreAllMocks());

describe('ToolAccessRoute', () => {
  it('keeps an authorized tool mounted during a failed background check and allows reopening it', async () => {
    vi.spyOn(api.users, 'toolAccess').mockResolvedValueOnce(['horoshop_stickers']).mockRejectedValue(new Error('REQUEST_TIMEOUT'));
    const client = renderRoute();
    await screen.findByRole('heading', { name: 'Робота зі стікерами' });
    await act(async () => { await client.invalidateQueries({ queryKey: ['tool-access'] }); });
    await waitFor(() => expect(client.getQueryState(['tool-access'])?.status).toBe('error'));
    expect(screen.getByRole('heading', { name: 'Робота зі стікерами' })).toBeInTheDocument();
    expect(screen.queryByText('Список інструментів')).not.toBeInTheDocument();
    cleanup();
    renderRoute(client);
    expect(await screen.findByRole('heading', { name: 'Робота зі стікерами' })).toBeInTheDocument();
  });

  it('lets the user retry an initial connection failure without treating it as denied access', async () => {
    vi.spyOn(api.users, 'toolAccess').mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValue(['horoshop_stickers']);
    renderRoute();
    expect(await screen.findByRole('alert')).toHaveTextContent('Не вдалося перевірити доступ');
    expect(screen.queryByText('Список інструментів')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Спробувати ще' }));
    expect(await screen.findByRole('heading', { name: 'Робота зі стікерами' })).toBeInTheDocument();
  });

  it('still redirects when a successful background check revokes access', async () => {
    vi.spyOn(api.users, 'toolAccess').mockResolvedValueOnce(['horoshop_stickers']).mockResolvedValue([]);
    const client = renderRoute();
    await screen.findByRole('heading', { name: 'Робота зі стікерами' });
    await act(async () => { await client.invalidateQueries({ queryKey: ['tool-access'] }); });
    expect(await screen.findByRole('heading', { name: 'Список інструментів' })).toBeInTheDocument();
  });
});
