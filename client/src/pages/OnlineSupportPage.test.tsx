import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext';
import { api } from '../lib/api';
import { ToastProvider } from '../toast/ToastContext';
import type { SupportChatSettings, SupportConversationDetail, SupportMessage } from '../types/support-chat';
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
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter><OnlineSupportPage /></MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
  return { ...result, queryClient };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function operatorMessage(body: string, clientMessageId?: string): SupportMessage {
  return { id: '00000000-0000-4000-8000-000000000099', conversationId: conversationDetail.conversation.id,
    senderType: 'operator', senderUserId: user.id, senderName: user.name, body, clientMessageId,
    productCards: [], createdAt: settings.updatedAt };
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(api.onlineSupport, 'notificationPreference').mockResolvedValue({ enabled: false, configured: false, version: 0, updatedAt: null });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('OnlineSupportPage', () => {
  it('prefetches focused chats once, shows selected customer immediately and waits to mark history read', async () => {
    vi.spyOn(api.auth, 'me').mockResolvedValue(user);
    vi.spyOn(api.onlineSupport, 'conversations').mockResolvedValue([conversationDetail.conversation]);
    const pending = deferred<SupportConversationDetail>();
    const load = vi.spyOn(api.onlineSupport, 'conversation').mockReturnValue(pending.promise);
    const read = vi.spyOn(api.onlineSupport, 'markRead').mockResolvedValue(undefined);
    renderPage();
    const item = await screen.findByRole('button', { name: /Ірина/u });
    fireEvent.focus(item);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(read).not.toHaveBeenCalled();
    fireEvent.click(item);
    expect(screen.getByText('Завантажуємо повідомлення…')).toBeInTheDocument();
    expect(document.querySelector('.online-support-dialog__header')).toHaveTextContent('Ірина');
    expect(screen.queryByPlaceholderText('Напишіть відповідь покупцю…')).not.toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ ...conversationDetail, messages: [operatorMessage('Історія чату')] }));
    expect(await screen.findByText('Історія чату')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Напишіть відповідь покупцю…')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('aborts a discarded history request and does not show its response in the next chat', async () => {
    const other = { ...conversationDetail, conversation: { ...conversationDetail.conversation,
      id: '00000000-0000-4000-8000-000000000012', visitor: { ...conversationDetail.conversation.visitor, name: 'Олена' } }, messages: [operatorMessage('Історія Олени')] };
    vi.spyOn(api.auth, 'me').mockResolvedValue(user);
    vi.spyOn(api.onlineSupport, 'conversations').mockResolvedValue([conversationDetail.conversation,other.conversation]);
    const first = deferred<SupportConversationDetail>();
    const second = deferred<SupportConversationDetail>();
    const load = vi.spyOn(api.onlineSupport, 'conversation').mockImplementation((id) => id===other.conversation.id ? second.promise : first.promise);
    vi.spyOn(api.onlineSupport, 'markRead').mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Ірина/u }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    const previousSignal = load.mock.calls[0][1]!;
    fireEvent.click(screen.getByRole('button', { name: /Олена/u }));
    await waitFor(() => expect(previousSignal.aborted).toBe(true));
    expect(document.querySelector('.online-support-dialog__header')).toHaveTextContent('Олена');
    await act(async () => first.resolve({ ...conversationDetail, messages: [operatorMessage('Історія Ірини')] }));
    expect(screen.queryByText('Історія Ірини')).not.toBeInTheDocument();
    await act(async () => second.resolve(other));
    expect(await screen.findByText('Історія Олени')).toBeInTheDocument();
    expect(screen.queryByText('Історія Ірини')).not.toBeInTheDocument();
  });

  it('offers a retry when chat history fails while retaining the selected customer', async () => {
    vi.spyOn(api.auth, 'me').mockResolvedValue(user);
    vi.spyOn(api.onlineSupport, 'conversations').mockResolvedValue([conversationDetail.conversation]);
    const load = vi.spyOn(api.onlineSupport, 'conversation').mockRejectedValueOnce(new Error('Timeout')).mockResolvedValueOnce(conversationDetail);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Ірина/u }));
    fireEvent.click(await screen.findByRole('button', { name: 'Повторити завантаження' }));
    expect(await screen.findByPlaceholderText('Напишіть відповідь покупцю…')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

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
    expect(composer).toHaveValue('');
    expect(screen.getByText('Не надіслано')).toBeInTheDocument();
    expect(screen.getAllByText('Відповідь')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Повторити надсилання' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[0]?.[2]).toBe(send.mock.calls[1]?.[2]);
  });

  it('clears the composer and shows the reply on Enter before the server answers', async () => {
    vi.spyOn(api.auth, 'me').mockResolvedValue(user);
    vi.spyOn(api.onlineSupport, 'conversations').mockResolvedValue([conversationDetail.conversation]);
    const refresh = deferred<SupportConversationDetail>();
    vi.spyOn(api.onlineSupport, 'conversation').mockResolvedValueOnce(conversationDetail).mockReturnValue(refresh.promise);
    const read = vi.spyOn(api.onlineSupport, 'markRead').mockResolvedValue(undefined);
    const request = deferred<SupportMessage>();
    const send = vi.spyOn(api.onlineSupport, 'sendMessage').mockReturnValue(request.promise);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Ірина/u }));
    const composer = await screen.findByPlaceholderText('Напишіть відповідь покупцю…');
    fireEvent.change(composer, { target: { value: 'Миттєва відповідь' } });
    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(composer).toHaveValue('');
    expect(screen.getByText('Миттєва відповідь')).toBeInTheDocument();
    expect(screen.getByText('Надсилання…')).toBeInTheDocument();
    fireEvent.keyDown(composer, { key: 'Enter' });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(read).not.toHaveBeenCalled();

    fireEvent.change(composer, { target: { value: 'Наступна чернетка' } });
    const sent = operatorMessage('Миттєва відповідь', send.mock.calls[0]?.[2]);
    await act(async () => request.resolve(sent));
    await waitFor(() => expect(screen.queryByText('Надсилання…')).not.toBeInTheDocument());
    expect(composer).toHaveValue('Наступна чернетка');
    expect(screen.getAllByText(sent.body)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Надіслати' })).not.toBeDisabled();
    await act(async () => refresh.resolve({ ...conversationDetail, messages: [sent] }));
    expect(screen.getAllByText(sent.body)).toHaveLength(1);
  });

  it('keeps a newer draft when a send fails and retries the original reply separately', async () => {
    vi.spyOn(api.auth, 'me').mockResolvedValue(user);
    vi.spyOn(api.onlineSupport, 'conversations').mockResolvedValue([conversationDetail.conversation]);
    vi.spyOn(api.onlineSupport, 'conversation').mockResolvedValue(conversationDetail);
    const request = deferred<SupportMessage>();
    const send = vi.spyOn(api.onlineSupport, 'sendMessage').mockReturnValueOnce(request.promise)
      .mockResolvedValueOnce(operatorMessage('Перша відповідь'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Ірина/u }));
    const composer = await screen.findByPlaceholderText('Напишіть відповідь покупцю…');
    fireEvent.change(composer, { target: { value: 'Перша відповідь' } });
    fireEvent.submit(composer.closest('form')!);
    fireEvent.change(composer, { target: { value: 'Нова чернетка' } });
    await act(async () => request.reject(new Error('Мережа недоступна')));
    await screen.findByText('Мережа недоступна');
    expect(composer).toHaveValue('Нова чернетка');
    expect(screen.getByText('Перша відповідь')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторити надсилання' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
    expect(composer).toHaveValue('Нова чернетка');
    await waitFor(() => expect(screen.queryByText('Не надіслано')).not.toBeInTheDocument());
  });

  it('does not overwrite another conversation draft when the previous send finishes', async () => {
    const other = { ...conversationDetail, conversation: { ...conversationDetail.conversation,
      id: '00000000-0000-4000-8000-000000000012', visitor: { ...conversationDetail.conversation.visitor, name: 'Олена' } } };
    vi.spyOn(api.auth, 'me').mockResolvedValue(user);
    vi.spyOn(api.onlineSupport, 'conversations').mockResolvedValue([conversationDetail.conversation, other.conversation]);
    const load = vi.spyOn(api.onlineSupport, 'conversation').mockImplementation(async (id) => id === other.conversation.id ? other : conversationDetail);
    const request = deferred<SupportMessage>();
    vi.spyOn(api.onlineSupport, 'sendMessage').mockReturnValue(request.promise);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Ірина/u }));
    let composer = await screen.findByPlaceholderText('Напишіть відповідь покупцю…');
    fireEvent.change(composer, { target: { value: 'Відповідь Ірині' } });
    fireEvent.submit(composer.closest('form')!);
    fireEvent.click(screen.getByRole('button', { name: /Олена/u }));
    await waitFor(() => expect(load).toHaveBeenCalledWith(other.conversation.id, expect.any(AbortSignal)));
    composer = await screen.findByPlaceholderText('Напишіть відповідь покупцю…');
    fireEvent.change(composer, { target: { value: 'Чернетка для Олени' } });
    await act(async () => request.resolve(operatorMessage('Відповідь Ірині')));
    expect(composer).toHaveValue('Чернетка для Олени');
    expect(screen.queryByText('Відповідь Ірині')).not.toBeInTheDocument();
  });

  it.each(['success', 'timeout'])('merges a live history update without duplicates or false failures (%s)', async (outcome) => {
    vi.spyOn(api.auth, 'me').mockResolvedValue(user);
    vi.spyOn(api.onlineSupport, 'conversations').mockResolvedValue([conversationDetail.conversation]);
    const load = vi.spyOn(api.onlineSupport, 'conversation').mockResolvedValue(conversationDetail);
    vi.spyOn(api.onlineSupport, 'markRead').mockResolvedValue(undefined);
    const request = deferred<SupportMessage>();
    const send = vi.spyOn(api.onlineSupport, 'sendMessage').mockReturnValue(request.promise);
    const { queryClient } = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Ірина/u }));
    const composer = await screen.findByPlaceholderText('Напишіть відповідь покупцю…');
    fireEvent.change(composer, { target: { value: 'Відповідь через SSE' } });
    fireEvent.submit(composer.closest('form')!);
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    const sent = operatorMessage('Відповідь через SSE', send.mock.calls[0]?.[2]);
    const updated = { ...conversationDetail, messages: [sent] };
    load.mockResolvedValue(updated);
    act(() => queryClient.setQueryData(['online-support-conversation', conversationDetail.conversation.id], updated));
    expect(screen.getAllByText(sent.body)).toHaveLength(1);
    await act(async () => {
      if (outcome === 'success') request.resolve(sent);
      else request.reject(new Error('Timeout after commit'));
    });
    expect(screen.getAllByText(sent.body)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Повторити надсилання' })).not.toBeInTheDocument();
    expect(screen.queryByText('Timeout after commit')).not.toBeInTheDocument();
  });

  it('keeps an accepted reply visible when refreshing the history fails', async () => {
    vi.spyOn(api.auth, 'me').mockResolvedValue(user);
    vi.spyOn(api.onlineSupport, 'conversations').mockResolvedValue([conversationDetail.conversation]);
    const load = vi.spyOn(api.onlineSupport, 'conversation').mockResolvedValueOnce(conversationDetail)
      .mockRejectedValue(new Error('Помилка оновлення історії'));
    vi.spyOn(api.onlineSupport, 'sendMessage').mockResolvedValue(operatorMessage('Збережена відповідь'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Ірина/u }));
    const composer = await screen.findByPlaceholderText('Напишіть відповідь покупцю…');
    fireEvent.change(composer, { target: { value: 'Збережена відповідь' } });
    fireEvent.submit(composer.closest('form')!);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Збережена відповідь')).toBeInTheDocument();
    expect(screen.queryByText('Не надіслано')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Повторити надсилання' })).not.toBeInTheDocument();
    expect(composer).toHaveValue('');
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
    expect(loadConversation).toHaveBeenCalledWith(conversationDetail.conversation.id, expect.any(AbortSignal));
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
    expect(loadConversation).toHaveBeenCalledWith(conversationDetail.conversation.id, expect.any(AbortSignal));
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
