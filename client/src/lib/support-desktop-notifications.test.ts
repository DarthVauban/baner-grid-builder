import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  requestSupportDesktopNotificationPermission,
  setSupportDesktopNotificationsEnabled,
  showSupportDesktopNotification,
  supportDesktopNotificationsEnabled,
  withSupportNotificationSubscription
} from './support-desktop-notifications';

class NotificationMock {
  static permission: NotificationPermission = 'default';
  static requestPermission = vi.fn(async () => NotificationMock.permission);
  static instances: NotificationMock[] = [];
  onclick: (() => void) | null = null;
  close = vi.fn();

  constructor(public title: string, public options?: NotificationOptions) {
    NotificationMock.instances.push(this);
  }
}

afterEach(() => {
  localStorage.clear();
  NotificationMock.permission = 'default';
  NotificationMock.requestPermission.mockClear();
  NotificationMock.instances = [];
  vi.unstubAllGlobals();
});

describe('support desktop notifications', () => {
  it('a fresh server opt-out overrides old local true and lookup failure does not alert', async () => {
    NotificationMock.permission = 'granted';
    vi.stubGlobal('Notification', NotificationMock);
    setSupportDesktopNotificationsEnabled('user-1', true);
    const server = vi.fn().mockResolvedValue({ enabled: false });
    const notify = () => { showSupportDesktopNotification('user-1', { messagePreview: 'private message' }); };
    expect(await withSupportNotificationSubscription(server, notify)).toBe(false);
    expect(NotificationMock.instances).toHaveLength(0);
    server.mockRejectedValueOnce(new Error('offline'));
    expect(await withSupportNotificationSubscription(server, notify)).toBe(false);
    expect(NotificationMock.instances).toHaveLength(0);
    server.mockResolvedValueOnce({ enabled: true });
    expect(await withSupportNotificationSubscription(server, notify)).toBe(true);
    expect(NotificationMock.instances).toHaveLength(1);
  });
  it('stores the preference separately for each workspace user', () => {
    setSupportDesktopNotificationsEnabled('user-1', true);
    expect(supportDesktopNotificationsEnabled('user-1')).toBe(true);
    expect(supportDesktopNotificationsEnabled('user-2')).toBe(false);
  });

  it('requests permission only when the browser has not decided yet', async () => {
    NotificationMock.permission = 'granted';
    vi.stubGlobal('Notification', NotificationMock);
    expect(await requestSupportDesktopNotificationPermission()).toBe('granted');
    expect(NotificationMock.requestPermission).not.toHaveBeenCalled();
  });

  it('shows a native notification only for an enabled user with permission', () => {
    NotificationMock.permission = 'granted';
    vi.stubGlobal('Notification', NotificationMock);
    setSupportDesktopNotificationsEnabled('user-1', true);

    expect(showSupportDesktopNotification('user-1', {
      conversationId: 'conversation-1',
      visitorName: 'Ірина',
      messagePreview: 'Підкажіть, будь ласка, чи є товар у наявності?'
    })).toBe(true);
    expect(NotificationMock.instances[0]?.title).toBe('Нове повідомлення від Ірина');
    expect(NotificationMock.instances[0]?.options?.tag).toBe('support-chat-conversation-1');
    expect(showSupportDesktopNotification('user-2', {})).toBe(false);
  });
});
