import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { AppShell } from './AppShell';

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'workspace-user', name: 'Test User', role: 'manager', avatarUrl: '' }, logout: vi.fn() })
}));
vi.mock('../toast/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('./NotificationCenter', () => ({ NotificationCenter: () => null }));
vi.mock('./HoroshopCatalogSyncIndicator', () => ({ HoroshopCatalogSyncIndicator: () => null }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('keeps support heartbeats cheap while real updates invalidate the queue and affected chat', async () => {
  const streams: EventTarget[] = [];
  vi.stubGlobal('EventSource', class extends EventTarget {
    constructor() { super(); streams.push(this); }
    close() {}
  });
  vi.stubGlobal('Audio', class { preload = ''; volume = 0; pause() {} });
  vi.spyOn(api.users, 'toolAccess').mockResolvedValue(['online_support']);
  vi.spyOn(api.onlineSupport, 'unreadCount').mockResolvedValue(0);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client,'invalidateQueries');
  render(<QueryClientProvider client={client}><MemoryRouter><AppShell /></MemoryRouter></QueryClientProvider>);
  await waitFor(() => expect(streams).toHaveLength(1));
  act(() => streams[0].dispatchEvent(new MessageEvent('support',{data:JSON.stringify({type:'heartbeat'})})));
  expect(invalidate).not.toHaveBeenCalled();
  act(() => streams[0].dispatchEvent(new MessageEvent('support',{data:JSON.stringify({type:'message',senderType:'operator',conversationId:'selected-chat'})})));
  expect(invalidate).toHaveBeenCalledWith({queryKey:['online-support-conversations']});
  expect(invalidate).toHaveBeenCalledWith({queryKey:['online-support-unread-count']});
  expect(invalidate).toHaveBeenCalledWith({queryKey:['online-support-conversation','selected-chat']});
});
