import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupportPublicSession } from '../types/support-chat';
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

describe('SupportChatWidgetApp', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionFixture = emptySession;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith('/session') && init?.method === 'POST') return response(sessionFixture);
      if (path.endsWith('/stream')) return new Response(null, { status: 204 });
      if (path.endsWith('/read')) return new Response(null, { status: 204 });
      if (path.endsWith('/messages')) return response({
        id: 'conversation-1',
        status: 'NEW',
        createdAt: '2026-08-14T10:01:00.000Z',
        updatedAt: '2026-08-14T10:01:00.000Z',
        messages: [{
          id: 'message-1', conversationId: 'conversation-1', senderType: 'visitor', senderUserId: null,
          senderName: '', body: 'Чи є товар у наявності?', productCards: [productCard], createdAt: '2026-08-14T10:01:00.000Z'
        }, {
          id: 'message-2', conversationId: 'conversation-1', senderType: 'system', senderUserId: null,
          senderName: 'Автоматична відповідь', body: sessionFixture.settings.isWithinWorkingHours ? settings.autoReplyText : settings.offlineReplyText, productCards: [], createdAt: '2026-08-14T10:01:00.000Z'
        }]
      }, 201);
      if (path.endsWith('/contact') && init?.method === 'PUT') return response({
        ...sessionFixture.visitor,
        name: 'Ірина',
        phone: '+380671234567'
      });
      throw new Error(`Unexpected request: ${path}`);
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

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
