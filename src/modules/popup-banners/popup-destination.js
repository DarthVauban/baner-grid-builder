export function popupDestination(value, baseOrigin, approvedHosts = []) {
  const text = String(value || '').trim();
  if (!text || /[\\\s\u0000-\u001f\u007f]/u.test(text)) return '';
  try {
    const base = new URL(baseOrigin);
    const relative = text.startsWith('/') && !text.startsWith('//');
    if (!relative && !/^https:\/\//iu.test(text)) return '';
    const url = new URL(text, base);
    if (url.username || url.password) return '';
    if (url.origin === base.origin) return url.href;
    if (relative || url.port) return '';
    const normalizeHost = (host) => host.toLowerCase().replace(/^www\./u, '');
    return [base.hostname, ...approvedHosts].some((host) => normalizeHost(host) === normalizeHost(url.hostname)) ? url.href : '';
  } catch {
    return '';
  }
}
