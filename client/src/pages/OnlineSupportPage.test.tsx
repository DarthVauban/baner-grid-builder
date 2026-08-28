import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext';
import { api } from '../lib/api';
import { ToastProvider } from '../toast/ToastContext';
import type { SupportChatSettings, SupportConversationDetail } from '../types/support-chat';
import type { User } from '../types/user';
import { OnlineSupportPage } from './OnlineSupportPage';

const user: User = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Менеджер',
  firstName: 'Менеджер',
  lastName: '',
  email: 'manager@example.com',
  department: '',
  position: '',
  avatarUrl: '',
  role: 'manager',
  status: 'approved',
  twoFactorEnabled: false,
  twoFactorMethod: null,
  twoFactorConfirmedAt: null,
  isPrimaryAdmin: false,
  approvedAt: '2026-08-01T08:00:00.000Z',
  createdAt: '2026-08-01T08:00:00.000Z',
  updatedAt: '2026-08-01T08:00:00.000Z'
};

const conversationDetail: SupportConversationDetail = {
  conversation: {
    id: '00000000-0000-4000-8000-000000000010',
    status: 'WAITING_CUSTOMER',
    assignedUser: { id: user.id, name: user.name },
    visitor: {
      id: '00000000-0000-4000-8000-000000000011',
      name: 'Ірина',
      email: '',
      phone: '',
      firstPageUrl: '',
      lastPageUrl: '',
      lastPageTitle: 'Смартфон Apple iPhone 16',
      createdAt: '2026-08-20T08:00:00.000Z',
      lastSeenAt: '2026-08-20T08:10:00.000Z'
    },
    lastMessage: { body: 'Чи є товар у наявності?', senderType: 'visitor', createdAt: '2026-08-20T08:10:00.000Z' },
    unreadCount: 1,
    firstResponseAt: null,
    createdAt: '2026-08-20T08:00:00.000Z',
    updatedAt: '2026-08-20T08:10:00.000Z'
  },
  messages: []
};

const settings: SupportChatSettings = {
  id: '00000000-0000-4000-8000-000000000020',
  publicId: '00000000-0000-4000-8000-000000000021',
  name: 'Mobile Trend',
  enabled: true,
  allowedOrigins: [],
  accentColor: '#ffe000',
  welcomeText: 'Напишіть нам.',
  autoReplyText: 'Дякуємо за повідомлення.',
  contactFormEnabled: true,
  contactFormPrompt: 'Залиште контакти.',
  workingHoursEnabled: false,
  workingHoursTimezone: 'Europe/Kyiv',
  workingHoursSchedule: Object.fromEntries([
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
  ].map((day) => [day, { enabled: false, start: '09:00', end: '18:00' }])) as SupportChatSettings['workingHoursSchedule'],
  offlineReplyText: 'Залиште ім’я та телефон.',
  isWithinWorkingHours: true,
  updatedAt: '2026-08-20T08:00:00.000Z'
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter><OnlineSupportPage /></MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('OnlineSupportPage', () => {
  it('changes a conversation status through the branded select', async () => {
    vi.spyOn(api.auth, 'me').mockResolvedValue(user);
    vi.spyOn(api.onlineSupport, 'conversations').mockResolvedValue([conversationDetail.conversation]);
    vi.spyOn(api.onlineSupport, 'conversation').mockResolvedValue(conversationDetail);
    vi.spyOn(api.onlineSupport, 'markRead').mockResolvedValue(undefined);
    const setStatus = vi.spyOn(api.onlineSupport, 'setStatus').mockResolvedValue({
      ...conversationDetail.conversation,
      status: 'RESOLVED'
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Статус діалогу' }, { timeout: 5_000 }));
    fireEvent.click(await screen.findByRole('option', { name: 'Вирішені' }));

    await waitFor(() => expect(setStatus).toHaveBeenCalledWith(conversationDetail.conversation.id, 'RESOLVED'));
  });

  it('shows the per-device Windows notification option in settings', async () => {
    vi.spyOn(api.auth, 'me').mockResolvedValue(user);
    vi.spyOn(api.onlineSupport, 'conversations').mockResolvedValue([]);
    vi.spyOn(api.onlineSupport, 'settings').mockResolvedValue(settings);

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Налаштування' }));

    expect(await screen.findByText('Сповіщення Windows')).toBeInTheDocument();
    expect(screen.getByText(/центрі сповіщень Windows/u)).toBeInTheDocument();
  });
});
