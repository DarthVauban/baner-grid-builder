import { EventEmitter } from 'node:events';

const events = new EventEmitter();
events.setMaxListeners(0);

const operatorChannel = 'support-chat:operators';
const visitorChannel = (visitorId) => `support-chat:visitor:${visitorId}`;

export function publishSupportChatUpdate(payload) {
  events.emit(operatorChannel, payload);
  if (payload.visitorId) events.emit(visitorChannel(payload.visitorId), payload);
}

export function subscribeToSupportOperatorUpdates(listener) {
  events.on(operatorChannel, listener);
  return () => events.off(operatorChannel, listener);
}

export function subscribeToSupportVisitorUpdates(visitorId, listener) {
  const channel = visitorChannel(visitorId);
  events.on(channel, listener);
  return () => events.off(channel, listener);
}
