export function nextHoroshopCatalogSyncAt(status) {
  if (!status.configured || status.status !== 'connected') return null;
  const lastSyncAt = status.lastSyncAt ? Date.parse(status.lastSyncAt) : NaN;
  if (!Number.isFinite(lastSyncAt)) return null;
  return new Date(lastSyncAt + (status.pollingIntervalMinutes || 15) * 60_000).toISOString();
}
