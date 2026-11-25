export const mobileTrendFrameOrigins = ['https://mobiletrend.com.ua', 'https://www.mobiletrend.com.ua'];

export function widgetFrameAncestors(origins, { allowLocalHttp = false } = {}) {
  const trusted = new Set(["'self'"]);
  for (const origin of origins) {
    if (typeof origin !== 'string') continue;
    const value = origin.trim();
    if (!/^https?:\/\/(?:[\w.-]+|\[::1\])(?::\d+)?\/?$/iu.test(value)) continue;
    let url;
    try {
      url = new URL(value);
    } catch {
      continue;
    }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol === 'https:' || (allowLocalHttp && local)) trusted.add(url.origin);
  }
  return `frame-ancestors ${[...trusted].join(' ')}`;
}
