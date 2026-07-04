import { EventEmitter } from 'node:events';

const notificationEvents = new EventEmitter();
notificationEvents.setMaxListeners(0);

function eventName(userId) {
  return `notifications:${userId}`;
}

export function publishNotificationUpdates(userIds) {
  for (const userId of new Set(userIds.filter(Boolean))) {
    notificationEvents.emit(eventName(userId));
  }
}

export function subscribeToNotificationUpdates(userId, listener) {
  const name = eventName(userId);
  notificationEvents.on(name, listener);
  return () => notificationEvents.off(name, listener);
}
