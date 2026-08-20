export type SupportDesktopNotificationPermission = NotificationPermission | 'unsupported';

const storagePrefix = 'mt-support-desktop-notifications';

function storageKey(userId: string) {
  return `${storagePrefix}:${userId}`;
}

function notificationApiAvailable() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function supportDesktopNotificationPermission(): SupportDesktopNotificationPermission {
  return notificationApiAvailable() ? Notification.permission : 'unsupported';
}

export function supportDesktopNotificationsEnabled(userId: string) {
  if (!userId || typeof localStorage === 'undefined') return false;
  return localStorage.getItem(storageKey(userId)) === 'true';
}

export function setSupportDesktopNotificationsEnabled(userId: string, enabled: boolean) {
  if (!userId || typeof localStorage === 'undefined') return;
  localStorage.setItem(storageKey(userId), enabled ? 'true' : 'false');
}

export async function requestSupportDesktopNotificationPermission(): Promise<SupportDesktopNotificationPermission> {
  if (!notificationApiAvailable()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

export function showSupportDesktopNotification(userId: string, {
  conversationId,
  visitorName,
  messagePreview
}: {
  conversationId?: string;
  visitorName?: string;
  messagePreview?: string;
}) {
  if (!supportDesktopNotificationsEnabled(userId)
    || supportDesktopNotificationPermission() !== 'granted') return false;

  const notification = new Notification(
    visitorName?.trim() ? `Нове повідомлення від ${visitorName.trim()}` : 'Нове повідомлення в онлайн-підтримці',
    {
      body: messagePreview?.trim() || 'Покупець написав у чат. Відкрийте робочий простір, щоб відповісти.',
      tag: conversationId ? `support-chat-${conversationId}` : 'support-chat-message'
    }
  );
  notification.onclick = () => {
    window.focus();
    if (window.location.pathname !== '/tools/online-support') window.location.assign('/tools/online-support');
    notification.close();
  };
  return true;
}
