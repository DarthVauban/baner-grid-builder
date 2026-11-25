export function storefrontPageUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    const segments = decodeURIComponent(url.pathname).split('/').filter(Boolean);
    const route = /^(?:uk|ua|ru|en)$/iu.test(segments[0]) ? 1 : 0;
    const privateRoute = /^(?:checkout|orders?|account|customer|profile|cabinet|personal|login|logout|register|auth|recover|recovery|reset|password|payments?|users?)$/iu;
    if (privateRoute.test(segments[route])) {
      const prefix = segments.slice(0, route + 1).join('/').toLowerCase();
      return `${url.origin}/${prefix}/`;
    }
    if (segments.some((segment) => segment.includes('@') || /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(segment))) return `${url.origin}/`;
    const canonical = `${url.origin}${url.pathname}`;
    return canonical.length <= 4000 ? canonical : '';
  } catch {
    return '';
  }
}
