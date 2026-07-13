import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

const applicationEvents = new EventEmitter();
applicationEvents.setMaxListeners(0);

function eventName(userId) {
  return `applications:${userId}`;
}

export function publishApplicationUpdates(userIds, payload = { type: 'refresh' }) {
  const event = {
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    ...payload
  };
  for (const userId of new Set(userIds.filter(Boolean))) {
    applicationEvents.emit(eventName(userId), event);
  }
}

export function subscribeToApplicationUpdates(userId, listener) {
  const name = eventName(userId);
  applicationEvents.on(name, listener);
  return () => applicationEvents.off(name, listener);
}
