import type { BannerLinkTemplate } from '../types/workspace';

export function bannerLinkPath(baseUrl: string, targetUrl: string): string | null {
  const base = baseUrl.replace(/\/+$/u, '');
  if (targetUrl === base) return '';
  if (targetUrl.startsWith(`${base}/`)) return targetUrl.slice(base.length);
  if (targetUrl.startsWith(`${base}?`) || targetUrl.startsWith(`${base}#`)) return targetUrl.slice(base.length);
  return null;
}

export function matchBannerLinkTemplate(targetUrl: string, templates: BannerLinkTemplate[]) {
  return templates.map((template) => ({ template, path: bannerLinkPath(template.baseUrl, targetUrl) }))
    .filter((match): match is { template: BannerLinkTemplate; path: string } => match.path !== null)
    .sort((left, right) => right.template.baseUrl.length - left.template.baseUrl.length)[0] || null;
}

export function buildBannerTargetUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/u, '');
  const suffix = path.trim();
  if (!suffix) return base;
  if (suffix.startsWith('?') || suffix.startsWith('#')) return `${base}${suffix}`;
  return `${base}/${suffix.replace(/^\/+/u, '')}`;
}
