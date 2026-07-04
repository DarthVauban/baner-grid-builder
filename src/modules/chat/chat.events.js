import { EventEmitter } from 'node:events';

const chatEvents = new EventEmitter();
chatEvents.setMaxListeners(0);

function eventName(userId) {
  return `chat:${userId}`;
}

export function publishChatUpdates(userIds, payload = { type: 'refresh' }) {
  for (const userId of new Set(userIds.filter(Boolean))) chatEvents.emit(eventName(userId), payload);
}

export function subscribeToChatUpdates(userId, listener) {
  const name = eventName(userId);
  chatEvents.on(name, listener);
  return () => chatEvents.off(name, listener);
}
