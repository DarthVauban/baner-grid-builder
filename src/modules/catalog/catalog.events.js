import { EventEmitter } from 'node:events';

const catalogEvents = new EventEmitter();
catalogEvents.setMaxListeners(0);

const publicEventName = 'catalog:public';

function userEventName(userId) {
  return `catalog:${userId}`;
}

export function publishCatalogUpdates(userIds, payload = { type: 'refresh' }) {
  for (const userId of new Set(userIds.filter(Boolean))) {
    catalogEvents.emit(userEventName(userId), payload);
  }
}

export function subscribeToCatalogUpdates(userId, listener) {
  const name = userEventName(userId);
  catalogEvents.on(name, listener);
  return () => catalogEvents.off(name, listener);
}

export function publishPublicCatalogUpdate(payload = { type: 'refresh' }) {
  catalogEvents.emit(publicEventName, payload);
}

export function subscribeToPublicCatalogUpdates(listener) {
  catalogEvents.on(publicEventName, listener);
  return () => catalogEvents.off(publicEventName, listener);
}
