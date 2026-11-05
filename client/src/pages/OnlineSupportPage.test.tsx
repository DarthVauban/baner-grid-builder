import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(api.onlineSupport, 'notificationPreference').mockResolvedValue({ enabled: false, configured: false, version: 0, updatedAt: null });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('OnlineSupportPage', () => {
  it('never imports browser localStorage or OS permission as an account opt-in', async () => {
    vi.spyOn(api.auth, 'me').mockResolvedValue(user);
    vi.spyOn(api.onlineSupport, 'conversations').mockResolvedValue([]);
    vi.spyOn(api.onlineSupport, 'settings').mockResolvedValue(settings);
    const save = vi.spyOn(api.onlineSupport, 'setNotificationPreference');
    localStorage.setItem(`mt-support-desktop-notifications:${user.id}`, 'true');
    vi.stubGlobal('Notification', class { static permission = 'granted'; });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Налаштування' }));
    expect(await screen.findByRole('checkbox', { name: 'Підписка на сповіщення підтримки' })).not.toBeChecked();
    expect(save).not.toHaveBeenCalled();
  });

  it('uses the current server version for explicit opt-in', async () => {
    vi.spyOn(api.auth, 'me').mockResolvedValue(user);
    vi.spyOn(api.onlineSupport, 'conversations').mockResolvedValue([]);
    vi.spyOn(api.onlineSupport, 'settings').mockResolvedValue(settings);
    const save = vi.spyOn(api.onlineSupport, 'setNotificationPreference').mockResolvedValue({ enabled: true, configured: true, version: 1, updatedAt: settings.updatedAt });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Налаштування' }));
    const checkbox = await screen.findByRole('checkbox', { name: 'Підписка на сповіщення підтримки' });
    await waitFor(() => expect(checkbox).not.toBeDisabled());
    fireEvent.click(checkbox);
    await waitFor(() => expect(save).toHaveBeenCalledWith(true, 0));
  });

  it('keeps the same clientMessageId when retrying a failed operator send', async () => {
    vi.spyOn(api.auth, 'me').mockResolvedValue(user);
    vi.spyOn(api.onlineSupport, 'conversations').mockResolvedValue([conversationDetail.conversation]);
    vi.spyOn(api.onlineSupport, 'conversation').mockResolvedValue(conversationDetail);
    const send = vi.spyOn(api.onlineSupport, 'sendMessage').mockRejectedValueOnce(new Error('Network timeout')).mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000099', conversationId: conversationDetail.conversation.id,
      senderType: 'operator', senderUserId: user.id, senderName: user.name, body: 'Відповідь', productCards: [], createdAt: settings.updatedAt
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Ірина/u }));
    const composer = await screen.findByPlaceholderText('Напишіть відповідь покупцю…');
    fireEvent.change(composer, { target: { value: 'Відповідь' } });
    fireEvent.submit(composer.closest('form')!);
    await screen.findByText('Network timeout');
    fireEvent.submit(composer.closest('form')!);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[0]?.[2]).toBe(send.mock.calls[1]?.[2]);
  });

  it.each(['visible', 'hidden', 'outside'] as const)('acknowledges only a rendered visible tail (%s)', async (visibility) => {
    vi.spyOn(api.auth, 'me').mockResolvedValue(user);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(visibility === 'outside' ? 'visible' : visibility);
    if (visibility === 'outside') vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { bottom: this.classList.contains('online-support-message') ? 200 : 100 } as DOMRect;
    });
    vi.spyOn(api.onlineSupport, 'conversations').mockResolvedValue([conversationDetail.conversation]);
    const message = { id: '00000000-0000-4000-8000-000000000098', conversationId: conversationDetail.conversation.id,
      senderType: 'visitor' as const, senderUserId: null, senderName: '', body: 'Показане повідомлення', productCards: [], createdAt: settings.updatedAt };
    vi.spyOn(api.onlineSupport, 'conversation').mockResolvedValue({ ...conversationDetail, messages: [message] });
    const read = vi.spyOn(api.onlineSupport, 'markRead').mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Ірина/u }));
    await screen.findByText(message.body);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (visibility === 'visible') await waitFor(() => expect(read).toHaveBeenCalledWith(conversationDetail.conversation.id, message.id));
    else expect(read).not.toHaveBeenCalled();
  });
  it('changes a conversation status through the branded select', async () => {
    vi.spyOn(api.auth, 'me').mockResolvedValue(user);
    vi.spyOn(api.onlineSupport, 'conversations').mockResolvedValue([conversationDetail.conversation]);
    const loadConversation = vi.spyOn(api.onlineSupport, 'conversation').mockResolvedValue(conversationDetail);
    vi.spyOn(api.onlineSupport, 'markRead').mockResolvedValue(undefined);
    const setStatus = vi.spyOn(api.onlineSupport, 'setStatus').mockResolvedValue({
      ...conversationDetail.conversation,
      status: 'RESOLVED'
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Ірина/u }));
    expect(loadConversation).toHaveBeenCalledWith(conversationDetail.conversation.id);
    fireEvent.click(await screen.findByRole('button', { name: 'Статус діалогу' }, { timeout: 5_000 }));
    fireEvent.click(await screen.findByRole('option', { name: 'Вирішені' }));

    await waitFor(() => expect(setStatus).toHaveBeenCalledWith(conversationDetail.conversation.id, 'RESOLVED'));
  });

  it('waits for a click before opening a conversation', async () => {
    vi.spyOn(api.auth, 'me').mockResolvedValue(user);
    vi.spyOn(api.onlineSupport, 'conversations').mockResolvedValue([conversationDetail.conversation]);
    const loadConversation = vi.spyOn(api.onlineSupport, 'conversation').mockResolvedValue(conversationDetail);
    const markRead = vi.spyOn(api.onlineSupport, 'markRead').mockResolvedValue(undefined);

    renderPage();
    const conversation = await screen.findByRole('button', { name: /Ірина/u });
    expect(screen.getByRole('heading', { name: 'Оберіть діалог' })).toBeInTheDocument();
    expect(loadConversation).not.toHaveBeenCalled();
    expect(markRead).not.toHaveBeenCalled();

    fireEvent.click(conversation);
    expect(await screen.findByRole('button', { name: 'Статус діалогу' })).toBeInTheDocument();
    expect(loadConversation).toHaveBeenCalledWith(conversationDetail.conversation.id);
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
