import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupportPublicConversation, SupportPublicSession } from '../types/support-chat';
import { SupportChatWidgetApp } from './SupportChatWidgetApp';

const workingHoursSchedule = {
  monday: { enabled: true, start: '09:00', end: '18:00' },
  tuesday: { enabled: true, start: '09:00', end: '18:00' },
  wednesday: { enabled: true, start: '09:00', end: '18:00' },
  thursday: { enabled: true, start: '09:00', end: '18:00' },
  friday: { enabled: true, start: '09:00', end: '18:00' },
  saturday: { enabled: false, start: '10:00', end: '17:00' },
  sunday: { enabled: false, start: '10:00', end: '17:00' }
};

const settings = {
  id: 'site-internal',
  publicId: '11111111-1111-4111-8111-111111111111',
  name: 'Mobile Trend Support',
  enabled: true,
  allowedOrigins: [],
  accentColor: '#ffe000',
  welcomeText: 'Опишіть, будь ласка, ваше питання.',
  autoReplyText: 'Дякуємо! Зачекайте на відповідь оператора.',
  contactFormEnabled: true,
  contactFormPrompt: 'Залиште контакт, якщо бажаєте.',
  workingHoursEnabled: false,
  workingHoursTimezone: 'Europe/Kyiv',
  workingHoursSchedule,
  offlineReplyText: 'Зараз ми не працюємо. Залиште ім’я та номер телефону.',
  isWithinWorkingHours: true,
  updatedAt: '2026-08-14T10:00:00.000Z'
};

const visitor = {
  id: 'visitor-1', name: '', email: '', phone: '', firstPageUrl: '', lastPageUrl: '', lastPageTitle: '',
  createdAt: '2026-08-14T10:00:00.000Z', lastSeenAt: '2026-08-14T10:00:00.000Z'
};

const productCard = {
  id: 'product-1', productId: 'product-1', modificationId: null,
  title: 'Apple iPhone 16 128GB Black', sku: 'IPHONE-16', brand: 'Apple',
  price: '35999', oldPrice: '37999', currency: 'UAH', availability: 'В наявності',
  visible: true, active: true, imageUrl: 'https://cdn.example/iphone-16.jpg',
  url: 'https://mobiletrend.com.ua/apple-iphone-16/', source: 'page' as const
};

const emptySession: SupportPublicSession = {
  token: 'visitor-token-with-more-than-thirty-two-characters',
  settings,
  visitor,
  conversation: null
};

let sessionFixture = emptySession;

function response<T>(data: T, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function visitorConversation(body: string, clientMessageId: string): SupportPublicConversation {
  return { id: 'conversation-1', status: 'NEW', createdAt: settings.updatedAt, updatedAt: settings.updatedAt,
    messages: [{ id: 'message-1', conversationId: 'conversation-1', senderType: 'visitor', senderUserId: null,
      senderName: '', body, clientMessageId, sequence: '1', productCards: [productCard], createdAt: settings.updatedAt },
    { id: 'message-2', conversationId: 'conversation-1', senderType: 'system', senderUserId: null,
      senderName: 'Автоматична відповідь', body: sessionFixture.settings.isWithinWorkingHours ? settings.autoReplyText : settings.offlineReplyText,
      sequence: '2', productCards: [], createdAt: settings.updatedAt }] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('SupportChatWidgetApp', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionFixture = emptySession;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith('/session') && init?.method === 'POST') return response(sessionFixture);
      if (path.endsWith('/stream')) return new Response(null, { status: 204 });
      if (path.endsWith('/read')) return new Response(null, { status: 204 });
      if (path.endsWith('/messages')) {
        const inputBody = JSON.parse(String(init?.body)) as { body: string; clientMessageId: string };
        return response(visitorConversation(inputBody.body, inputBody.clientMessageId), 201);
      }
      if (path.endsWith('/contact') && init?.method === 'PUT') return response({
        ...sessionFixture.visitor,
        name: 'Ірина',
        phone: '+380671234567'
      });
      throw new Error(`Unexpected request: ${path}`);
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('shows the first message immediately and preserves the next draft while waiting', async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    const request = deferred<Response>();
    let sentInput: { body: string; clientMessageId: string } | undefined;
    vi.mocked(fetch).mockImplementation((input, init) => {
      if (String(input).endsWith('/messages')) {
        sentInput = JSON.parse(String(init?.body));
        return request.promise;
      }
      return original(input, init);
    });
    render(<SupportChatWidgetApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Відкрити онлайн-підтримку' }));
    await screen.findByText(settings.welcomeText);
    const composer = screen.getByPlaceholderText('Напишіть повідомлення…');
    fireEvent.change(composer, { target: { value: 'Миттєве питання' } });
    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(composer).toHaveValue('');
    expect(screen.getByText('Миттєве питання')).toBeInTheDocument();
    expect(screen.getByText('Надсилання…')).toBeInTheDocument();
    expect(screen.queryByText('Чим можемо допомогти?')).not.toBeInTheDocument();
    expect(screen.queryByText('Залишити контакти')).not.toBeInTheDocument();
    fireEvent.change(composer, { target: { value: 'Наступна чернетка' } });
    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(composer).toHaveValue('Наступна чернетка');
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input).endsWith('/messages'))).toHaveLength(1);
    await act(async () => request.resolve(response(visitorConversation(sentInput!.body, sentInput!.clientMessageId))));
    expect(screen.queryByText('Надсилання…')).not.toBeInTheDocument();
    expect(screen.getAllByText('Миттєве питання')).toHaveLength(1);
    expect(composer).toHaveValue('Наступна чернетка');
    expect(screen.getByText(settings.autoReplyText)).toBeInTheDocument();
  });

  it('retains a failed message and retries the same payload without clearing a newer draft', async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    const request = deferred<Response>();
    const payloads: Array<{ body: string; clientMessageId: string }> = [];
    vi.mocked(fetch).mockImplementation((input, init) => {
      if (String(input).endsWith('/messages')) {
        const payload = JSON.parse(String(init?.body));
        payloads.push(payload);
        return payloads.length === 1 ? request.promise : Promise.resolve(response(visitorConversation(payload.body, payload.clientMessageId)));
      }
      return original(input, init);
    });
    render(<SupportChatWidgetApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Відкрити онлайн-підтримку' }));
    await screen.findByText(settings.welcomeText);
    const composer = screen.getByPlaceholderText('Напишіть повідомлення…');
    fireEvent.change(composer, { target: { value: 'Не загубіть питання' } });
    fireEvent.submit(composer.closest('form')!);
    fireEvent.change(composer, { target: { value: 'Ще одне питання' } });
    await act(async () => request.reject(new Error('Мережа недоступна')));
    expect(await screen.findByText('Не надіслано')).toBeInTheDocument();
    expect(screen.getByText('Не загубіть питання')).toBeInTheDocument();
    expect(composer).toHaveValue('Ще одне питання');
    fireEvent.click(screen.getByRole('button', { name: 'Повторити надсилання' }));
    await waitFor(() => expect(payloads).toHaveLength(2));
    expect(payloads[1]).toEqual(payloads[0]);
    await waitFor(() => expect(screen.queryByText('Не надіслано')).not.toBeInTheDocument());
    expect(screen.queryByText('Мережа недоступна')).not.toBeInTheDocument();
    expect(screen.getAllByText('Не загубіть питання')).toHaveLength(1);
    expect(composer).toHaveValue('Ще одне питання');
  });

  it.each(['success', 'timeout', 'late confirmation'])('keeps a newer SSE history without duplicate or failed messages after a late POST (%s)', async (outcome) => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    const request = deferred<Response>();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
    let snapshot = emptySession;
    let sentInput!: { body: string; clientMessageId: string };
    vi.mocked(fetch).mockImplementation((input, init) => {
      const path = String(input);
      if (path.endsWith('/messages')) { sentInput = JSON.parse(String(init?.body)); return request.promise; }
      if (path.endsWith('/stream')) return Promise.resolve(new Response(stream));
      if (path.endsWith('/session') && !init?.method) return Promise.resolve(response(snapshot));
      return original(input, init);
    });
    render(<SupportChatWidgetApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Відкрити онлайн-підтримку' }));
    await screen.findByText(settings.welcomeText);
    const composer = screen.getByPlaceholderText('Напишіть повідомлення…');
    fireEvent.change(composer, { target: { value: 'Питання з підтвердженням SSE' } });
    fireEvent.submit(composer.closest('form')!);
    fireEvent.change(composer, { target: { value: 'Нова чернетка' } });
    const sent = visitorConversation(sentInput.body, sentInput.clientMessageId);
    snapshot = { ...emptySession, conversation: { ...sent, updatedAt: '2026-08-14T10:02:00.000Z', messages: [...sent.messages,
      { id: 'operator-3', conversationId: sent.id, senderType: 'operator', senderUserId: 'operator-1', senderName: 'Менеджер',
        body: 'Нова відповідь оператора', sequence: '3', productCards: [], createdAt: '2026-08-14T10:02:00.000Z' }] } };
    if (outcome === 'late confirmation') {
      await act(async () => request.reject(new Error('Timeout after commit')));
      expect(screen.getByText('Не надіслано')).toBeInTheDocument();
      expect(screen.getByText('Timeout after commit')).toBeInTheDocument();
    }
    await act(async () => controller.enqueue(new TextEncoder().encode('event: support\ndata: {}\n\n')));
    await screen.findByText('Нова відповідь оператора');
    expect(screen.getAllByText(sentInput.body)).toHaveLength(1);
    await act(async () => {
      if (outcome === 'success') request.resolve(response(sent));
      else if (outcome === 'timeout') request.reject(new Error('Timeout after commit'));
    });
    expect(screen.getByText('Нова відповідь оператора')).toBeInTheDocument();
    expect(screen.getAllByText(sentInput.body)).toHaveLength(1);
    expect(screen.queryByText('Не надіслано')).not.toBeInTheDocument();
    expect(screen.queryByText('Timeout after commit')).not.toBeInTheDocument();
    expect(composer).toHaveValue('Нова чернетка');
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input).endsWith('/stream'))).toHaveLength(1);
    await act(async () => controller.close());
  });

  it('opens directly into free-form messaging and shows the optional contact form after the automatic reply', async () => {
    const user = userEvent.setup();
    render(<SupportChatWidgetApp />);

    await user.click(screen.getByRole('button', { name: 'Відкрити онлайн-підтримку' }));
    expect(await screen.findByText('Опишіть, будь ласка, ваше питання.')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Напишіть повідомлення…'), 'Чи є товар у наявності?');
    await user.click(screen.getByRole('button', { name: 'Надіслати повідомлення' }));

    expect(await screen.findByText(settings.autoReplyText)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Відкрити товар Apple iPhone 16 128GB Black' })).toHaveAttribute('href', productCard.url);
    expect(screen.getByText('Залишити контакти')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ім’я (необов’язково)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Email (необов’язково)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Телефон (необов’язково)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Напишіть повідомлення…')).toBeEnabled();

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/public/support-chat/messages',
      expect.objectContaining({ method: 'POST' })
    ));
  });

  it('requires a name and phone in the contact form outside working hours', async () => {
    sessionFixture = {
      ...emptySession,
      settings: { ...settings, workingHoursEnabled: true, isWithinWorkingHours: false }
    };
    const user = userEvent.setup();
    render(<SupportChatWidgetApp />);

    await user.click(screen.getByRole('button', { name: 'Відкрити онлайн-підтримку' }));
    await user.type(screen.getByPlaceholderText('Напишіть повідомлення…'), 'Передзвоніть мені');
    await user.click(screen.getByRole('button', { name: 'Надіслати повідомлення' }));

    expect(await screen.findByText(settings.offlineReplyText)).toBeInTheDocument();
    expect(screen.getByText('Залиште ім’я та телефон')).toBeInTheDocument();
    const name = screen.getByPlaceholderText('Ім’я *');
    const phone = screen.getByPlaceholderText('Номер телефону *');
    expect(name).toBeRequired();
    expect(phone).toBeRequired();
    const save = screen.getByRole('button', { name: 'Зберегти' });
    expect(save).toBeDisabled();

    await user.type(name, 'Ірина');
    await user.type(phone, '+380671234567');
    expect(save).toBeEnabled();
    await user.click(save);
    expect(await screen.findByText('Контакти збережено. Дякуємо!')).toBeInTheDocument();
  });
});
